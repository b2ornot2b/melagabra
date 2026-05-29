// audio/engine.js — Melagabra audio.
// A pragmatic Web Audio implementation: tambura drone (three slowly-replucked
// detuned voices), a vīṇa-style lead synth, the §7.4 vivadi probe, and a
// Gray-walk auto-stepper. AudioWorklet is intentionally avoided here so the
// engine boots in any modern browser without async worklet registration.

import * as D from "../data.js";

export async function createEngine() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ latencyHint: "interactive" });
  if (ctx.state === "suspended") await ctx.resume();

  // ─── Bus topology ─────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.6;
  const compressor = ctx.createDynamicsCompressor();
  compressor.ratio.value = 4;
  compressor.knee.value = 6;
  compressor.threshold.value = -10;
  master.connect(compressor).connect(ctx.destination);

  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.3;
  droneBus.connect(master);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 0.5;
  voiceBus.connect(master);

  const probeBus = ctx.createGain();
  probeBus.gain.value = 0;
  probeBus.connect(master);

  // ─── Tambura drone ────────────────────────────────────────────
  // Sa (low), Pa, Sa (high). Slowly replucked synth-pluck oscillators with
  // gentle FM jitter so they don't drift into mechanical tile.
  let saHz = 220;        // A3 default
  const droneVoices = [];
  let droneTimer = null;
  let droneOn = false;

  function pluckTambura(freq, when, decay = 4.5, gain = 1) {
    // Synth pluck: a short noise burst → bandpass → tone, modulated lightly
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.55 + Math.random() * 0.4;   // jīvāḷi shimmer
    lfoGain.gain.value = freq * 0.0005;                  // ±0.05% pitch drift
    lfo.connect(lfoGain).connect(osc.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.18 * gain, when + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    const shape = ctx.createBiquadFilter();
    shape.type = "lowpass";
    shape.frequency.value = freq * 4;
    shape.Q.value = 0.4;

    osc.connect(shape).connect(env).connect(droneBus);
    osc.start(when);
    osc.stop(when + decay + 0.1);
    lfo.start(when);
    lfo.stop(when + decay + 0.1);
    droneVoices.push({ osc, lfo, env });
    setTimeout(() => {
      const i = droneVoices.findIndex(v => v.osc === osc);
      if (i >= 0) droneVoices.splice(i, 1);
    }, (decay + 0.5) * 1000);
  }

  function startDrone() {
    if (droneOn) return;
    droneOn = true;
    droneBus.gain.cancelScheduledValues(ctx.currentTime);
    droneBus.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.8);
    let stage = 0;
    const tick = () => {
      if (!droneOn) return;
      const now = ctx.currentTime;
      const seq = [
        () => pluckTambura(saHz, now, 4.8),                    // Sa low
        () => pluckTambura(saHz * 1.4983, now, 4.8, 0.85),     // Pa (3:2)
        () => pluckTambura(saHz * 2, now, 4.8, 0.7),           // Sa high
        () => pluckTambura(saHz, now, 4.8)                     // Sa low
      ];
      seq[stage % 4]();
      stage++;
      const delay = 1500 + (Math.random() * 200 - 100);
      droneTimer = setTimeout(tick, delay);
    };
    tick();
  }

  function stopDrone() {
    droneOn = false;
    if (droneTimer) clearTimeout(droneTimer);
    droneTimer = null;
    droneBus.gain.cancelScheduledValues(ctx.currentTime);
    droneBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  }

  function setSa(hz) {
    saHz = clamp(hz, 100, 440);
  }

  // ─── Voice synth ──────────────────────────────────────────────
  // Karplus-Strong-ish: triangle + decaying lowpass envelope.
  function midiToHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function pcToHz(pc, octave = 0) {
    const baseSa = saHz;
    return baseSa * Math.pow(2, pc / 12 + octave);
  }

  function playFreq(freq, dur = 0.9, gain = 0.5, gamakaCents = 0) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    if (gamakaCents > 0) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 4.6;
      lfoGain.gain.value = freq * (gamakaCents / 1200) * Math.LN2;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(now);
      lfo.stop(now + dur + 0.1);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = freq * 5;
    lp.Q.value = 0.8;

    osc.connect(lp).connect(env).connect(voiceBus);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }

  function playPC(pc, octaveOffset = 0, dur = 0.9) {
    playFreq(pcToHz(pc, octaveOffset), dur);
  }

  function playMidi(midi, dur = 0.7) {
    playFreq(midiToHz(midi), dur);
  }

  function playMelaArpeggio(melaN) {
    const m = D.MELA[melaN];
    const pcs = [...m.pcSet, m.pcSet[0] + 12];
    pcs.forEach((pc, i) => {
      setTimeout(() => playPC(pc % 12, Math.floor(pc / 12), 0.55), i * 230);
    });
  }

  async function playPhrase(melaN) {
    const m = D.MELA[melaN];
    const pattern = [0, 2, 4, 3, 1, 5, 4, 2];   // svara-index pattern (8 notes)
    const dur = 0.42;
    return new Promise(resolve => {
      pattern.forEach((idx, i) => {
        const pc = m.pcSet[idx];
        setTimeout(() => playPC(pc, 0, dur), i * dur * 1000);
      });
      setTimeout(resolve, pattern.length * dur * 1000 + 100);
    });
  }

  // ─── Vivadi probe (§7.4) ───────────────────────────────────
  // Detune a drone harmonic by +7 cents and fade it in for 1.4 s, producing
  // an audible beat at ≈1.0–1.5 Hz against the unaltered drone.
  function playVivadiProbe(melaN) {
    const m = D.MELA[melaN];
    if (!m.vivadi.extremal || m.vivadi.exception) {
      // No probe for non-extremal or for the 14-exception set
      playMelaArpeggio(melaN);
      return;
    }
    const now = ctx.currentTime;
    const detuneCents = 7;
    const harmonic = 2;     // probe against Pa (Sa × 1.5) octave
    const probeFreq = saHz * harmonic * Math.pow(2, detuneCents / 1200);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = probeFreq;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.18, now + 0.06);
    env.gain.linearRampToValueAtTime(0.18, now + 1.2);
    env.gain.linearRampToValueAtTime(0, now + 1.6);

    osc.connect(env).connect(probeBus);
    osc.start(now);
    osc.stop(now + 1.7);

    // Also play the rough pitch class itself
    for (const pc of m.roughPCs) playPC(pc, 0, 1.4);
  }

  // ─── Gray walker ──────────────────────────────────────────
  let walkTimer = null;
  let walkStep = 0;
  function startGrayWalk(bpm = 60) {
    if (walkTimer) clearTimeout(walkTimer);
    const beat = 60000 / bpm;
    const tick = () => {
      const m = D.GRAY_PATH[walkStep];
      // Set state so UI follows
      if (window.state) window.state.mela = m;
      // emit an event the app can hook into
      window.dispatchEvent(new CustomEvent("graywalk-step", { detail: { step: walkStep, mela: m } }));
      playMelaArpeggio(m);
      // M-crossing: subtle filter sweep cue
      if (walkStep === D.M_CROSSING_INDEX) {
        const sweepOsc = ctx.createOscillator();
        sweepOsc.type = "sawtooth";
        sweepOsc.frequency.value = saHz * 4;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, ctx.currentTime);
        env.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.08);
        env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(200, ctx.currentTime);
        lp.frequency.exponentialRampToValueAtTime(8000, ctx.currentTime + 1.5);
        lp.Q.value = 6;
        sweepOsc.connect(lp).connect(env).connect(voiceBus);
        sweepOsc.start();
        sweepOsc.stop(ctx.currentTime + 1.9);
      }
      walkStep = (walkStep + 1) % 72;
      walkTimer = setTimeout(tick, beat);
    };
    tick();
  }
  function stopGrayWalk() {
    if (walkTimer) clearTimeout(walkTimer);
    walkTimer = null;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  return {
    ctx,
    setSa,
    startDrone, stopDrone,
    playPC, playMidi, playFreq,
    playMelaArpeggio,
    playPhrase,
    playVivadiProbe,
    startGrayWalk, stopGrayWalk
  };
}
