// hardware/sysex.js — pure encoder/decoder for the Melagabra ↔ Lightpad
// custom SysEx protocol. No DOM, no Web MIDI, no side effects.  Unit-tested
// in pure Node by `roli-tests.mjs`.

// SysEx framing: F0 7D 4D <cmd> <payload…> F7
//                ─── ── ──
//                start mfg sub  ('M' for Melagabra)
//
// Manufacturer ID 0x7D is the MIDI-spec-reserved non-commercial / educational
// range (MMA SP-005). Suitable for prototypes; do not ship products on 0x7D.

export const SYSEX_START = 0xF0;
export const SYSEX_END   = 0xF7;
export const MFG_ID      = 0x7D;
export const SUB_ID      = 0x4D;   // 'M'

// Command IDs ---------------------------------------------------
export const CMD = {
  // Web → Block
  SET_RAGA:        0x01,
  SET_ROUGH_MASK:  0x02,
  SET_MELA_INFO:   0x03,
  SET_OCTAVE:      0x04,
  SET_FALLBACK:    0x05,
  SET_MODE:        0x06,
  HEARTBEAT_REQ:   0x0F,
  // Block → Web
  HEARTBEAT_ACK:   0x10,
  BUTTON:          0x11,
  HELLO:           0x12,  // sent on Block boot
  MODE_CHANGED:    0x13   // sent when the on-Block mode key cycles modes
};

// Block-mode IDs in CMD.SET_MODE / CMD.MODE_CHANGED payload
export const MODE = {
  MELAGABRA:   0x00,    // canonical Carnatic-yantra layout (default)
  PASSTHROUGH: 0x01,    // flat 15×15 chromatic MPE pad; algebra disabled
  DEMO:        0x02     // auto-walk the Gray-code path, hands free
};
export const MODE_COUNT = 3;

// Button IDs in CMD.BUTTON payload
export const BUTTON = {
  K1:        0x01,
  K2:        0x02,
  K3:        0x03,
  OCT_UP:    0x04,
  OCT_DOWN:  0x05,
  DRONE:     0x06
};

// ─── 12-bit ↔ 7-bit-safe split ─────────────────────────────────
// MIDI data bytes are 7-bit; SysEx payload bytes must have the high bit clear.
// Split a 12-bit vector into two 6-bit halves so each fits comfortably in a
// 7-bit data byte with bit-7 = 0.

function packU12(vec) {
  if ((vec | 0) !== vec || vec < 0 || vec > 0xFFF) {
    throw new RangeError(`vec out of 12-bit range: ${vec}`);
  }
  return [(vec >> 6) & 0x3F, vec & 0x3F];
}
function unpackU12(msb, lsb) {
  return ((msb & 0x3F) << 6) | (lsb & 0x3F);
}

function popcount12(v) {
  let n = 0;
  for (let i = 0; i < 12; i++) if (v & (1 << i)) n++;
  return n;
}

// ─── Encoders ─────────────────────────────────────────────────

export function encodeRagaState(bits, isVivadi, seq = 0) {
  const [msb, lsb] = packU12(bits);
  // popcount-7 check is a *soft* requirement — the Block will still render
  // arbitrary 12-bit vectors during transitional animations.  But callers
  // sending a final raga state should always send a popcount-7 vector.
  // We do not throw here; that's enforced upstream where the data lives.
  const flags = (isVivadi ? 0x01 : 0x00);
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_RAGA, msb, lsb, flags, seq & 0x7F, SYSEX_END]);
}

export function encodeRoughMask(mask, seq = 0) {
  const [msb, lsb] = packU12(mask);
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_ROUGH_MASK, msb, lsb, seq & 0x7F, SYSEX_END]);
}

export function encodeMelaInfo(n, forteId, seq = 0) {
  if (n < 1 || n > 72) throw new RangeError(`mela n out of range 1..72: ${n}`);
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_MELA_INFO, n & 0x7F, forteId & 0x7F, seq & 0x7F, SYSEX_END]);
}

export function encodeOctaveShift(shift, seq = 0) {
  // shift is signed (-2..+2); store as offset (shift + 2) → 0..4
  if (shift < -2 || shift > 2) throw new RangeError(`octaveShift out of range: ${shift}`);
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_OCTAVE, (shift + 2) & 0x7F, seq & 0x7F, SYSEX_END]);
}

export function encodeFallbackMode(useStandardCC, seq = 0) {
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_FALLBACK, useStandardCC ? 1 : 0, seq & 0x7F, SYSEX_END]);
}

export function encodeSetMode(mode, seq = 0) {
  if ((mode | 0) !== mode || mode < 0 || mode >= MODE_COUNT) {
    throw new RangeError(`mode out of range 0..${MODE_COUNT - 1}: ${mode}`);
  }
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.SET_MODE, mode & 0x7F, seq & 0x7F, SYSEX_END]);
}

export function encodeModeChanged(mode) {
  if ((mode | 0) !== mode || mode < 0 || mode >= MODE_COUNT) {
    throw new RangeError(`mode out of range 0..${MODE_COUNT - 1}: ${mode}`);
  }
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.MODE_CHANGED, mode & 0x7F, SYSEX_END]);
}

