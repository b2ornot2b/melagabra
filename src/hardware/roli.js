// hardware/roli.js — WebMIDI client for the ROLI Lightpad Block.
// Wraps navigator.requestMIDIAccess({sysex:true}), connects to the first port
// whose name matches /Lightpad|ROLI|Block/i, pushes raga state via SysEx, and
// surfaces incoming MPE touches + custom-SysEx button events as JS callbacks.

import * as S from "./sysex.js";

const LIGHTPAD_NAME_RE = /lightpad|roli|block/i;

// MIDI status nibbles (high nibble after channel masking)
const NOTE_OFF        = 0x80;
const NOTE_ON         = 0x90;
const POLY_PRESSURE   = 0xA0;
const CONTROL_CHANGE  = 0xB0;
const PROGRAM_CHANGE  = 0xC0;
const CHANNEL_PRESSURE = 0xD0;
const PITCH_BEND      = 0xE0;
const SYSEX           = 0xF0;

// MPE convention: lower zone = master ch 1, member channels 2..16.
// (Some implementations split into two zones; we treat all of 2..16 as the
//  one allocator pool and ignore master-channel events.)
const MPE_MEMBER_LOW  = 1;   // 0-indexed channel 1 = MIDI ch 2
const MPE_MEMBER_HIGH = 15;  // 0-indexed channel 15 = MIDI ch 16

export class RoliBlock {
  constructor(callbacks = {}) {
    this.onConnect     = callbacks.onConnect     || (() => {});
    this.onDisconnect  = callbacks.onDisconnect  || (() => {});
    this.onTouchStart  = callbacks.onTouchStart  || (() => {});
    this.onTouchMove   = callbacks.onTouchMove   || (() => {});
    this.onTouchEnd    = callbacks.onTouchEnd    || (() => {});
    this.onButton      = callbacks.onButton      || (() => {});
    this.onHello       = callbacks.onHello       || (() => {});
    this.onModeChanged = callbacks.onModeChanged || (() => {});

    this.access  = null;
    this.input   = null;
    this.output  = null;
    this.connected = false;

    // Per-MPE-channel touch state
    this._touches = new Map();   // channel(0..15) → { midi, vel, x:bend, y:cc74, z:pressure, startedAt }

    // Outbound seq counter (so the Block can detect echoed-back state)
    this._outSeq = 0;

    // Echo suppression of inbound SysEq state changes that originated from us
    this._lastSentSeq = -1;

    // Bound listener for cleanup
    this._onMidiMessage = (e) => this._handleMidiMessage(e);
    this._onStateChange = (e) => this._handleStateChange(e);
  }

  // ─── Connection ────────────────────────────────────────────

