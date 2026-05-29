// roli-tests.mjs — pure-Node tests for sysex.js and the RoliBlock state
// machine.  Run with: node docs/hardware/roli-tests.mjs

import * as S from "./sysex.js";

let pass = 0, fail = 0;
function check(label, cond, info = "") {
  if (cond) { pass++; console.log("  ✓", label, info); }
  else      { fail++; console.log("  ✗", label, info); }
}
function expectThrow(label, fn) {
  try { fn(); check(label, false, "(did not throw)"); }
  catch (e) { check(label, true, "(threw: " + e.message.slice(0, 60) + ")"); }
}

// ─── Round-trip: every 12-bit vector ───────────────────────────
console.log("\n[1] 12-bit round-trip (all 0..0xFFF, vivadi flag both)");
{
  let ok = true;
  for (let v = 0; v <= 0xFFF; v++) {
    for (const flag of [false, true]) {
      const enc = S.encodeRagaState(v, flag, v & 0x7F);
      // 7-bit payload check
      for (let i = 1; i < enc.length - 1; i++) {
        if (enc[i] & 0x80) { ok = false; break; }
      }
      const dec = S.decode(enc);
      if (dec.cmd !== S.CMD.SET_RAGA) { ok = false; break; }
      if (dec.payload.bits !== v) { ok = false; break; }
      if (dec.payload.isVivadi !== flag) { ok = false; break; }
      if (dec.seq !== (v & 0x7F)) { ok = false; break; }
    }
    if (!ok) break;
  }
  check("4096 × 2 round-trips", ok);
}

// ─── 7-bit-safe payload bytes ──────────────────────────────────
console.log("\n[2] All payload bytes 7-bit-safe (no 0x80+ leakage)");
{
  let leaks = 0;
  for (let v = 0; v <= 0xFFF; v++) {
    const enc = S.encodeRagaState(v, true, 0);
    for (let i = 1; i < enc.length - 1; i++) {
      if (enc[i] & 0x80) leaks++;
    }
  }
  check("Zero high-bit payload bytes across 4096 frames", leaks === 0, `(leaks=${leaks})`);
}

// ─── No 0xF0 / 0xF7 inside payload (would re-frame mid-stream) ──
console.log("\n[3] Reserved framing bytes do not appear inside payload");
{
  let collisions = 0;
  for (let v = 0; v <= 0xFFF; v++) {
    const enc = S.encodeRagaState(v, false, 0);
    for (let i = 1; i < enc.length - 1; i++) {
      if (enc[i] === 0xF0 || enc[i] === 0xF7) collisions++;
    }
  }
  check("Zero F0/F7 inside payload across 4096 frames", collisions === 0, `(collisions=${collisions})`);
}

// ─── encodeRoughMask round-trip ────────────────────────────────
console.log("\n[4] Rough mask round-trip");
{
  let ok = true;
  for (let m = 0; m <= 0xFFF; m++) {
    const dec = S.decode(S.encodeRoughMask(m, 0));
    if (dec.payload.mask !== m) { ok = false; break; }
  }
  check("4096 mask round-trips", ok);
}

// ─── encodeMelaInfo bounds ────────────────────────────────────
console.log("\n[5] Mela info round-trip and bounds");
{
  for (let n = 1; n <= 72; n++) {
    const dec = S.decode(S.encodeMelaInfo(n, 22, 5));
    check(`mela ${n}`, dec.payload.n === n && dec.payload.forteId === 22, "");
    if (n > 3 && n < 70) continue;   // keep output short
  }
  expectThrow("encodeMelaInfo(0) throws", () => S.encodeMelaInfo(0, 0));
  expectThrow("encodeMelaInfo(73) throws", () => S.encodeMelaInfo(73, 0));
}

// ─── encodeOctaveShift signed range ───────────────────────────
console.log("\n[6] Octave shift signed range");
{
  for (let s = -2; s <= 2; s++) {
    const dec = S.decode(S.encodeOctaveShift(s, 0));
    check(`shift ${s}`, dec.payload.shift === s);
  }
  expectThrow("encodeOctaveShift(-3) throws", () => S.encodeOctaveShift(-3));
  expectThrow("encodeOctaveShift(+3) throws", () => S.encodeOctaveShift(3));
}