export function encodeHeartbeatReq(counter) {
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.HEARTBEAT_REQ, counter & 0x7F, SYSEX_END]);
}

// Block → Web.  Useful for the Node mock that emulates Block behaviour.
export function encodeButton(buttonId, seq = 0) {
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.BUTTON, buttonId & 0x7F, seq & 0x7F, SYSEX_END]);
}

export function encodeHeartbeatAck(counter) {
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.HEARTBEAT_ACK, counter & 0x7F, SYSEX_END]);
}

export function encodeHello(firmwareMajor, firmwareMinor) {
  return new Uint8Array([SYSEX_START, MFG_ID, SUB_ID, CMD.HELLO, firmwareMajor & 0x7F, firmwareMinor & 0x7F, SYSEX_END]);
}

// ─── Decoder ──────────────────────────────────────────────────

export function decode(bytes) {
  // Accept Uint8Array, Array, or Iterable<number>
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (b.length < 5) throw new Error("sysex too short");
  if (b[0] !== SYSEX_START) throw new Error(`expected F0 start, got ${b[0].toString(16)}`);
  if (b[b.length - 1] !== SYSEX_END) throw new Error(`expected F7 end, got ${b[b.length - 1].toString(16)}`);
  if (b[1] !== MFG_ID) throw new Error(`bad manufacturer id 0x${b[1].toString(16)}, expected 0x7D`);
  if (b[2] !== SUB_ID) throw new Error(`bad sub-id 0x${b[2].toString(16)}, expected 0x4D ('M')`);
  // Verify all payload bytes are 7-bit clean
  for (let i = 1; i < b.length - 1; i++) {
    if (b[i] & 0x80) throw new Error(`non-7-bit payload byte at index ${i}: 0x${b[i].toString(16)}`);
  }

  const cmd = b[3];
  const payload = b.slice(4, b.length - 1);

  switch (cmd) {
    case CMD.SET_RAGA: {
      if (payload.length !== 4) throw new Error("SET_RAGA expects 4 payload bytes");
      const bits     = unpackU12(payload[0], payload[1]);
      const isVivadi = !!(payload[2] & 0x01);
      const seq      = payload[3] & 0x7F;
      return { cmd, payload: { bits, isVivadi }, seq };
    }
    case CMD.SET_ROUGH_MASK: {
      if (payload.length !== 3) throw new Error("SET_ROUGH_MASK expects 3 payload bytes");
      const mask = unpackU12(payload[0], payload[1]);
      const seq  = payload[2] & 0x7F;
      return { cmd, payload: { mask }, seq };
    }
    case CMD.SET_MELA_INFO: {
      if (payload.length !== 3) throw new Error("SET_MELA_INFO expects 3 payload bytes");
      return { cmd, payload: { n: payload[0], forteId: payload[1] }, seq: payload[2] };
    }
    case CMD.SET_OCTAVE: {
      if (payload.length !== 2) throw new Error("SET_OCTAVE expects 2 payload bytes");
      return { cmd, payload: { shift: (payload[0] & 0x7F) - 2 }, seq: payload[1] };
    }
    case CMD.SET_FALLBACK: {
      if (payload.length !== 2) throw new Error("SET_FALLBACK expects 2 payload bytes");
      return { cmd, payload: { useStandardCC: !!payload[0] }, seq: payload[1] };
    }
    case CMD.SET_MODE: {
      if (payload.length !== 2) throw new Error("SET_MODE expects 2 payload bytes");
      const mode = payload[0] & 0x7F;
      if (mode >= MODE_COUNT) throw new Error(`SET_MODE: unknown mode ${mode}`);
      return { cmd, payload: { mode }, seq: payload[1] };
    }
    case CMD.MODE_CHANGED: {
      if (payload.length !== 1) throw new Error("MODE_CHANGED expects 1 payload byte");
      const mode = payload[0] & 0x7F;
      if (mode >= MODE_COUNT) throw new Error(`MODE_CHANGED: unknown mode ${mode}`);
      return { cmd, payload: { mode } };
    }
    case CMD.HEARTBEAT_REQ:
    case CMD.HEARTBEAT_ACK: {
      if (payload.length !== 1) throw new Error("HEARTBEAT expects 1 payload byte");
      return { cmd, payload: { counter: payload[0] } };
    }
    case CMD.BUTTON: {
      if (payload.length !== 2) throw new Error("BUTTON expects 2 payload bytes");
      return { cmd, payload: { buttonId: payload[0] }, seq: payload[1] };
    }
    case CMD.HELLO: {
      if (payload.length !== 2) throw new Error("HELLO expects 2 payload bytes");
      return { cmd, payload: { firmwareMajor: payload[0], firmwareMinor: payload[1] } };
    }
    default:
      throw new Error(`unknown command 0x${cmd.toString(16)}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────

export { popcount12, packU12, unpackU12 };

// Build the rough-PC bitmask from an array of pitch classes 0..11.
// Bit i is set iff pc i is "rough" (extremal vivadi adjacent to Sa or Pa).
export function bitmaskFromPCs(pcs) {
  let m = 0;
  for (const pc of pcs) {
    if (pc < 0 || pc > 11) continue;
    m |= (1 << pc);
  }
  return m;
}