  async connect() {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      throw new Error("Web MIDI is not available in this browser");
    }
    const access = await navigator.requestMIDIAccess({ sysex: true });
    return this.connectWithAccess(access);
  }

  async connectWithAccess(access) {
    this.access = access;
    this.access.addEventListener("statechange", this._onStateChange);

    // Locate input + output that look like a Lightpad
    for (const input of access.inputs.values()) {
      if (LIGHTPAD_NAME_RE.test(input.name || "")) {
        this.input = input;
        break;
      }
    }
    for (const output of access.outputs.values()) {
      if (LIGHTPAD_NAME_RE.test(output.name || "")) {
        this.output = output;
        break;
      }
    }
    // Fallback: if there's exactly one input and one output, just take them.
    if (!this.input && access.inputs.size === 1) this.input = access.inputs.values().next().value;
    if (!this.output && access.outputs.size === 1) this.output = access.outputs.values().next().value;

    if (!this.input || !this.output) {
      throw new Error("Lightpad Block not found among MIDI ports");
    }

    if (this.input.open) await this.input.open();
    if (this.output.open) await this.output.open();
    this.input.addEventListener("midimessage", this._onMidiMessage);

    this.connected = true;
    this.onConnect({
      inputName:  this.input.name  || "(unknown)",
      outputName: this.output.name || "(unknown)",
      manufacturer: this.input.manufacturer || ""
    });
    return this;
  }

  disconnect() {
    if (this.input) {
      this.input.removeEventListener("midimessage", this._onMidiMessage);
    }
    if (this.access) {
      this.access.removeEventListener("statechange", this._onStateChange);
    }
    this.input = null;
    this.output = null;
    this.access = null;
    this.connected = false;
    this._touches.clear();
    this.onDisconnect();
  }

  _handleStateChange(e) {
    if (e.port && e.port.state === "disconnected") {
      // Was it our port?
      if (this.input && e.port.id === this.input.id) this.disconnect();
      else if (this.output && e.port.id === this.output.id) this.disconnect();
    }
  }

  // ─── Outbound (Web → Block) ─────────────────────────────────

  _send(bytes) {
    if (!this.output) return;
    this.output.send(bytes);
  }

  _nextSeq() {
    this._outSeq = (this._outSeq + 1) & 0x7F;
    this._lastSentSeq = this._outSeq;
    return this._outSeq;
  }

  sendRagaState(bits, isVivadi, roughMask, _seqOverride) {
    const seq = (_seqOverride ?? this._nextSeq()) & 0x7F;
    this._send(S.encodeRagaState(bits, !!isVivadi, seq));
    if (typeof roughMask === "number") {
      this._send(S.encodeRoughMask(roughMask, seq));
    }
  }

  sendMelaInfo(n, forteId, _seqOverride) {
    const seq = (_seqOverride ?? this._nextSeq()) & 0x7F;
    this._send(S.encodeMelaInfo(n, forteId, seq));
  }

  sendOctaveShift(shift, _seqOverride) {
    const seq = (_seqOverride ?? this._nextSeq()) & 0x7F;
    this._send(S.encodeOctaveShift(shift, seq));
  }

  sendFallbackMode(useStandardCC, _seqOverride) {
    const seq = (_seqOverride ?? this._nextSeq()) & 0x7F;
    this._send(S.encodeFallbackMode(useStandardCC, seq));
  }

  sendHeartbeat(counter) {
    this._send(S.encodeHeartbeatReq(counter & 0x7F));
  }

  // ─── Inbound (Block → Web) ──────────────────────────────────

  _handleMidiMessage(e) {
    const data = e.data;
    if (!data || data.length === 0) return;
    const status = data[0];

    // SysEx (custom commands from Block)
    if (status === SYSEX) {
      try {
        const decoded = S.decode(data);
        this._handleSysEx(decoded);
      } catch (err) {
        // Likely a non-Melagabra SysEx (Roli prefix etc.) — ignore.
        console.debug("[roli] ignoring non-Melagabra SysEx:", err.message);
      }
      return;
    }

    const channel = status & 0x0F;
    const cmd = status & 0xF0;

    // Standard CC fallback mode (single-touch synthesis from CC 16/17/18)
    if (cmd === CONTROL_CHANGE && channel === 0) {
      if (data[1] === 16 || data[1] === 17 || data[1] === 18 || data[1] === 20) {
        this._handleStandardCCFallback(data[1], data[2]);
        return;
      }
    }

    if (channel < MPE_MEMBER_LOW || channel > MPE_MEMBER_HIGH) {
      return;     // ignore master channel / non-MPE channel
    }

    switch (cmd) {
      case NOTE_ON: {
        const midi = data[1];
        const vel = data[2];
        if (vel === 0) { this._endTouch(channel); break; }
        const t = { midi, vel, x: 0, y: 0, z: 0, startedAt: performance.now() };
        this._touches.set(channel, t);
        this.onTouchStart({ channel, midi, vel, x: 0, y: 0, z: 0 });
        break;
      }
      case NOTE_OFF: {
        this._endTouch(channel);
        break;
      }
      case PITCH_BEND: {
        const value = (data[1] | (data[2] << 7)) - 8192;   // signed 14-bit
        const t = this._touches.get(channel);
        if (t) {
          t.x = value;
          this.onTouchMove({ channel, midi: t.midi, x: value, y: t.y, z: t.z });
        }
        break;
      }
      case CONTROL_CHANGE: {
        if (data[1] === 74) {
          const t = this._touches.get(channel);
          if (t) {
            t.y = data[2];
            this.onTouchMove({ channel, midi: t.midi, x: t.x, y: t.y, z: t.z });
          }
        }
        break;
      }
      case CHANNEL_PRESSURE: {
        const t = this._touches.get(channel);
        if (t) {
          t.z = data[1];
          this.onTouchMove({ channel, midi: t.midi, x: t.x, y: t.y, z: t.z });
        }
        break;
      }
      case POLY_PRESSURE: {
        const t = this._touches.get(channel);
        if (t) {
          t.z = data[2];
          this.onTouchMove({ channel, midi: t.midi, x: t.x, y: t.y, z: t.z });
        }
        break;
      }
      default:
        // ignore PROGRAM_CHANGE etc.
        break;
    }
  }

  _endTouch(channel) {
    const t = this._touches.get(channel);
    if (!t) return;
    this._touches.delete(channel);
    this.onTouchEnd({ channel, midi: t.midi, durationMs: performance.now() - t.startedAt });
  }

  _handleSysEx(decoded) {
    switch (decoded.cmd) {
      case S.CMD.HELLO: {
        this.onHello(decoded.payload);
        break;
      }
      case S.CMD.HEARTBEAT_ACK: {
        // optional heartbeat liveness consumer; ignored for now
        break;
      }
      case S.CMD.BUTTON: {
        if (decoded.seq === this._lastSentSeq) return;   // echo, drop
        this.onButton(decoded.payload.buttonId);
        break;
      }
      default:
        break;   // SET_* commands echoed by the block — ignore
    }
  }

  _handleStandardCCFallback(cc, value) {
    // Single-touch synthetic event when host is in non-MPE mode.
    // Treat CC20 = tile-id (0..143 across the 12×12 PC grid) as the press
    // address; CC16/17/18 as X/Y/Z.
    if (cc === 20) {
      const tile = value;
      const pc  = tile % 12;
      const row = Math.floor(tile / 12);
      this.onTouchStart({ channel: 0, midi: 60 + pc + 12 * (row - 2), vel: 100, x: 0, y: 0, z: 0, fallback: true });
      return;
    }
    // X/Y/Z updates on the most recent fallback touch
    const last = this._touches.get(0);
    if (!last) return;
    if (cc === 16) last.x = value;
    if (cc === 17) last.y = value;
    if (cc === 18) last.z = value;
    this.onTouchMove({ channel: 0, midi: last.midi, x: last.x, y: last.y, z: last.z, fallback: true });
  }
}