// ─── Buttons ──────────────────────────────────────────────────
console.log("\n[7] Block → Web button frames");
{
  for (const bid of Object.values(S.BUTTON)) {
    const dec = S.decode(S.encodeButton(bid, 0));
    check(`button 0x${bid.toString(16)} round-trip`, dec.payload.buttonId === bid);
  }
}

// ─── Decoder rejects malformed envelopes ──────────────────────
console.log("\n[8] Decoder rejects malformed input");
{
  expectThrow("missing F0", () => S.decode(new Uint8Array([0x7D, 0x4D, 0x01, 0, 0, 0, 0, 0xF7])));
  expectThrow("missing F7", () => S.decode(new Uint8Array([0xF0, 0x7D, 0x4D, 0x01, 0, 0, 0, 0, 0x00])));
  expectThrow("wrong manufacturer id", () => S.decode(new Uint8Array([0xF0, 0x7E, 0x4D, 0x01, 0, 0, 0, 0, 0xF7])));
  expectThrow("wrong sub id", () => S.decode(new Uint8Array([0xF0, 0x7D, 0x4E, 0x01, 0, 0, 0, 0, 0xF7])));
  expectThrow("non-7-bit payload byte", () => S.decode(new Uint8Array([0xF0, 0x7D, 0x4D, 0x01, 0x80, 0, 0, 0, 0xF7])));
  expectThrow("unknown command", () => S.decode(new Uint8Array([0xF0, 0x7D, 0x4D, 0x7E, 0, 0, 0xF7])));
  expectThrow("too short", () => S.decode(new Uint8Array([0xF0])));
}

// ─── encoder bounds ────────────────────────────────────────────
console.log("\n[9] Encoder argument bounds");
{
  expectThrow("encodeRagaState(0x1000) throws", () => S.encodeRagaState(0x1000, false));
  expectThrow("encodeRagaState(-1) throws", () => S.encodeRagaState(-1, false));
  expectThrow("encodeRagaState(0.5) throws", () => S.encodeRagaState(0.5, false));
}

// ─── popcount + bitmaskFromPCs helpers ────────────────────────
console.log("\n[10] Helpers");
{
  check("popcount12(0) = 0", S.popcount12(0) === 0);
  check("popcount12(0xFFF) = 12", S.popcount12(0xFFF) === 12);
  check("popcount12(0xCB9) = 7 (mela 15)", S.popcount12(0xCB9) === 7);
  check("bitmaskFromPCs([0,1,2]) = 0x007", S.bitmaskFromPCs([0,1,2]) === 0x007);
  check("bitmaskFromPCs([7,11]) = 0x880", S.bitmaskFromPCs([7,11]) === 0x880);
  check("bitmaskFromPCs([99]) drops out-of-range", S.bitmaskFromPCs([99]) === 0);
}

// ─── SET_MODE / MODE_CHANGED round-trip and bounds ───────────
console.log("\n[10b] SET_MODE / MODE_CHANGED");
{
  for (const m of Object.values(S.MODE)) {
    const enc = S.encodeSetMode(m, 7);
    const dec = S.decode(enc);
    check(`SET_MODE round-trip mode=${m}`, dec.cmd === S.CMD.SET_MODE && dec.payload.mode === m && dec.seq === 7);
    const e2 = S.encodeModeChanged(m);
    const d2 = S.decode(e2);
    check(`MODE_CHANGED round-trip mode=${m}`, d2.cmd === S.CMD.MODE_CHANGED && d2.payload.mode === m);
  }
  expectThrow("encodeSetMode(-1) throws", () => S.encodeSetMode(-1));
  expectThrow("encodeSetMode(99) throws", () => S.encodeSetMode(99));
  expectThrow("encodeModeChanged(99) throws", () => S.encodeModeChanged(99));
  expectThrow("decode SET_MODE w/ unknown mode rejected", () => S.decode(new Uint8Array([0xF0, 0x7D, 0x4D, 0x06, 99, 0, 0xF7])));
}

// ─── End-to-end mock: instantiate RoliBlock with a stub MIDI port ──
console.log("\n[11] RoliBlock end-to-end with stub MIDI access");
{
  const { RoliBlock } = await import("./roli.js");

  // Build a stub MIDIAccess with one input + one output named like a Lightpad.
  const sentMessages = [];
  class StubMidiPort {
    constructor(name) { this.name = name; this.id = name; this.manufacturer = "ROLI"; this.state = "connected"; }
    addEventListener() {}
    removeEventListener() {}
    open() { return Promise.resolve(this); }
    close() { return Promise.resolve(this); }
  }
  class StubInput extends StubMidiPort {
    constructor() { super("Lightpad Block"); this._listeners = []; }
    addEventListener(name, fn) { if (name === "midimessage") this._listeners.push(fn); }
    fireMessage(bytes) { for (const fn of this._listeners) fn({ data: bytes }); }
  }
  class StubOutput extends StubMidiPort {
    constructor() { super("Lightpad Block"); }
    send(bytes) { sentMessages.push(Array.from(bytes)); }
  }

  const stubInput = new StubInput();
  const stubOutput = new StubOutput();
  const stubAccess = {
    inputs:  new Map([["in", stubInput]]),
    outputs: new Map([["out", stubOutput]]),
    addEventListener() {},
    removeEventListener() {}
  };

  // Capture callbacks
  const events = [];
  const block = new RoliBlock({
    onConnect:     (info) => events.push(["connect", info]),
    onDisconnect:  ()    => events.push(["disconnect"]),
    onTouchStart:  (e)   => events.push(["touchStart", e]),
    onTouchMove:   (e)   => events.push(["touchMove",  e]),
    onTouchEnd:    (e)   => events.push(["touchEnd",   e]),
    onButton:      (id)  => events.push(["button", id]),
    onModeChanged: (mode) => events.push(["modeChanged", mode])
  });

  // Inject the stub in place of navigator.requestMIDIAccess
  await block.connectWithAccess(stubAccess);
  check("connect dispatched", events.some(([t]) => t === "connect"));

  // Push a SET_RAGA from web — this sends SET_RAGA then SET_ROUGH_MASK (rough mask provided)
  block.sendRagaState(0xCB9, false, 0, 0);
  check("sendRagaState pushed two frames (raga + rough)", sentMessages.length === 2);
  check("first sent bytes start with F0 7D 4D 01 (SET_RAGA)", sentMessages[0].slice(0, 4).join(",") === [0xF0, 0x7D, 0x4D, 0x01].join(","));
  check("second sent bytes start with F0 7D 4D 02 (SET_ROUGH_MASK)", sentMessages[1].slice(0, 4).join(",") === [0xF0, 0x7D, 0x4D, 0x02].join(","));

  // Simulate a button press from the Block
  stubInput.fireMessage(S.encodeButton(S.BUTTON.K1, 0));
  check("K1 button surfaced via onButton", events.some(([t, id]) => t === "button" && id === S.BUTTON.K1));

  // Simulate an MPE note-on (channel 2, midi 60, vel 100) — should call onTouchStart
  stubInput.fireMessage(new Uint8Array([0x91, 60, 100]));
  check("MPE note-on surfaced via onTouchStart", events.some(([t, e]) => t === "touchStart" && e.midi === 60));

  // Mode change pushed by Web → Block
  block.sendMode(S.MODE.PASSTHROUGH);
  const lastSent = sentMessages[sentMessages.length - 1];
  check("sendMode pushed SET_MODE bytes", lastSent && lastSent[3] === S.CMD.SET_MODE && lastSent[4] === S.MODE.PASSTHROUGH);

  // Mode change pushed by Block → Web — surfaced via onModeChanged
  stubInput.fireMessage(S.encodeModeChanged(S.MODE.DEMO));
  check("MODE_CHANGED surfaced via onModeChanged",
    events.some(([t, mode]) => t === "modeChanged" && mode === S.MODE.DEMO));

  // Disconnect
  block.disconnect();
  check("disconnect surfaced", events.some(([t]) => t === "disconnect"));
}

// ─── Summary ──────────────────────────────────────────────────
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
