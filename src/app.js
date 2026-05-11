// app.js — Melagabra runtime.
// Imports the data layer, maintains a single state Proxy with named-event
// pub/sub, dispatches plate views, and orchestrates the hero animation,
// mode toggle, and audio gate.

import * as D from "./data.js";

// ═══ State + router ══════════════════════════════════════════════════════

const DEFAULT_STATE = Object.freeze({
  view: "atlas",
  mode: "explore",       // "explore" | "perform"
  mela: 15,              // active mela 1..72
  orbit: null,           // 1..18 | null (Klein Quilt focus)
  pair: null,            // [a, b] | null
  step: null,            // 0..71 | null  (Gray walk position)
  forteClass: null,      // "7-22" | "7-Z18" | "[0,1,...]" | null
  vivadiFilter: "all",   // all | extremal | naive | exception | avivadi
  layout: "force",       // "force" | "bunched" (Hamming view)
  instrument: "yantra",  // yantra | fretboard | piano | vina | roli
  octaveShift: 0,        // -2..+2 — only meaningful when Roli is connected
  roli: { connected: false, fallbackCC: false, info: null },
  night: false
});

const URL_KEYS = ["view", "mode", "mela", "orbit", "pair", "step", "forteClass", "vivadiFilter", "layout", "instrument", "night"];
const PLATE_FOR_VIEW = {
  atlas: "atlas", encoding: "encoding", orbits: "orbits",
  hamming: "hamming", graycode: "graycode", zrelation: "zrelation",
  vivadi: "vivadi", cross: "cross", empirical: "empirical",
  colophon: "colophon", perform: "perform"
};

const listeners = new Map();        // key → Set<fn>
const onAny = new Set();

const _state = { ...DEFAULT_STATE };
export const state = new Proxy(_state, {
  set(t, k, v) {
    const prev = t[k];
    if (Object.is(prev, v)) return true;
    t[k] = v;
    (listeners.get(k) || []).forEach(fn => fn(v, prev));
    onAny.forEach(fn => fn(k, v, prev));
    return true;
  }
});
export function on(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}
export function setState(patch) {
  for (const [k, v] of Object.entries(patch)) state[k] = v;
}

// Hash routing — two-way, debounced.
let pushTimer = 0;
function writeUrl() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const parts = [];
    if (state.view && state.view !== DEFAULT_STATE.view) parts.push(`view=${state.view}`);
    if (state.mode === "perform") parts.push(`mode=perform`);
    if (state.mela !== DEFAULT_STATE.mela) parts.push(`mela=${state.mela}`);
    if (state.orbit) parts.push(`orbit=${state.orbit}`);
    if (state.step != null) parts.push(`step=${state.step}`);
    if (state.pair) parts.push(`pair=${state.pair.join(",")}`);
    if (state.vivadiFilter !== "all") parts.push(`filter=${state.vivadiFilter}`);
    if (state.layout !== "force") parts.push(`layout=${state.layout}`);
    if (state.instrument !== "yantra") parts.push(`instrument=${state.instrument}`);
    if (state.octaveShift !== 0) parts.push(`oct=${state.octaveShift}`);
    if (state.forteClass) parts.push(`forte=${encodeURIComponent(state.forteClass)}`);
    if (state.night) parts.push(`night`);
    const path = state.view ? `/${state.view}` : "";
    const q = parts.length ? "&" + parts.filter(p => !p.startsWith("view=")).join("&") : "";
    const hash = `#${path}${q}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, 120);
}
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return;
  const segs = raw.split("&");
  const patch = {};
  // First segment can be a view name: "atlas", "orbits", "perform", etc.
  const head = segs[0];
  if (head && PLATE_FOR_VIEW[head]) patch.view = head;
  for (const seg of segs) {
    const [k, v] = seg.split("=");
    if (!k) continue;
    if (k === "view" && PLATE_FOR_VIEW[v]) patch.view = v;
    else if (k === "mode" && (v === "explore" || v === "perform")) patch.mode = v;
    else if (k === "mela") patch.mela = clamp(parseInt(v, 10), 1, 72);
    else if (k === "orbit") patch.orbit = clamp(parseInt(v, 10), 1, 18);
    else if (k === "step") patch.step = clamp(parseInt(v, 10), 0, 71);
    else if (k === "pair" && v) {
      const [a, b] = v.split(",").map(Number);
      if (a >= 1 && a <= 72 && b >= 1 && b <= 72) patch.pair = [a, b];
    }
    else if (k === "filter") patch.vivadiFilter = v;
    else if (k === "layout") patch.layout = v;
    else if (k === "instrument") patch.instrument = v;
    else if (k === "oct") patch.octaveShift = clamp(parseInt(v, 10) || 0, -2, 2);
    else if (k === "forte") patch.forteClass = decodeURIComponent(v);
    else if (k === "night") patch.night = true;
  }
  setState(patch);
}

// ═══ Helpers ═════════════════════════════════════════════════════════════

const qsel = (sel, root = document) => root.querySelector(sel);
const qall = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const ce = (tag, attrs = {}, children = []) => {
  const el = tag.startsWith("svg:") || /^(svg|circle|rect|line|path|polygon|polyline|g|text|defs|marker|use|clipPath|tspan|ellipse)$/.test(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag.replace(/^svg:/, ""))
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "data" && typeof v === "object") for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const TAU = Math.PI * 2;

// Deterministic small PRNG (mulberry32) for reproducible scatter
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══ Plate dispatcher ════════════════════════════════════════════════════

const renderers = {};   // view → fn
let currentView = null;

function showPlate(name) {
  const sections = qall('section.plate');
  for (const s of sections) {
    const isMatch = s.dataset.plate === name;
    s.classList.toggle("hidden", !isMatch);
    if (isMatch) {
      s.classList.add("entering");
      setTimeout(() => s.classList.remove("entering"), 750);
    }
  }
  // Highlight plate-index
  qall(".plate-link").forEach(a => {
    const href = a.getAttribute("href").replace("#/", "");
    a.classList.toggle("active", href === name);
  });
  // Render the plate (idempotent)
  if (renderers[name]) renderers[name]();
}

on("view", (v) => {
  if (v === currentView) {
    // re-render with possibly-new sub-state (mela, orbit, step…)
    if (renderers[v]) renderers[v]();
  } else {
    currentView = v;
    showPlate(v);
  }
  writeUrl();
});
on("mela", () => {
  // Active mela changed — re-render current view if it cares.
  if (renderers[currentView]) renderers[currentView]({ partial: true });
  writeUrl();
});
for (const k of ["orbit", "step", "pair", "vivadiFilter", "layout", "instrument", "mode", "night", "forteClass"]) {
  on(k, () => {
    if (renderers[currentView]) renderers[currentView]({ partial: true });
    writeUrl();
  });
}

// ═══ Hero / Atlas (Plate 0) ══════════════════════════════════════════════
// 18 orbit constellations + the Z-triangle, drawn into #atlas-svg.

function buildAtlasLayout(W = 1600, H = 900) {
  // Orbit-center scatter: golden-angle spiral, gently pushed away from edges.
  const cx = W / 2, cy = H / 2 + 20;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const positions = [];   // length 19 (1..18 used)
  positions[0] = null;
  for (let i = 1; i <= 18; i++) {
    const r = 60 + Math.sqrt(i / 18) * Math.min(W, H) * 0.42;
    const a = i * golden;
    positions[i] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  // Members within an orbit: 4 corners of a small quadrilateral
  // placed at offsets that suggest a cross + diagonal.
  const memberOffset = (orbitIdx, memberPos /* 0..3 */) => {
    // Orbit "shape" rotated by orbit's angle for variety
    const rot = (orbitIdx * golden) + 0.5;
    const r = 26;
    const angle = rot + (memberPos * Math.PI / 2);
    return [r * Math.cos(angle), r * Math.sin(angle)];
  };
  // Compute each mela's atlas point
  const points = new Array(73);
  for (let n = 1; n <= 72; n++) {
    const oid = D.MELA[n].orbitId;
    const members = D.MELA[n].orbitMembers;
    const idx = members.indexOf(n);
    const c = positions[oid];
    const [dx, dy] = memberOffset(oid, idx);
    points[n] = { x: c.x + dx, y: c.y + dy };
  }
  return { positions, points, cx, cy };
}

function renderAtlas() {
  const svg = qsel("#atlas-svg");
  if (!svg) return;
  // Idempotent: only build once.  Use getAttribute (not dataset) because
  // some SVGElement implementations don't expose the HTMLOrSVGElement mixin.
  if (svg.getAttribute("data-built") === "1") return;
  svg.setAttribute("data-built", "1");

  const W = 1600, H = 900;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const { positions, points } = buildAtlasLayout(W, H);

  // ── Top frieze: the 12 semitones in Devanagari + numerals
  const frieze = ce("g", { class: "frieze", transform: "translate(0, 56)" });
  const semitoneNames = ["Sa","R₁","R₂","R₃","G₃","M₁","M₂","P","D₁","D₂","D₃","N₃"];
  const dvNames = ["स","रे","रे","रे","ग","म","म","प","ध","ध","ध","नि"];
  const friezeY = 0;
  const friezeStartX = W * 0.18, friezeEndX = W * 0.82;
  const span = friezeEndX - friezeStartX;
  for (let i = 0; i < 12; i++) {
    const x = friezeStartX + (i / 11) * span;
    const tick = ce("line", {
      x1: x, y1: friezeY - 8, x2: x, y2: friezeY + 8,
      stroke: "currentColor", "stroke-width": 0.6,
      class: "ink-draw", style: `--len:18; --delay:${i * 80}ms`
    });
    const num = ce("text", {
      x: x, y: friezeY - 16, "text-anchor": "middle",
      class: "font-mono", style: "font-size:10px; fill: var(--ink-soft); letter-spacing:0.16em;",
      text: String(i)
    });
    const name = ce("text", {
      x: x, y: friezeY + 28, "text-anchor": "middle",
      class: "font-mono", style: "font-size:10px; fill: var(--ink); letter-spacing:0.06em;",
      text: semitoneNames[i]
    });
    const dv = ce("text", {
      x: x, y: friezeY + 46, "text-anchor": "middle",
      class: "font-deva", style: "font-size:13px; fill: var(--ink-soft);",
      text: dvNames[i]
    });
    frieze.append(tick, num, name, dv);
  }
  // Friezeline
  frieze.appendChild(ce("line", {
    x1: friezeStartX, y1: friezeY, x2: friezeEndX, y2: friezeY,
    stroke: "currentColor", "stroke-width": 0.5, opacity: 0.45,
    class: "ink-draw", style: `--len:${span}; --delay:0ms`
  }));
  svg.appendChild(frieze);

  // ── Constellations: 18 orbits, drawn as quadrilaterals connecting their
  // four members. Each tile starts drawing at delay = friezeDuration + i*60ms.
  const FRIEZE_DURATION = 1600;
  const orbitsG = ce("g", { class: "orbits" });
  for (let oid = 1; oid <= 18; oid++) {
    const members = [oid, 37 - oid, 36 + oid, 73 - oid];
    const orderedIdx = D.MELA[oid].orbitMembers.map((m, i) => i);   // 0..3
    // Build a 4-node polygon path in the order the members are stored
    const verts = D.MELA[oid].orbitMembers.map(m => points[m]);
    const d = `M ${verts[0].x.toFixed(1)} ${verts[0].y.toFixed(1)} `
            + `L ${verts[1].x.toFixed(1)} ${verts[1].y.toFixed(1)} `
            + `L ${verts[2].x.toFixed(1)} ${verts[2].y.toFixed(1)} `
            + `L ${verts[3].x.toFixed(1)} ${verts[3].y.toFixed(1)} Z`;
    const delay = FRIEZE_DURATION + oid * 60;
    const path = ce("path", {
      d, class: "constellation-line ink-draw",
      style: `--len:260; --delay:${delay}ms`
    });
    orbitsG.appendChild(path);
    // Vertices
    for (const m of D.MELA[oid].orbitMembers) {
      const p = points[m];
      const c = ce("circle", {
        cx: p.x, cy: p.y, r: 2.2,
        class: "constellation-vertex",
        "data-mela": m,
        style: `opacity:0; animation: revealLine 600ms ease ${delay + 200}ms forwards;`
      });
      c.addEventListener("click", () => { state.mela = m; state.view = "orbits"; });
      c.addEventListener("mouseenter", () => { state.mela = m; });
      orbitsG.appendChild(c);
    }
    // Orbit numeral
    const cen = positions[oid];
    orbitsG.appendChild(ce("text", {
      x: cen.x, y: cen.y + 4, "text-anchor": "middle",
      style: `font-family:'JetBrains Mono',monospace; font-size:9px; fill: var(--ink-soft); opacity:0; animation: revealLine 600ms ease ${delay + 300}ms forwards;`,
      text: oid
    }));
  }
  svg.appendChild(orbitsG);

  // ── Z-triangle: connect mela 40, 48, 49 in vermillion. They live in
  // different orbits, so the line crosses orbit boundaries — that's the
  // visceral cue for Theorem 6.2.
  const zG = ce("g", { class: "z-triangle" });
  const z40 = points[40], z48 = points[48], z49 = points[49];
  const triPath = `M ${z40.x.toFixed(1)} ${z40.y.toFixed(1)} L ${z48.x.toFixed(1)} ${z48.y.toFixed(1)} L ${z49.x.toFixed(1)} ${z49.y.toFixed(1)} Z`;
  zG.appendChild(ce("path", { d: triPath, class: "z-triangle-line vermillion-pulse" }));
  for (const m of [40, 48, 49]) {
    const p = points[m];
    zG.appendChild(ce("circle", { cx: p.x, cy: p.y, r: 4, class: "z-triangle-vertex vermillion-pulse" }));
  }
  svg.appendChild(zG);

  // ── Active-mela ring: highlights the currently selected mela
  const activeRing = ce("circle", {
    id: "atlas-active-ring",
    cx: points[state.mela].x, cy: points[state.mela].y,
    r: 8, fill: "none", stroke: "var(--kumkum)", "stroke-width": 1,
    opacity: 0
  });
  svg.appendChild(activeRing);

  // Reposition active ring when state.mela changes
  on("mela", () => {
    const r = qsel("#atlas-active-ring");
    if (!r) return;
    const p = points[state.mela];
    r.setAttribute("cx", p.x);
    r.setAttribute("cy", p.y);
    r.setAttribute("opacity", "1");
  });

  // ── Trigger the typing-in line and reveal the marginal nav
  const cap = qsel("#atlas-caption .typeset-line");
  if (cap) cap.classList.add("is-played");
  setTimeout(() => {
    qsel("#plate-index").classList.add("is-visible");
    qsel("#plate-index").style.opacity = "1";
    qsel("#plate-index").style.pointerEvents = "auto";
    qsel("#masthead").style.opacity = "1";
    qsel("#masthead").style.pointerEvents = "auto";
    qsel("#mode-pivot").style.opacity = "1";
    qsel("#mode-pivot").style.pointerEvents = "auto";
    qsel("#atlas-active").style.opacity = "1";
  }, 4200);
}

renderers.atlas = renderAtlas;

// Bind live-updating data into the header active-mela block.
function bindActive() {
  const update = () => {
    const m = D.MELA[state.mela];
    qall('[data-bind]').forEach(el => {
      const path = el.dataset.bind.split(".");
      let v = m;
      for (const k of path.slice(1)) v = v?.[k] ?? "·";
      if (path[0] === "mela" && path[1] === "numeral") v = `Mela ${m.n}`;
      el.textContent = v;
    });
  };
  update();
  on("mela", update);
}

// ═══ Klein Quilt (Plate II) ══════════════════════════════════════════════

function renderOrbits() {
  const root = qsel("#orbits-body");
  if (!root) return;
  if (root.dataset.built !== "1") {
    root.dataset.built = "1";
    root.innerHTML = "";

    // Sticky orbit-index rail (left of grid)
    const wrap = ce("div", { class: "grid grid-cols-[80px_1fr] gap-6 md:gap-10" });
    const rail = ce("div", { id: "orbit-rail", class: "sticky top-12 self-start" });
    const rt = ce("div", { class: "text-[10px] tracking-[0.18em] uppercase text-ink-soft mb-3 font-mono", text: "Orbits 1–18" });
    rail.appendChild(rt);
    for (let i = 1; i <= 18; i++) {
      rail.appendChild(ce("a", {
        href: `#/orbits&orbit=${i}`,
        class: "orbit-rail-link block py-1.5 font-mono text-[11px] text-ink-soft hover:text-kumkum transition-colors",
        "data-orbit-rail": i,
        text: String(i).padStart(2, "0"),
        onclick: (e) => { e.preventDefault(); state.orbit = i; const el = document.querySelector(`[data-orbit-row="${i}"]`); if (el) el.scrollIntoView({behavior: "smooth", block: "center"}); }
      }));
    }
    wrap.appendChild(rail);

    // Grid: 18 rows × 4 columns; each row is one orbit
    const grid = ce("div", { class: "space-y-8" });
    for (let oid = 1; oid <= 18; oid++) {
      const row = ce("div", { class: "orbit-row", "data-orbit-row": oid });
      const head = ce("div", { class: "flex items-baseline justify-between border-b border-ink/15 pb-2 mb-3" });
      const left = ce("div");
      left.appendChild(ce("span", { class: "font-mono text-[11px] tracking-[0.18em] uppercase text-ink-soft", text: `Orbit ${String(oid).padStart(2,"0")}` }));
      left.appendChild(ce("span", { class: "ml-3 font-display italic text-ink-soft text-sm", text: `{${D.orbitMembers(oid).join(", ")}}` }));
      const right = ce("div", { class: "text-[10px] font-mono text-ink-soft tracking-wide" });
      const ot = D.ORBITS[oid - 1];
      const knownTotal = ot.members.reduce((s, m) => s + (D.MELA[m].janya || 0), 0);
      right.textContent = `janya (known) · ${knownTotal}`;
      head.append(left, right);
      row.appendChild(head);

      const cells = ce("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" });
      D.MELA[oid].orbitMembers.forEach((m, idx) => {
        cells.appendChild(buildMelaTile(m, idx));
      });
      row.appendChild(cells);
      grid.appendChild(row);
    }
    wrap.appendChild(grid);

    // Header — applied K-buttons that act on the current active mela
    const header = ce("div", { class: "mb-8 flex flex-wrap items-center gap-3" });
    header.appendChild(ce("span", { class: "text-[10px] font-mono tracking-[0.2em] uppercase text-ink-soft", text: "Apply transform to active mela:" }));
    header.appendChild(ce("button", {
      class: "paper-btn", text: "K₁ madhyama (0x060)",
      onclick: () => applyXOR(D.K1)
    }));
    header.appendChild(ce("button", {
      class: "paper-btn", text: "K₂ antipodal (0x7EF)",
      onclick: () => applyXOR(D.K2)
    }));
    header.appendChild(ce("button", {
      class: "paper-btn", text: "K₃ full (0x78F)",
      onclick: () => applyXOR(D.K3)
    }));
    root.appendChild(header);
    root.appendChild(wrap);
  }

  // Update active class
  qall('.mela-tile').forEach(t => {
    t.classList.toggle("is-active", parseInt(t.dataset.mela, 10) === state.mela);
  });
  // Highlight orbit row of active mela
  const aOid = D.MELA[state.mela].orbitId;
  qall('[data-orbit-row]').forEach(r => {
    r.classList.toggle("orbit-row-active", parseInt(r.dataset.orbitRow, 10) === aOid);
  });
}
renderers.orbits = renderOrbits;

function buildMelaTile(n, idxInOrbit = 0) {
  const m = D.MELA[n];
  const tile = ce("div", { class: "mela-tile", "data-mela": n });
  const top = ce("div", { class: "flex items-baseline justify-between" });
  top.appendChild(ce("span", { class: "mela-num", text: `№ ${String(n).padStart(2,"0")}` }));
  const tags = ce("span", { class: "text-[10px] font-mono text-ink-soft" });
  if (m.vivadi.extremal) tags.appendChild(ce("span", { class: "badge-vivadi", title: "extremal vivadi" }));
  if (m.forte === "7-Z18" || m.forte === "7-Z38") {
    tags.appendChild(ce("span", { class: "badge-zrelation", text: "Z" }));
  }
  top.appendChild(tags);
  tile.appendChild(top);
  tile.appendChild(ce("div", { class: "mela-name", text: m.name }));
  tile.appendChild(ce("div", { class: "mela-iast", text: m.nameIAST }));
  tile.appendChild(ce("div", { class: "mela-hex", text: `${m.hex}  ·  Forte ${m.forte}` }));

  // 12-cell bit strip (Sa-anchored)
  const strip = ce("div", { class: "bit-strip mt-2" });
  for (let bit = 11; bit >= 0; bit--) {
    const isOn = !!(m.bits & (1 << bit));
    const region = bit === 11 || bit === 4 ? (bit === 11 ? "S" : "P")
                  : (bit >= 7 ? "L" : (bit === 5 || bit === 6 ? "M" : "U"));
    strip.appendChild(ce("span", { class: `bit-cell ${isOn?"on":""} region-${region} func-${BIT_FUNC[bit]}`, title: `bit ${bit} · ${FUNC_FAMILY[BIT_FUNC[bit]]}` }));
  }
  tile.appendChild(strip);

  tile.addEventListener("click", () => { state.mela = n; });

  // K-corner anchors: small marks at the four corners labelled with the
  // orbit transformation that maps n to its three Klein-partners.
  const partner = D.MELA[n].orbitMembers;
  const ki = idxInOrbit;
  const k1Target = partner[ki ^ 0b10];   // arbitrary; see below
  // Actually: the orbit ordering is [n, 37-n, 36+n, 73-n] for n ≤ 18.
  // Mapping under K1, K2, K3 differs depending on which member is "self".
  // We compute partners explicitly:
  const partners = D.MELA[n].orbitMembers.filter(x => x !== n);
  const corners = ce("div", { class: "flex items-center gap-2 mt-2 text-[9px] font-mono text-ink-soft" });
  corners.appendChild(ce("span", { text: "↔" }));
  for (const p of partners) {
    const xor = D.MELA[n].bits ^ D.MELA[p].bits;
    const label = xor === D.K1 ? "K₁" : xor === D.K2 ? "K₂" : xor === D.K3 ? "K₃" : "?";
    const a = ce("button", {
      class: "hover:text-kumkum transition-colors", text: `${label}→${p}`,
      onclick: (e) => { e.stopPropagation(); state.mela = p; }
    });
    corners.appendChild(a);
  }
  tile.appendChild(corners);

  return tile;
}

function applyXOR(mask) {
  const cur = D.MELA[state.mela].bits;
  const nx = cur ^ mask;
  const target = D.BITS_TO_MELA.get(nx);
  if (target) state.mela = target;
}

// ═══ Distance Field (Plate III) — Hamming-2 graph ════════════════════════
//
// Simple Verlet-style force layout: charge repulsion + link-distance spring.
// 72 vertices, 324 edges → trivial CPU. SVG render. Drag re-tugs neighbours.

function renderHamming({ partial = false } = {}) {
  const body = qsel("#hamming-body");
  if (!body) return;
  if (body.dataset.built !== "1") {
    body.dataset.built = "1";
    body.innerHTML = "";

    const controls = ce("div", { class: "flex flex-wrap items-center gap-3 mb-6" });
    controls.appendChild(ce("button", {
      class: "paper-btn", text: "Force layout",
      "data-layout": "force",
      onclick: () => { state.layout = "force"; runHammingLayout("force"); }
    }));
    controls.appendChild(ce("button", {
      class: "paper-btn", text: "Orbit-bunched",
      "data-layout": "bunched",
      onclick: () => { state.layout = "bunched"; runHammingLayout("bunched"); }
    }));
    const antiBtn = ce("button", {
      class: "paper-btn", text: "Show 36 antipodes",
      "data-toggle": "antipodes",
      onclick: function() {
        this.classList.toggle("is-on");
        qall(".edge.antipode-overlay").forEach(e => e.classList.toggle("is-antipode", this.classList.contains("is-on")));
      }
    });
    controls.appendChild(antiBtn);
    body.appendChild(controls);

    const layout = ce("div", { class: "grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-8" });

    const svgWrap = ce("div", { class: "border border-ink/12 bg-vellum-2/30 relative", style: "aspect-ratio: 4/3;" });
    const svg = ce("svg", { id: "hamming-svg", viewBox: "0 0 800 600", class: "w-full h-full" });
    svgWrap.appendChild(svg);
    layout.appendChild(svgWrap);

    // Sidebar: 5-bar histogram + active-mela detail
    const side = ce("div", { class: "flex flex-col gap-6" });
    side.appendChild(buildDistHistogram());
    side.appendChild(buildHammingActiveCard());
    layout.appendChild(side);

    body.appendChild(layout);

    runHammingLayout(state.layout);
  }
  // Update vertex highlights
  paintHammingState();
}
renderers.hamming = renderHamming;

let hammingNodes, hammingEdges;
function runHammingLayout(kind) {
  const svg = qsel("#hamming-svg");
  if (!svg) return;
  const W = 800, H = 600;
  // Nodes
  if (!hammingNodes) {
    hammingNodes = new Array(73);
    for (let n = 1; n <= 72; n++) {
      hammingNodes[n] = { n, x: W/2 + Math.cos(n*0.5)*200, y: H/2 + Math.sin(n*0.5)*150, vx: 0, vy: 0 };
    }
  }
  if (kind === "bunched") {
    // 6×3 quilt of orbits, each orbit a 2×2 mini-cluster
    const cols = 6, rows = 3;
    const cellW = W / cols, cellH = H / rows;
    for (let oid = 1; oid <= 18; oid++) {
      const ci = (oid - 1) % cols;
      const ri = Math.floor((oid - 1) / cols);
      const cx = (ci + 0.5) * cellW;
      const cy = (ri + 0.5) * cellH;
      const members = D.MELA[oid].orbitMembers;
      // K1 partners side-by-side, K2 partners top-bottom
      const layout4 = [
        { x: cx - 24, y: cy - 18 },   // n
        { x: cx + 24, y: cy - 18 },   // 36 + n  (K1 partner of n)
        { x: cx - 24, y: cy + 18 },   // 73 - n  (K2 partner of n)
        { x: cx + 24, y: cy + 18 }    // 37 - n  (K3 partner)
      ];
      // The orderedMembers are [n, 37-n, 36+n, 73-n].  Map index→position:
      // 0 → top-left, 2 (36+n) → top-right, 3 (73-n) → bottom-left, 1 (37-n) → bottom-right
      const positions = [layout4[0], layout4[3], layout4[1], layout4[2]];
      members.forEach((m, idx) => {
        hammingNodes[m].x = positions[idx].x;
        hammingNodes[m].y = positions[idx].y;
      });
    }
    drawHammingGraph();
    return;
  }
  // Force layout
  const ITER = 280;
  const REPULSE = 5500;
  const LINK = 70;
  const STIFF_M = 0.5, STIFF = 0.3;
  for (let it = 0; it < ITER; it++) {
    // pairwise repulsion
    for (let a = 1; a <= 72; a++) {
      for (let b = a + 1; b <= 72; b++) {
        const A = hammingNodes[a], B = hammingNodes[b];
        let dx = B.x - A.x, dy = B.y - A.y;
        let d2 = dx*dx + dy*dy;
        if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5; }
        const f = REPULSE / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        A.vx -= fx; A.vy -= fy;
        B.vx += fx; B.vy += fy;
      }
    }
    // link springs
    for (const e of D.EDGES) {
      const A = hammingNodes[e.a], B = hammingNodes[e.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const target = e.region === "M" ? LINK * 1.5 : LINK;
      const stiff = e.region === "M" ? STIFF_M : STIFF;
      const f = (d - target) * stiff;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx += fx; A.vy += fy;
      B.vx -= fx; B.vy -= fy;
    }
    // damping + step
    const damp = 0.6;
    for (let n = 1; n <= 72; n++) {
      const N = hammingNodes[n];
      N.vx *= damp; N.vy *= damp;
      N.x += N.vx * 0.005;
      N.y += N.vy * 0.005;
      // bounds
      N.x = clamp(N.x, 30, W - 30);
      N.y = clamp(N.y, 30, H - 30);
    }
  }
  drawHammingGraph();
}

function drawHammingGraph() {
  const svg = qsel("#hamming-svg");
  if (!svg) return;
  svg.innerHTML = "";
  // Edges first
  const eg = ce("g", { class: "edges" });
  for (const e of D.EDGES) {
    const A = hammingNodes[e.a], B = hammingNodes[e.b];
    eg.appendChild(ce("line", {
      x1: A.x.toFixed(1), y1: A.y.toFixed(1),
      x2: B.x.toFixed(1), y2: B.y.toFixed(1),
      class: "edge", "data-region": e.region,
      "data-a": e.a, "data-b": e.b
    }));
  }
  // Antipode overlay edges (dashed, hidden by default)
  const ag = ce("g", { class: "antipodes" });
  for (const [a, b] of D.ANTIPODES) {
    const A = hammingNodes[a], B = hammingNodes[b];
    ag.appendChild(ce("line", {
      x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      class: "edge antipode-overlay",
      opacity: 0
    }));
  }
  svg.append(ag, eg);
  // Vertices
  const vg = ce("g", { class: "vertices" });
  for (let n = 1; n <= 72; n++) {
    const N = hammingNodes[n];
    const c = ce("circle", {
      cx: N.x.toFixed(1), cy: N.y.toFixed(1), r: 6,
      class: "vertex", "data-mela": n,
      onclick: () => { state.mela = n; },
      onmouseenter: () => { highlightHammingNeighbors(n); }
    });
    vg.appendChild(c);
    if (n <= 24 || n % 6 === 0) {
      vg.appendChild(ce("text", {
        x: N.x, y: N.y - 9, "text-anchor": "middle",
        class: "vertex-label", text: n
      }));
    }
  }
  svg.appendChild(vg);
  paintHammingState();
}

function highlightHammingNeighbors(n) {
  const neighbors = new Set(D.NEIGHBORS[n].all);
  qall('.edge', qsel("#hamming-svg")).forEach(e => {
    const a = parseInt(e.dataset.a, 10), b = parseInt(e.dataset.b, 10);
    e.classList.toggle("is-incident", a === n || b === n);
  });
}
function paintHammingState() {
  const svg = qsel("#hamming-svg");
  if (!svg) return;
  const a = state.mela;
  const nbrs = new Set(D.NEIGHBORS[a].all);
  qall('.vertex', svg).forEach(v => {
    const m = parseInt(v.dataset.mela, 10);
    v.classList.toggle("is-active", m === a);
    v.classList.toggle("is-neighbor", nbrs.has(m));
  });
  qall('.edge', svg).forEach(e => {
    if (e.classList.contains("antipode-overlay")) return;
    const ea = parseInt(e.dataset.a, 10), eb = parseInt(e.dataset.b, 10);
    e.classList.toggle("is-incident", ea === a || eb === a);
  });
  // Live "active mela" sidebar update
  const card = qsel("#hamming-active-card");
  if (card) {
    const m = D.MELA[a];
    card.innerHTML = "";
    card.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft", text: "Active" }));
    card.appendChild(ce("div", { class: "font-display text-xl mt-1", text: m.name }));
    card.appendChild(ce("div", { class: "font-mono text-[11px] text-ink-soft mt-0.5", text: `Mela ${m.n} · ${m.hex} · ${m.forte}` }));
    const ngs = ce("div", { class: "mt-3 text-[11px] font-mono text-ink-soft" });
    ngs.appendChild(ce("div", { text: `9 d=2 neighbours: ${D.NEIGHBORS[a].L.length}+${D.NEIGHBORS[a].U.length}+${D.NEIGHBORS[a].M.length}` }));
    ngs.appendChild(ce("div", { class: "mt-1", text: `R-G swaps: ${D.NEIGHBORS[a].L.join(", ")}` }));
    ngs.appendChild(ce("div", { class: "mt-1", text: `D-N swaps: ${D.NEIGHBORS[a].U.join(", ")}` }));
    ngs.appendChild(ce("div", { class: "mt-1", text: `M swap: ${D.NEIGHBORS[a].M.join(", ")}` }));
    card.appendChild(ngs);
    const antipode = 73 - m.n;
    card.appendChild(ce("div", {
      class: "mt-3 pt-3 border-t border-ink/15 text-[11px] font-mono",
      text: `Antipode (d=10): mela ${antipode} · ${D.MELA[antipode].name}`
    }));
  }
}

function buildDistHistogram() {
  const wrap = ce("div", { class: "border-l-2 border-ink/15 pl-4" });
  wrap.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-3", text: "Distance distribution" }));
  const data = [
    { d: 2, n: 324 }, { d: 4, n: 936 }, { d: 6, n: 936 }, { d: 8, n: 324 }, { d: 10, n: 36 }
  ];
  const max = 936;
  const svgW = 180, svgH = 120;
  const svg = ce("svg", { viewBox: `0 0 ${svgW} ${svgH}`, class: "w-full" });
  const barW = 24, gap = 8;
  data.forEach((d, i) => {
    const h = (d.n / max) * (svgH - 30);
    const x = 10 + i * (barW + gap);
    const y = svgH - 16 - h;
    svg.appendChild(ce("rect", {
      x, y, width: barW, height: h,
      class: `dist-bar ${d.d === 10 ? "is-key" : ""}`,
      "data-d": d.d
    }));
    svg.appendChild(ce("text", {
      x: x + barW/2, y: svgH - 4, "text-anchor": "middle",
      class: "icv-axis-label", text: d.d
    }));
    svg.appendChild(ce("text", {
      x: x + barW/2, y: y - 4, "text-anchor": "middle",
      class: "icv-axis-label", text: d.n
    }));
  });
  wrap.appendChild(svg);
  wrap.appendChild(ce("p", { class: "text-[10px] font-mono text-ink-soft mt-2 leading-snug", text: "The 36 distance-10 pairs are exactly the K₂ antipodes." }));
  return wrap;
}
function buildHammingActiveCard() {
  return ce("div", { id: "hamming-active-card", class: "border-l-2 border-kumkum/40 pl-4" });
}

// ═══ Gray Walk (Plate IV) ════════════════════════════════════════════════

function renderGraycode({ partial = false } = {}) {
  const body = qsel("#graycode-body");
  if (!body) return;
  if (body.dataset.built !== "1") {
    body.dataset.built = "1";
    body.innerHTML = "";

    const layout = ce("div", { class: "grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start" });
    const svgWrap = ce("div", { class: "border border-ink/12 bg-vellum-2/30", style: "aspect-ratio: 1/1;" });
    const svg = ce("svg", { id: "gray-svg", viewBox: "0 0 600 600", class: "w-full h-full" });
    svgWrap.appendChild(svg);
    layout.appendChild(svgWrap);

    const side = ce("div", { class: "flex flex-col gap-5" });
    side.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft", text: "Step" }));

    const stepLabel = ce("div", { id: "gray-step-label", class: "font-display text-3xl" });
    side.appendChild(stepLabel);
    const stepDetail = ce("div", { id: "gray-step-detail", class: "font-mono text-[11px] text-ink-soft" });
    side.appendChild(stepDetail);

    const slider = ce("input", {
      id: "gray-slider", type: "range", min: 0, max: 71, value: 0,
      class: "paper-range w-full mt-3",
      oninput: (e) => { state.step = parseInt(e.target.value, 10); state.mela = D.GRAY_PATH[state.step]; }
    });
    side.appendChild(slider);

    const ctrls = ce("div", { class: "flex gap-2 mt-2" });
    ctrls.appendChild(ce("button", { class: "paper-btn", text: "← step", onclick: () => { const s = (state.step ?? 0); const ns = (s - 1 + 72) % 72; state.step = ns; state.mela = D.GRAY_PATH[ns]; } }));
    ctrls.appendChild(ce("button", { class: "paper-btn", text: "step →", onclick: () => { const s = (state.step ?? 0); const ns = (s + 1) % 72; state.step = ns; state.mela = D.GRAY_PATH[ns]; } }));
    ctrls.appendChild(ce("button", { class: "paper-btn", text: "Jump to M-crossing", onclick: () => { state.step = D.M_CROSSING_INDEX; state.mela = D.GRAY_PATH[D.M_CROSSING_INDEX]; } }));
    side.appendChild(ctrls);

    side.appendChild(ce("div", {
      class: "mt-4 pt-4 border-t border-ink/15 font-body italic text-ink-soft text-sm",
      html: `Step <span class="kt">${D.M_CROSSING_INDEX + 1}</span> of the path is the only madhyama edge — provably minimal. The path leaves Mela <span class="kt">${D.GRAY_PATH[D.M_CROSSING_INDEX]}</span> for Mela <span class="kt">${D.GRAY_PATH[D.M_CROSSING_INDEX+1]}</span>; everywhere else, only one R-G or D-N bit toggles.`
    }));

    body.appendChild(layout);
    drawGrayRing();
  }
  paintGrayState();
}
renderers.graycode = renderGraycode;

function drawGrayRing() {
  const svg = qsel("#gray-svg");
  if (!svg) return;
  const W = 600, H = 600;
  const cx = W/2, cy = H/2, R = 240;
  // Background ring
  svg.innerHTML = "";

  // Bezier chord edges between consecutive path positions
  const eg = ce("g", { class: "gray-edges" });
  const positions = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU - Math.PI / 2;
    positions.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  for (let i = 0; i < 72; i++) {
    const A = positions[i], B = positions[(i + 1) % 72];
    if (i === 71) continue;   // path is open, not a cycle
    // Quadratic with control toward center @ 30%
    const cxc = cx + (((A.x + B.x)/2 - cx) * 0.7);
    const cyc = cy + (((A.y + B.y)/2 - cy) * 0.7);
    const isM = i === D.M_CROSSING_INDEX;
    eg.appendChild(ce("path", {
      d: `M ${A.x.toFixed(1)} ${A.y.toFixed(1)} Q ${cxc.toFixed(1)} ${cyc.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`,
      class: `gray-edge ${isM ? "m-crossing" : ""}`,
      "data-step": i
    }));
  }
  svg.appendChild(eg);

  // Step markers
  const mg = ce("g", { class: "gray-markers" });
  for (let i = 0; i < 72; i++) {
    const p = positions[i];
    const m = D.GRAY_PATH[i];
    mg.appendChild(ce("circle", {
      cx: p.x, cy: p.y, r: 3.5,
      class: "gray-step-marker",
      "data-step": i, "data-mela": m,
      onclick: () => { state.step = i; state.mela = m; },
      onmouseenter: () => { state.step = i; state.mela = m; }
    }));
    if (i === 0 || i === D.M_CROSSING_INDEX || i === 71) {
      mg.appendChild(ce("text", {
        x: p.x + 8, y: p.y - 6,
        class: "gray-step-label",
        text: `${i+1}: ${D.MELA[m].name}`
      }));
    }
  }
  svg.appendChild(mg);

  // M-crossing dagger annotation
  const mp = positions[D.M_CROSSING_INDEX];
  svg.appendChild(ce("text", {
    x: mp.x, y: mp.y - 14, "text-anchor": "middle",
    class: "gray-step-label",
    style: "fill: var(--kumkum); font-weight: 500;",
    text: "✦ M-crossing"
  }));

  // Idle pulse dot — animates around the path on a 24s timeline
  const dot = ce("circle", { id: "gray-pulse-dot", cx: positions[0].x, cy: positions[0].y, r: 5, class: "gray-pulse-dot" });
  svg.appendChild(dot);

  startGrayPulse(positions);
}

let grayPulseRAF = 0;
let grayPulseT0 = 0;
let grayPulsePaused = false;
function startGrayPulse(positions) {
  cancelAnimationFrame(grayPulseRAF);
  grayPulseT0 = performance.now();
  const period = 24000;
  const tick = (now) => {
    if (grayPulsePaused) { grayPulseRAF = requestAnimationFrame(tick); return; }
    const t = ((now - grayPulseT0) % period) / period;
    const idx = t * 71;
    const i0 = Math.floor(idx);
    const i1 = (i0 + 1) % 72;
    const f = idx - i0;
    const A = positions[i0], B = positions[i1];
    if (!A || !B) { grayPulseRAF = requestAnimationFrame(tick); return; }
    const x = A.x + (B.x - A.x) * f;
    const y = A.y + (B.y - A.y) * f;
    const dot = qsel("#gray-pulse-dot");
    if (dot) { dot.setAttribute("cx", x.toFixed(1)); dot.setAttribute("cy", y.toFixed(1)); }
    grayPulseRAF = requestAnimationFrame(tick);
  };
  grayPulseRAF = requestAnimationFrame(tick);
}

function paintGrayState() {
  const svg = qsel("#gray-svg");
  if (!svg) return;
  const step = state.step ?? D.GRAY_PATH.indexOf(state.mela);
  qall('.gray-step-marker', svg).forEach(c => {
    c.classList.toggle("is-current", parseInt(c.dataset.step, 10) === step);
  });
  const slider = qsel("#gray-slider");
  if (slider && step != null && step >= 0) slider.value = step;
  const lbl = qsel("#gray-step-label");
  if (lbl && step != null && step >= 0) {
    const m = D.MELA[D.GRAY_PATH[step]];
    lbl.textContent = `${step + 1}/72 · ${m.name}`;
  }
  const det = qsel("#gray-step-detail");
  if (det && step != null && step >= 0) {
    const cur = D.GRAY_PATH[step], nxt = D.GRAY_PATH[Math.min(step + 1, 71)];
    const xor = D.MELA[cur].bits ^ D.MELA[nxt].bits;
    const kind = xor === D.K1 ? "M-swap (madhyama)" : (xor & 0x780) ? "R-G swap" : "D-N swap";
    det.innerHTML = `${D.MELA[cur].hex} → ${D.MELA[nxt].hex}  ·  ${step === 71 ? "(end of path)" : kind}`;
  }
}

// ═══ Z-Triangle (Plate V) ════════════════════════════════════════════════

function renderZrelation({ partial = false } = {}) {
  const body = qsel("#zrelation-body");
  if (!body) return;
  if (body.dataset.built !== "1") {
    body.dataset.built = "1";
    body.innerHTML = "";

    // Three-card row
    const cards = ce("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-6" });
    for (const n of [40, 48, 49]) cards.appendChild(buildZCard(n));
    body.appendChild(cards);

    // ICV overlay row — three histograms aligned y-axis
    const icvRow = ce("div", { class: "grid grid-cols-3 gap-6 mt-2" });
    for (const n of [40, 48, 49]) icvRow.appendChild(buildICVChart(n));
    body.appendChild(icvRow);

    // Relation arcs — explicit, with labels
    const arcs = ce("div", { class: "mt-10 border-t border-ink/15 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm" });
    arcs.appendChild(ce("div", { class: "border-l-2 border-indigo/60 pl-4", html: `<div class='text-[10px] font-mono uppercase tracking-[0.2em] text-ink-soft'>Z-relation</div><div class='font-display italic mt-1'>Mela 40 ↔ Mela 48</div><div class='text-ink-soft mt-1'>Same IC vector, not <span class='kt'>T<sub>n</sub></span>- or <span class='kt'>T<sub>n</sub>I</span>-related.</div>` }));
    arcs.appendChild(ce("div", { class: "border-l-2 border-indigo/60 pl-4", html: `<div class='text-[10px] font-mono uppercase tracking-[0.2em] text-ink-soft'>Z-relation</div><div class='font-display italic mt-1'>Mela 40 ↔ Mela 49</div><div class='text-ink-soft mt-1'>Same IC vector, not <span class='kt'>T<sub>n</sub></span>- or <span class='kt'>T<sub>n</sub>I</span>-related.</div>` }));
    arcs.appendChild(ce("div", { class: "border-l-2 border-brass/70 pl-4", html: `<div class='text-[10px] font-mono uppercase tracking-[0.2em] text-ink-soft'>T<sub>7</sub>I-relation</div><div class='font-display italic mt-1'>Mela 48 ↔ Mela 49</div><div class='text-ink-soft mt-1'>Within Forte 7-Z18; not a Z-pair.</div>` }));
    body.appendChild(arcs);

    // A/B blind test
    body.appendChild(buildBlindTest());

    body.appendChild(ce("div", {
      class: "mt-10 pt-6 border-t border-ink/15 font-body italic text-ink-soft text-sm max-w-3xl",
      html: "All three of Navanītaṃ (40), Divyamaṇi (48) and Dhavaḷāmbarī (49) share the interval-class vector <span class='kt'>⟨4, 3, 4, 4, 4, 2⟩</span>. The other two heptachord Z-pairs Forte catalogued (7-Z12/Z36, 7-Z17/Z37) are <em>structurally forbidden</em> in the Melakarta system: their prime forms contain five-semitone chromatic clusters that no Melakarta tetrachord can host."
    }));
  }
}
renderers.zrelation = renderZrelation;

function buildZCard(n) {
  const m = D.MELA[n];
  const card = ce("div", { class: "border border-ink/15 p-5 bg-vellum-2/30" });
  card.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] text-ink-soft", text: `Mela ${n}` }));
  card.appendChild(ce("h3", { class: "font-display text-2xl mt-1", text: m.name }));
  card.appendChild(ce("div", { class: "font-display italic text-ink-soft", text: m.nameIAST }));
  card.appendChild(ce("div", { class: "font-mono text-[11px] mt-2 text-ink-2", text: `${m.hex} · Forte ${m.forte}` }));
  card.appendChild(ce("div", { class: "font-mono text-[11px] text-ink-soft", text: `Prime form (${m.primeForm.join(",")})` }));
  // 12-tone clock
  card.appendChild(buildPCClock(m.pcSet, m.roughPCs, 160));
  // Play
  const playBtn = ce("button", {
    class: "paper-btn mt-3", text: "Audition",
    onclick: () => audition(n)
  });
  card.appendChild(playBtn);
  return card;
}

function buildPCClock(pcs, roughPCs, size = 140) {
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const svg = ce("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "mt-3" });
  // ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    svg.appendChild(ce("line", {
      x1: cx + (r-2)*Math.cos(a), y1: cy + (r-2)*Math.sin(a),
      x2: cx + (r+2)*Math.cos(a), y2: cy + (r+2)*Math.sin(a),
      class: "clock-tick"
    }));
  }
  // pcs
  const set = new Set(pcs);
  const rough = new Set(roughPCs || []);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const isLit = set.has(i);
    const isSa = i === 0, isPa = i === 7;
    const isRough = rough.has(i);
    svg.appendChild(ce("circle", {
      cx: x, cy: y, r: 5.5,
      class: `clock-pc ${isLit ? "lit" : ""} ${isLit && isSa ? "sa" : ""} ${isLit && isPa ? "pa" : ""} ${isLit && isRough ? "rough" : ""}`
    }));
    svg.appendChild(ce("text", {
      x: cx + (r + 12) * Math.cos(a), y: cy + (r + 12) * Math.sin(a) + 3,
      "text-anchor": "middle", class: "clock-label", text: i
    }));
  }
  return svg;
}

function buildICVChart(n) {
  const m = D.MELA[n];
  const wrap = ce("div", { class: "border-l border-ink/15 pl-4" });
  wrap.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-1", text: `IC vector of Mela ${n}` }));
  wrap.appendChild(ce("div", { class: "font-mono text-[11px] mb-2", text: `⟨${m.icv.join(", ")}⟩` }));
  // Pixel-locked y-axis: max = 6 across all three (since (4,3,4,4,4,2) maxes at 4 here)
  const max = 6;
  const W = 200, H = 100;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full" });
  const barW = 24, gap = 6;
  m.icv.forEach((v, i) => {
    const h = (v / max) * (H - 24);
    const x = 6 + i * (barW + gap);
    const y = H - 14 - h;
    svg.appendChild(ce("rect", {
      x, y, width: barW, height: h,
      class: `icv-bar ${[40,48,49].includes(n) ? "is-key" : ""}`
    }));
    svg.appendChild(ce("text", { x: x + barW/2, y: H - 4, "text-anchor": "middle", class: "icv-axis-label", text: i + 1 }));
    svg.appendChild(ce("text", { x: x + barW/2, y: y - 3, "text-anchor": "middle", class: "icv-axis-label", text: v }));
  });
  wrap.appendChild(svg);
  return wrap;
}

function buildBlindTest() {
  const wrap = ce("div", { class: "mt-10 border border-ink/20 p-5 bg-vellum-2/40" });
  wrap.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] text-ink-soft", text: "A/B Test" }));
  wrap.appendChild(ce("h3", { class: "font-display text-xl mt-1", text: "Can you hear the Z-relation?" }));
  wrap.appendChild(ce("p", { class: "font-body italic text-ink-soft text-sm mt-2 max-w-2xl", text: "A short svara phrase — the same scale-degree pattern — is rendered in two of the three Z-melas. Their interval-class vectors are identical; their pitch-class sets are not." }));
  const ctrls = ce("div", { class: "flex flex-wrap items-center gap-3 mt-4" });
  let lastChoice = null;
  const reveal = ce("div", { id: "blind-reveal", class: "font-mono text-[11px] text-ink-soft" });
  const startBtn = ce("button", { class: "paper-btn", text: "Play A then B", onclick: async () => {
    const choices = [[40, 48], [40, 49], [48, 40], [49, 40], [48, 49]];
    const pick = choices[Math.floor(Math.random() * choices.length)];
    lastChoice = pick;
    reveal.textContent = "(playing…)";
    await playPhrase(pick[0]);
    await sleep(600);
    await playPhrase(pick[1]);
    reveal.textContent = "Did A and B share an IC vector? Make your guess.";
  }});
  const sameBtn = ce("button", { class: "paper-btn", text: "Same IC vector", onclick: () => guessBT(true) });
  const diffBtn = ce("button", { class: "paper-btn", text: "Different",       onclick: () => guessBT(false) });
  function guessBT(same) {
    if (!lastChoice) { reveal.textContent = "Press Play A then B first."; return; }
    const [a, b] = lastChoice;
    const actuallySame = D.MELA[a].icv.join(",") === D.MELA[b].icv.join(",");
    const correct = actuallySame === same;
    const score = JSON.parse(localStorage.getItem("z_test_score") || `{"hits":0,"total":0}`);
    score.total++; if (correct) score.hits++;
    localStorage.setItem("z_test_score", JSON.stringify(score));
    reveal.textContent = `${correct ? "Correct." : "Not quite."}  A = mela ${a} (${D.MELA[a].forte}); B = mela ${b} (${D.MELA[b].forte}).  Their IC vectors are ${actuallySame ? "the same" : "different"}.  Score: ${score.hits}/${score.total}.`;
    lastChoice = null;
  }
  ctrls.append(startBtn, sameBtn, diffBtn);
  wrap.append(ctrls, reveal);
  return wrap;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ═══ Vivadi Lab (Plate VI) ═══════════════════════════════════════════════

function renderVivadi({ partial = false } = {}) {
  const body = qsel("#vivadi-body");
  if (!body) return;
  if (body.dataset.built !== "1") {
    body.dataset.built = "1";
    body.innerHTML = "";

    // Filter tabs
    const tabs = ce("div", { class: "flex flex-wrap gap-2 mb-6" });
    const filters = [
      { k: "all",       label: "All 72" },
      { k: "extremal",  label: "Extremally vivadi · 40" },
      { k: "naive",     label: "Naïve vivadi · 54" },
      { k: "exception", label: "Exception set X · 14" },
      { k: "avivadi",   label: "Avivadi · 32" }
    ];
    filters.forEach(f => {
      tabs.appendChild(ce("button", {
        class: "paper-btn", "data-filter": f.k, text: f.label,
        onclick: () => { state.vivadiFilter = f.k; }
      }));
    });
    body.appendChild(tabs);

    // 6×6 nibble grid
    const grid = ce("div", { class: "grid grid-cols-7 gap-1 max-w-3xl" });
    grid.appendChild(ce("div"));    // empty corner
    for (const dn of D.ADMISSIBLE_NIBBLES_DN) {
      grid.appendChild(ce("div", { class: "text-[10px] font-mono text-ink-soft text-center pb-1", text: `D-N 0x${dn.toString(16).toUpperCase()}` }));
    }
    for (const rg of D.ADMISSIBLE_NIBBLES_RG) {
      grid.appendChild(ce("div", { class: "text-[10px] font-mono text-ink-soft self-center text-right pr-1", text: `R-G 0x${rg.toString(16).toUpperCase()}` }));
      for (const dn of D.ADMISSIBLE_NIBBLES_DN) {
        const cell = ce("div", { class: "nibble-cell", "data-rg": rg, "data-dn": dn });
        const ext = (rg === 0x3 || rg === 0xC || dn === 0x3 || dn === 0xC);
        const both = (rg === 0x3 || rg === 0xC) && (dn === 0x3 || dn === 0xC);
        if (both) cell.classList.add("both-extremal");
        else if (ext) cell.classList.add("one-extremal");
        const list = D.NIBBLE_GRID.get(`${rg}-${dn}`) || [];
        for (const n of list) {
          const a = ce("a", { href: `#/vivadi&mela=${n}`, class: "block hover:text-kumkum", text: `${n} ${D.MELA[n].name.slice(0,12)}`, onclick: (e) => { e.preventDefault(); state.mela = n; if (window.audioEngine) window.audioEngine.playVivadiProbe(n); } });
          cell.appendChild(a);
        }
        grid.appendChild(cell);
      }
    }
    body.appendChild(grid);

    // Perceptual hypothesis prose
    body.appendChild(ce("div", {
      class: "mt-10 max-w-3xl border-l-2 border-kumkum/40 pl-5 font-body italic text-ink-soft",
      html: "Click any extremally-vivadi mela in the grid to hear the perceptual hypothesis of §7.4: a faintly-detuned drone harmonic at +7 cents, beating against Sa or Pa at audible roughness. The fourteen melas of the exception set X have <em>nibble 0x6 in either tetrachord</em> — interior chromatic, away from the structural boundary; for these the probe is silent."
    }));
  }
  // Update filter tab + cell highlight
  qall('button[data-filter]').forEach(b => b.classList.toggle("is-on", b.dataset.filter === state.vivadiFilter));
  applyVivadiFilter(state.vivadiFilter);
}
renderers.vivadi = renderVivadi;

function applyVivadiFilter(kind) {
  qall('.nibble-cell').forEach(cell => {
    const rg = parseInt(cell.dataset.rg, 10);
    const dn = parseInt(cell.dataset.dn, 10);
    const list = D.NIBBLE_GRID.get(`${rg}-${dn}`) || [];
    let dim = false;
    if (kind === "extremal") {
      const ext = (rg === 0x3 || rg === 0xC || dn === 0x3 || dn === 0xC);
      dim = !ext;
    } else if (kind === "naive") {
      const nai = ([0x3,0x6,0xC].includes(rg) || [0x3,0x6,0xC].includes(dn));
      dim = !nai;
    } else if (kind === "exception") {
      const ext = (rg === 0x3 || rg === 0xC || dn === 0x3 || dn === 0xC);
      const nai = ([0x3,0x6,0xC].includes(rg) || [0x3,0x6,0xC].includes(dn));
      dim = !(nai && !ext);
    } else if (kind === "avivadi") {
      const nai = ([0x3,0x6,0xC].includes(rg) || [0x3,0x6,0xC].includes(dn));
      dim = nai;
    }
    cell.classList.toggle("dimmed", dim);
  });
}

// ═══ Audition / playPhrase shim ══════════════════════════════════════════
// Audio engine is loaded asynchronously on first need.

let audioPromise = null;
async function ensureAudio() {
  if (window.audioEngine) return window.audioEngine;
  if (!audioPromise) {
    document.getElementById("audio-gate").classList.remove("hidden");
    audioPromise = new Promise((resolve) => {
      document.getElementById("audio-gate-button").addEventListener("click", async () => {
        document.getElementById("audio-gate").classList.add("hidden");
        const mod = await import("./audio/engine.js");
        const eng = await mod.createEngine();
        window.audioEngine = eng;
        resolve(eng);
      }, { once: true });
    });
  }
  return audioPromise;
}
async function audition(n) {
  const e = await ensureAudio();
  e.playMelaArpeggio(n);
}
async function playPhrase(n) {
  const e = await ensureAudio();
  return e.playPhrase(n);
}

// ═══ ROLI Lightpad Block (Web MIDI) ══════════════════════════════════════
// Lazy-initialised on first connect press in the Console; the AudioContext
// is woken by the same gesture (the audio-gate overlay) for iOS parity.

let roliPromise = null;
let roliBlock = null;

function bitmaskFromRoughPCs(pcs) {
  let m = 0;
  for (const pc of (pcs || [])) m |= (1 << pc);
  return m;
}

async function ensureMidi() {
  if (roliBlock) return roliBlock;
  if (roliPromise) return roliPromise;
  if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
    throw new Error("Web MIDI is unavailable in this browser");
  }
  // Audio context too — same first-gesture covers both
  await ensureAudio();
  roliPromise = (async () => {
    const mod = await import("./hardware/roli.js");
    const block = new mod.RoliBlock({
      onConnect: (info) => {
        roliBlock = block;
        state.roli = { connected: true, fallbackCC: state.roli.fallbackCC, info };
        // Push current state as soon as we connect.
        pushRagaToRoli();
      },
      onDisconnect: () => {
        state.roli = { connected: false, fallbackCC: state.roli.fallbackCC, info: null };
      },
      onTouchStart: (e) => {
        // Map MIDI note → pitch class + octave; play through the audio engine.
        const pc = e.midi % 12;
        const midiOctave = Math.floor((e.midi - 60) / 12);
        const dur = 0.6;
        if (window.audioEngine) {
          window.audioEngine.playMidi(e.midi, dur);
        }
      },
      onTouchMove: (e) => {
        // X (pitchbend) feeds gamaka — handled by the audio engine's per-voice
        // pitch follower if implemented. For v1 we just forward into a CC
        // event the engine can read on its next tick.
        if (window.audioEngine && window.audioEngine.setExpressiveTouch) {
          window.audioEngine.setExpressiveTouch(e);
        }
      },
      onTouchEnd: () => {
        // Voices envelope-out on note-off; nothing to do here in v1.
      },
      onButton: (buttonId) => {
        // Map Block buttons → Web actions
        if      (buttonId === 0x01) applyXOR(D.K1);
        else if (buttonId === 0x02) applyXOR(D.K2);
        else if (buttonId === 0x03) applyXOR(D.K3);
        else if (buttonId === 0x04) state.octaveShift = clamp(state.octaveShift + 1, -2, 2);
        else if (buttonId === 0x05) state.octaveShift = clamp(state.octaveShift - 1, -2, 2);
        else if (buttonId === 0x06) {
          if (window.audioEngine) {
            // Toggle drone — the engine exposes startDrone/stopDrone as separate
            // calls; we keep a flag in window.audioEngine._droneOn for parity.
            if (window.audioEngine._droneOn) { window.audioEngine.stopDrone(); window.audioEngine._droneOn = false; }
            else { window.audioEngine.startDrone(); window.audioEngine._droneOn = true; }
          }
        }
      }
    });
    await block.connect();
    return block;
  })();
  return roliPromise;
}

function pushRagaToRoli() {
  if (!roliBlock || !state.roli.connected) return;
  const m = D.MELA[state.mela];
  const roughMask = bitmaskFromRoughPCs(m.roughPCs);
  roliBlock.sendRagaState(m.bits, m.vivadi.extremal, roughMask);
  roliBlock.sendMelaInfo(m.n, 0);
}

// Push raga to the Block whenever state changes.
on("mela",        () => pushRagaToRoli());
on("octaveShift", (s) => { if (roliBlock) roliBlock.sendOctaveShift(s); paintPerformLite(); });

function paintPerformLite() {
  // Lightweight repaint of just the Console margin — no full rebuild.
  if (state.view !== "perform") return;
  const meta = qsel("#perform-mela-meta");
  if (meta) {
    const m = D.MELA[state.mela];
    const roli = state.roli.connected ? `· roli ✓` : "";
    meta.textContent = `Mela ${m.n} · ${m.hex} · ${m.forte} · orbit ${m.orbitId} · oct ${state.octaveShift >= 0 ? "+" : ""}${state.octaveShift} ${roli}`;
  }
  const status = qsel("#perform-roli-status");
  if (status) renderRoliStatus(status);
}

// ═══ Plates I, VII, VIII, IX (Encoding, Cross, Empirical, Colophon) ══════

function renderEncoding() {
  const body = qsel("#encoding-body");
  if (!body) return;
  if (body.dataset.built === "1") { paintEncoding(); return; }
  body.dataset.built = "1";
  body.innerHTML = "";

  const grid = ce("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-10" });
  // Left: bit-vector display
  const left = ce("div");
  const bvHeader = ce("div", { class: "flex items-center justify-between mb-3" });
  bvHeader.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft", text: "Twelve-bit vector" }));
  const legendLink = ce("a", {
    class: "color-legend-link",
    text: "Color legend ↓",
    href: "#",
    title: "Open colour legend (press `l`)",
    onclick: (e) => { e.preventDefault(); toggleColorLegend(); }
  });
  bvHeader.appendChild(legendLink);
  left.appendChild(bvHeader);
  const bvWrap = ce("div", { id: "encoding-bv", class: "border-l-2 border-ink/15 pl-5 py-2" });
  left.appendChild(bvWrap);

  // Below: kaṭapayādi mnemonic
  left.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mt-8 mb-2", text: "Kaṭapayādi" }));
  const ktp = ce("div", { id: "encoding-katapayadi", class: "font-body italic text-ink-soft text-sm" });
  left.appendChild(ktp);

  grid.appendChild(left);

  // Right: XOR calculator
  const right = ce("div");
  right.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-3", text: "XOR Calculator" }));
  const calc = ce("div", { class: "border-l-2 border-ink/15 pl-5 py-2 space-y-3" });

  const aSel = ce("select", { id: "xor-a", class: "paper-select w-full", onchange: () => paintEncoding() });
  const bSel = ce("select", { id: "xor-b", class: "paper-select w-full", onchange: () => paintEncoding() });
  for (let n = 1; n <= 72; n++) {
    const label = `${String(n).padStart(2,"0")} · ${D.MELA[n].hex} · ${D.MELA[n].name}`;
    aSel.appendChild(ce("option", { value: n, text: label }));
    bSel.appendChild(ce("option", { value: n, text: label }));
  }
  aSel.value = 15;
  bSel.value = 51;
  calc.appendChild(ce("div", { class: "text-[10px] font-mono uppercase text-ink-soft", text: "A" })); calc.appendChild(aSel);
  calc.appendChild(ce("div", { class: "text-[10px] font-mono uppercase text-ink-soft mt-2", text: "B" })); calc.appendChild(bSel);

  // Visualization: bit-positions header + A / B / A⊕B rows
  const vis = ce("div", { id: "xor-vis", class: "mt-4 space-y-1" });
  // Static bit-index header row (bit 11 .. 0, left → right)
  const head = ce("div", { class: "flex items-center gap-3" });
  head.appendChild(ce("div", { class: "w-8" }));                                          // label gutter
  head.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft w-12" }));     // hex gutter
  const headCells = ce("div", { class: "grid grid-cols-12 gap-[2px] flex-1" });
  const swaraLabels = ["S", "R₁", "r/g", "r/g", "G₃", "M₂", "M₁", "P", "N₃", "d/n", "d/n", "D₁"];
  for (let i = 0; i < 12; i++) {
    const bit = 11 - i;
    const cell = ce("div", { class: "text-center font-mono text-[9px] text-ink-soft leading-tight" });
    cell.appendChild(ce("div", { text: String(bit) }));
    cell.appendChild(ce("div", { class: "font-body italic", style: "font-size:9px;", text: swaraLabels[i] }));
    headCells.appendChild(cell);
  }
  head.appendChild(headCells);
  vis.appendChild(head);

  vis.appendChild(ce("div", { id: "xor-a-vis" }));
  vis.appendChild(ce("div", { id: "xor-b-vis" }));
  // Operator divider
  const op = ce("div", { class: "flex items-center gap-3 pt-1" });
  op.appendChild(ce("div", { class: "w-8 font-mono text-[12px] text-ink-soft text-right", text: "⊕" }));
  op.appendChild(ce("div", { class: "w-12" }));
  op.appendChild(ce("div", { class: "flex-1 border-t border-ink/20" }));
  vis.appendChild(op);
  vis.appendChild(ce("div", { id: "xor-r-vis" }));
  calc.appendChild(vis);

  calc.appendChild(ce("div", { id: "xor-result", class: "mt-3 font-mono text-[12px]" }));
  calc.appendChild(ce("div", {
    class: "font-body italic text-ink-soft text-[12px] leading-relaxed mt-3 pt-3 border-t border-ink/10",
    html: "The XOR mask <span class='font-mono not-italic'>A ⊕ B</span> has a 1-bit wherever the two melas disagree. Each differing bit is painted in its harmonic-function colour: <strong class='not-italic'>top-heavy</strong> means the swara lives in A and is leaving (↑), <strong class='not-italic'>bottom-heavy</strong> means it is arriving in B (↓) — so a glance at the row tells you the direction of every swara that moves. <strong class='not-italic'>Popcount</strong> counts those 1-bits; the <strong class='not-italic'>Hamming distance</strong> <span class='font-mono not-italic'>d(A, B)</span> is the number of swara positions where A and B differ, and for any two bit-vectors equals the popcount of their XOR. Mela-pairs at <span class='font-mono not-italic'>d = 2</span> are adjacent in the Hamming graph (Plate III); the unique masks <span class='font-mono not-italic'>K₁, K₂, K₃</span> generate the Klein-four orbits."
  }));
  right.appendChild(calc);

  // Six admissible nibble shapes — palette
  right.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mt-10 mb-3", text: "Admissible tetrachord nibbles" }));
  const palette = ce("div", { class: "grid grid-cols-6 gap-2" });
  const labels = ["Type 1: R₁G₁ / D₁N₁", "Type 2: R₁G₂ / D₁N₂", "Type 3: R₁G₃ / D₁N₃", "Type 4: R₂G₂ / D₂N₂", "Type 5: R₂G₃ / D₂N₃", "Type 6: R₃G₃ / D₃N₃"];
  D.ADMISSIBLE_NIBBLES_RG.forEach((rg, i) => {
    const cell = ce("div", { class: "border border-ink/15 p-2 text-center" });
    cell.appendChild(ce("div", { class: "font-mono text-[12px]", text: `0x${rg.toString(16).toUpperCase()}` }));
    cell.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft mt-1", text: rg.toString(2).padStart(4,"0") }));
    cell.appendChild(ce("div", { class: "font-body italic text-[10px] text-ink-soft mt-1", text: labels[i] }));
    palette.appendChild(cell);
  });
  right.appendChild(palette);

  grid.appendChild(right);
  body.appendChild(grid);

  paintEncoding();
}
renderers.encoding = renderEncoding;

function paintEncoding() {
  const m = D.MELA[state.mela];
  const bv = qsel("#encoding-bv");
  if (!bv) return;
  bv.innerHTML = "";

  // Active mela header
  bv.appendChild(ce("div", { class: "font-display text-2xl", text: m.name }));
  bv.appendChild(ce("div", { class: "font-display italic text-ink-soft", text: m.nameIAST }));
  bv.appendChild(ce("div", { class: "font-mono text-[11px] text-ink-soft mt-1", text: `Mela ${m.n} · chakra ${m.chakra}/12 · position ${m.position}/6` }));

  // Bit grid: 12 cells with region labels + harmonic-function colour
  const cells = ce("div", { class: "mt-4 grid grid-cols-12 gap-1" });
  for (let bit = 11; bit >= 0; bit--) {
    const i = 11 - bit;
    const isOn = !!(m.bits & (1 << bit));
    let region = "U";
    if (bit === 11) region = "S";
    else if (bit === 4) region = "P";
    else if (bit >= 7) region = "L";
    else if (bit === 5 || bit === 6) region = "M";
    const fn = BIT_FUNC[bit];
    const cell = ce("div", { class: "flex flex-col items-center" });
    cell.appendChild(ce("div", {
      class: `bit-cell region-${region} func-${fn} ${isOn ? "on" : ""}`,
      style: "width:18px; height:30px;",
      title: `bit ${bit} · ${SWARA_BY_TRAVERSAL[i]} · ${FUNC_FAMILY[fn]}`
    }));
    cell.appendChild(ce("div", { class: "font-mono text-[9px] text-ink-soft mt-1", text: bit }));
    cells.appendChild(cell);
  }
  bv.appendChild(cells);
  bv.appendChild(ce("div", { class: "font-mono text-[12px] mt-3", text: `${m.hex}  =  ${m.binary.replace(/(.{4})(?=.)/g, "$1 ")}` }));
  bv.appendChild(ce("div", { class: "font-mono text-[11px] mt-1 text-ink-soft", text: `pcSet  {${m.pcSet.join(", ")}}` }));

  // Kaṭapayādi mnemonic
  const ktp = qsel("#encoding-katapayadi");
  if (ktp) {
    const map = { 1:"क/ट/प/य", 2:"ख/ठ/फ/र", 3:"ग/ड/ब/ल", 4:"घ/ढ/भ/व", 5:"ङ/ण/म/श", 6:"च/त/-/ष", 7:"छ/थ/-/स", 8:"ज/द/-/ह", 9:"झ/ध/-/-", 0:"ञ/न/-/-" };
    const c = m.chakra, p = m.position;
    const num = c * 10 + p;     // not the usual kaṭapayādi reverse, but mnemonic enough
    ktp.innerHTML = `Mela <span class='kt'>${m.n}</span> = <span class='kt'>6(c−1) + p</span> with c=<span class='kt'>${c}</span>, p=<span class='kt'>${p}</span>. Madhyama is <span class='kt'>M${c <= 6 ? "₁" : "₂"}</span> since c ${c <= 6 ? "≤" : "≥"} ${c <= 6 ? "6" : "7"}.`;
  }

  // XOR calculator
  const aN = parseInt(qsel("#xor-a").value, 10);
  const bN = parseInt(qsel("#xor-b").value, 10);
  const aBits = D.MELA[aN].bits;
  const bBits = D.MELA[bN].bits;
  const xor = aBits ^ bBits;
  const pop = D.popcount(xor);

  const aVis = qsel("#xor-a-vis"); if (aVis) { aVis.innerHTML = ""; aVis.appendChild(buildXorRow("A", aBits)); }
  const bVis = qsel("#xor-b-vis"); if (bVis) { bVis.innerHTML = ""; bVis.appendChild(buildXorRow("B", bBits)); }
  const rVis = qsel("#xor-r-vis"); if (rVis) { rVis.innerHTML = ""; rVis.appendChild(buildXorDiffRow(aBits, bBits)); }

  const r = qsel("#xor-result");
  if (r) {
    let interp = `popcount = ${pop} ⇒ Hamming distance ${pop}`;
    if (xor === D.K1) interp += " · Mask 0x060 — K₁ (madhyama swap).";
    else if (xor === D.K2) interp += " · Mask 0x7EF — K₂ (antipodal complement).";
    else if (xor === D.K3) interp += " · Mask 0x78F — K₃ (full Klein generator).";
    else if (xor === 0) interp = "A and B are the same mela.";
    r.innerHTML = `<span class='text-ink-soft'>${interp}</span>`;
  }
}

// ─── Quake-style colour-legend drawer ─────────────────────────────────────
// Built lazily on first toggle and reused. Closed with ESC or the link.
function ensureColorLegendBuilt() {
  const drawer = qsel("#color-legend");
  if (!drawer || drawer.dataset.built === "1") return drawer;
  drawer.dataset.built = "1";

  const header = ce("div", { class: "qd-header" });
  header.appendChild(ce("div", { text: "// Color Legend · harmonic-function vocabulary" }));
  const right = ce("div", { class: "flex items-center gap-3" });
  right.appendChild(ce("span", { class: "text-[10px] opacity-60", text: "press l or esc to close" }));
  right.appendChild(ce("button", { class: "qd-close", text: "× close", onclick: closeColorLegend }));
  header.appendChild(right);
  drawer.appendChild(header);

  const body = ce("div", { class: "qd-body" });
  body.appendChild(ce("p", {
    class: "qd-prose",
    html: "Bit vectors across the site share the same colour vocabulary as the Guitar Fretboard. The twelve chromatic positions split into four harmonic-function families — pillars, chord-defining thirds and sevenths, expressive extensions, and dissonant alterations. The same hue means the same scale-degree role wherever you see it."
  }));

  body.appendChild(ce("h3", { text: "Families" }));
  const fams = [
    { name: "Structural",  swatch: "root",  members: "1 (Sa · root), 5 (Pa · perfect fifth)" },
    { name: "Quality",     swatch: "maj3",  members: "♭3 / 3 (minor / major third), ♭7 / 7 (minor / major seventh)" },
    { name: "Extensions",  swatch: "2",     members: "2 (major second), 4 (perfect fourth · slate-teal), 6 (major sixth)" },
    { name: "Altered",     swatch: "b5",    members: "♭2 (flat second), ♭5 (tritone), ♭6 (flat sixth)" },
  ];
  fams.forEach(f => {
    const row = ce("div", { class: "qd-fam" });
    const swatchWrap = ce("div", { class: "flex items-center gap-2" });
    swatchWrap.appendChild(ce("span", {
      class: `bit-cell on func-${f.swatch}`,
      style: "width:14px; height:14px; display:inline-block; border-radius:2px;"
    }));
    swatchWrap.appendChild(ce("span", { class: "qd-fam-name", text: f.name }));
    row.appendChild(swatchWrap);
    row.appendChild(ce("div", { class: "opacity-80", text: f.members }));
    body.appendChild(row);
  });

  body.appendChild(ce("h3", { text: "By bit position" }));
  const grid = ce("div", { class: "qd-swatch-row" });
  for (let i = 0; i < 12; i++) {
    const bit = 11 - i;
    const fn = BIT_FUNC[bit];
    const cell = ce("div", {
      class: `qd-swatch bit-cell on func-${fn}`,
      title: `${SWARA_BY_TRAVERSAL[i]} · ${FUNC_FAMILY[fn]}`
    });
    cell.appendChild(ce("div", { class: "swara", text: SWARA_BY_TRAVERSAL[i] }));
    cell.appendChild(ce("div", { class: "ivl",   text: IVL_BY_TRAVERSAL[i] }));
    cell.appendChild(ce("div", { class: "bit",   text: `bit ${bit}` }));
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  body.appendChild(ce("p", {
    class: "qd-prose mt-4",
    style: "font-size:11px; opacity:0.7;",
    html: "On Plate I, the active mela's bit grid and the A ⊕ B calculator use these colours. The A ⊕ B row paints each differing bit as a vertical gradient — colour pooled at the top means the swara is in A and leaves (↑); colour rising from the bottom means it arrives in B (↓)."
  }));

  drawer.appendChild(body);
  return drawer;
}
function openColorLegend() {
  const d = ensureColorLegendBuilt();
  if (!d) return;
  d.classList.add("open");
  d.setAttribute("aria-hidden", "false");
}
function closeColorLegend() {
  const d = qsel("#color-legend");
  if (!d) return;
  d.classList.remove("open");
  d.setAttribute("aria-hidden", "true");
}
function toggleColorLegend() {
  const d = qsel("#color-legend");
  if (d && d.classList.contains("open")) closeColorLegend();
  else openColorLegend();
}

// ─── Bit → harmonic-function vocabulary (shared with guitar.html) ─────────
// Each of the 12 bits is mapped to its chromatic semitone, then to one of
// four colour families: Structural · Quality · Extensions · Altered.
// SWARA / IVL_LABEL are indexed by traversal position i = (11 - bit).
const SWARA_BY_TRAVERSAL = ["S", "R₁", "R₂/G₁", "R₃/G₂", "G₃", "M₂", "M₁", "P", "N₃", "D₃/N₂", "D₂/N₁", "D₁"];
const IVL_BY_TRAVERSAL   = ["1",  "♭2",  "2",      "♭3",     "3",   "♭5",  "4",  "5", "7",   "♭7",     "6",      "♭6"];
// BIT_FUNC[bit] = harmonic-function token used in `bit-cell.func-{token}` and `.qd-swatch`.
const BIT_FUNC = {
  11: "root", 10: "b2",  9: "2",  8: "min3", 7: "maj3",
  6: "b5",   5: "4",
  4: "p5",
  3: "maj7", 2: "min7", 1: "6",  0: "b6",
};
const FUNC_FAMILY = {
  root: "Structural", p5: "Structural",
  maj3: "Quality",    min3: "Quality",   maj7: "Quality", min7: "Quality",
  "2":  "Extensions", "4":  "Extensions", "6": "Extensions",
  b2: "Altered",      b6: "Altered",     b5: "Altered",
};
// CSS colour per bit (mirrors the `.bit-cell.func-*` HSLs in styles.css).
// Used inline by the A⊕B row to paint directional gradients.
const BIT_HSL = {
  11: "hsl(38, 85%, 38%)",   // root
  10: "hsl(268, 38%, 42%)",  // b2
   9: "hsl(168, 60%, 38%)",  // 2
   8: "hsl(2, 72%, 38%)",    // min3
   7: "hsl(10, 82%, 42%)",   // maj3
   6: "hsl(278, 45%, 32%)",  // b5
   5: "hsl(195, 30%, 36%)",  // 4
   4: "hsl(36, 72%, 34%)",   // p5
   3: "hsl(350, 65%, 42%)",  // maj7
   2: "hsl(340, 52%, 38%)",  // min7
   1: "hsl(174, 48%, 36%)",  // 6
   0: "hsl(273, 32%, 38%)",  // b6
};

// Per pitch-class lookups (PITCH_TO_BIT applied to the bit tables above).
// pc 0..11 = Sa, R₁, R₂/G₁, R₃/G₂, G₃, M₁, M₂, P, D₁, D₂/N₁, D₃/N₂, N₃.
// Use these in any view that paints a pitch class — instrument surfaces,
// mela tiles, the on-screen Lightpad preview, etc.
const PC_FUNC = ["root", "b2", "2", "min3", "maj3", "4", "b5", "p5", "b6", "6", "min7", "maj7"];
const PC_HSL  = [
  BIT_HSL[11], BIT_HSL[10], BIT_HSL[9],  BIT_HSL[8], BIT_HSL[7],
  BIT_HSL[5],  BIT_HSL[6],  BIT_HSL[4],
  BIT_HSL[0],  BIT_HSL[1],  BIT_HSL[2],  BIT_HSL[3],
];

// Specialised row for A⊕B: each differing bit becomes a vertical gradient
// of the bit's harmonic-function colour — solid at the top if the note lives
// in A only (departing), solid at the bottom if it lives in B only (arriving).
// Non-differing bits stay empty so the row reads as pure "movement".
function buildXorDiffRow(aBits, bBits) {
  const xor = aBits ^ bBits;
  const wrap = ce("div", { class: "flex items-center gap-3" });
  wrap.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft uppercase tracking-wider w-8 text-right", text: "A⊕B" }));
  wrap.appendChild(ce("div", { class: "font-mono text-[12px] w-12", text: `0x${xor.toString(16).toUpperCase().padStart(3,"0")}` }));
  const row = ce("div", { class: "grid grid-cols-12 gap-[2px] flex-1" });
  for (let i = 0; i < 12; i++) {
    const bit = 11 - i;
    const mask = 1 << bit;
    const aOn = !!(aBits & mask);
    const bOn = !!(bBits & mask);
    const diffs = aOn !== bOn;
    let region = "U";
    if (bit === 11) region = "S";
    else if (bit === 4) region = "P";
    else if (bit >= 7) region = "L";
    else if (bit === 5 || bit === 6) region = "M";
    const fn = BIT_FUNC[bit];
    const hsl = BIT_HSL[bit];
    let cls = `bit-cell region-${region} func-${fn}`;
    let style = "width:100%; height:24px;";
    let title = `bit ${bit} · ${SWARA_BY_TRAVERSAL[i]} · ${FUNC_FAMILY[fn]}`;
    if (diffs) {
      cls += " xor-diff";
      if (aOn) {
        // In A, gone in B → colour pools at the top, fades down.
        style += ` background: linear-gradient(to bottom, ${hsl} 0%, ${hsl} 32%, transparent 100%); border-color: ${hsl};`;
        title += " · in A, removed in B (↑)";
      } else {
        // Absent in A, present in B → colour rises from the bottom.
        style += ` background: linear-gradient(to bottom, transparent 0%, ${hsl} 68%, ${hsl} 100%); border-color: ${hsl};`;
        title += " · added in B (↓)";
      }
    }
    row.appendChild(ce("div", { class: cls, style: style, title: title }));
  }
  wrap.appendChild(row);
  return wrap;
}

// Build one row of the XOR visualization: [label]  [hex]  [12 harmonic-function cells].
// (Used for the A and B rows; the A⊕B row goes through `buildXorDiffRow`.)
function buildXorRow(label, bits, { diffMask = null } = {}) {
  const wrap = ce("div", { class: "flex items-center gap-3" });
  wrap.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft uppercase tracking-wider w-8 text-right", text: label }));
  wrap.appendChild(ce("div", { class: "font-mono text-[12px] w-12", text: `0x${bits.toString(16).toUpperCase().padStart(3,"0")}` }));
  const row = ce("div", { class: "grid grid-cols-12 gap-[2px] flex-1" });
  for (let i = 0; i < 12; i++) {
    const bit = 11 - i;
    const mask = 1 << bit;
    const isOn = !!(bits & mask);
    const isDiff = diffMask !== null && !!(diffMask & mask);
    let region = "U";
    if (bit === 11) region = "S";
    else if (bit === 4) region = "P";
    else if (bit >= 7) region = "L";
    else if (bit === 5 || bit === 6) region = "M";
    let cls = `bit-cell region-${region} func-${BIT_FUNC[bit]}`;
    if (isOn) cls += " on";
    if (isDiff) cls += " diff";
    row.appendChild(ce("div", {
      class: cls,
      style: "width:100%; height:24px;",
      title: `bit ${bit} · ${SWARA_BY_TRAVERSAL[i]} · ${FUNC_FAMILY[BIT_FUNC[bit]]}${isOn ? " · on" : ""}${isDiff ? " · differs" : ""}`
    }));
  }
  wrap.appendChild(row);
  return wrap;
}

function renderCross() {
  const body = qsel("#cross-body");
  if (!body) return;
  if (body.dataset.built === "1") { paintCross(); return; }
  body.dataset.built = "1";
  body.innerHTML = "";

  // Forte 7-35 septagon
  const wrap = ce("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-10" });
  const septagon = ce("div");
  septagon.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-3", text: "Forte 7-35 · the diatonic family" }));
  septagon.appendChild(buildModeSeptagon());
  septagon.appendChild(ce("p", { class: "font-body italic text-ink-soft text-sm mt-3 max-w-prose", html: "All six melas of <span class='kt'>7-35</span> are mode-rotations of one another. Mela <span class='kt'>29</span> Dhīraśaṅkarābharaṇaṃ is the Western major scale; the others its modes." }));
  wrap.appendChild(septagon);

  // 7-22 callout
  const callout = ce("div");
  callout.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-3", text: "Forte 7-22 · the harmonic kin" }));
  const cwrap = ce("div", { class: "border-l-2 border-kumkum/50 pl-5" });
  const m15 = D.MELA[15], m57 = D.MELA[57];
  cwrap.innerHTML = `
    <div class='font-display text-3xl'>15 ↔ 57</div>
    <div class='font-display italic text-ink-soft'>${m15.nameIAST} ↔ ${m57.nameIAST}</div>
    <div class='font-mono text-[11px] text-ink-soft mt-2'>${m15.hex} → ${m57.hex}</div>
    <div class='mt-4 font-body italic text-ink-soft'>
      Both sit in <span class='kt'>7-22</span>. They are <span class='kt'>T<sub>7</sub></span>-related in pitch-class terms — Mela 57 is the fourth mode of Mela 15.
      To Western ears, Double harmonic major and Hungarian minor; to Carnatic ears, two parents that share their interval-class shape but not their root.
    </div>
  `;
  callout.appendChild(cwrap);
  wrap.appendChild(callout);

  body.appendChild(wrap);

  // Forte stratification table
  body.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mt-12 mb-3", text: "Forte stratification — 24 classes across the 72" }));
  const tbl = ce("div", { class: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" });
  const sorted = [...D.FORTE_TABLE.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [forte, members] of sorted) {
    const card = ce("div", { class: "border border-ink/12 p-3" });
    card.appendChild(ce("div", { class: "font-mono text-[11px]", text: forte }));
    card.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft", text: `${members.length} mela${members.length>1?"s":""}` }));
    card.appendChild(ce("div", { class: "font-body italic text-[11px] text-ink-soft mt-1", text: members.slice(0, 6).map(n => D.MELA[n].name).join(", ") + (members.length > 6 ? ", …" : "") }));
    tbl.appendChild(card);
  }
  body.appendChild(tbl);
}
renderers.cross = renderCross;
function paintCross() {}

function buildModeSeptagon() {
  const m735 = D.FORTE_TABLE.get("7-35") || [];
  const W = 360, H = 360;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full max-w-md" });
  const cx = W/2, cy = H/2, R = 130;
  // 7 vertices for 7 modes (we have 6 melas plus an implicit 7th rotation)
  // Just place the 6 actual melas:
  const N = m735.length;
  m735.forEach((n, i) => {
    const a = (i / N) * TAU - Math.PI / 2;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    svg.appendChild(ce("circle", { cx: x, cy: y, r: 6, class: "vertex", "data-mela": n, onclick: () => state.mela = n }));
    svg.appendChild(ce("text", { x: cx + (R+22)*Math.cos(a), y: cy + (R+22)*Math.sin(a)+4, "text-anchor": "middle", class: "vertex-label font-mono", text: D.MELA[n].name }));
  });
  // connect them with light edges
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a1 = (i / N) * TAU - Math.PI / 2;
    const a2 = (j / N) * TAU - Math.PI / 2;
    svg.appendChild(ce("line", {
      x1: cx + R*Math.cos(a1), y1: cy + R*Math.sin(a1),
      x2: cx + R*Math.cos(a2), y2: cy + R*Math.sin(a2),
      stroke: "var(--ink)", "stroke-width": 0.5, opacity: 0.3
    }));
  }
  return svg;
}

function renderEmpirical() {
  const body = qsel("#empirical-body");
  if (!body) return;
  if (body.dataset.built === "1") return;
  body.dataset.built = "1";
  body.innerHTML = "";

  body.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.18em] text-ink-soft mb-3", text: "Janya count by chakra × position" }));
  // 12 chakras × 6 positions
  const heatWrap = ce("div", { class: "max-w-3xl" });
  // Header
  const head = ce("div", { class: "grid grid-cols-[60px_repeat(6,1fr)] gap-1 mb-1 font-mono text-[10px] text-ink-soft" });
  head.appendChild(ce("div", { text: "" }));
  for (let p = 1; p <= 6; p++) head.appendChild(ce("div", { class: "text-center", text: `pos ${p}` }));
  heatWrap.appendChild(head);
  // Find max known janya for normalization
  const maxJanya = Math.max(...Object.values(D.JANYA_KNOWN));
  for (let c = 1; c <= 12; c++) {
    const row = ce("div", { class: "grid grid-cols-[60px_repeat(6,1fr)] gap-1 mb-1" });
    row.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft self-center text-right pr-2", text: `c ${c}` }));
    for (let p = 1; p <= 6; p++) {
      const n = (c - 1) * 6 + p;
      const m = D.MELA[n];
      const j = m.janya;
      const known = j != null;
      const cell = ce("div", {
        class: "border border-ink/12 p-2 text-center cursor-pointer hover:border-ink-soft transition-colors",
        title: `${m.name} · ${known ? `${j} janyas (App. C)` : "janya count unknown to this codebase"}`,
        onclick: () => state.mela = n
      });
      const intensity = known ? Math.log(j + 1) / Math.log(maxJanya + 1) : 0;
      const bg = known ? `rgba(139, 46, 31, ${(0.08 + 0.55 * intensity).toFixed(3)})` : "transparent";
      cell.style.backgroundColor = bg;
      cell.appendChild(ce("div", { class: "font-mono text-[10px]", text: n }));
      cell.appendChild(ce("div", { class: "font-display text-[11px] leading-tight mt-0.5", text: m.name.slice(0, 11) }));
      cell.appendChild(ce("div", { class: "font-mono text-[10px] text-ink-soft mt-0.5", text: known ? j : "?" }));
      row.appendChild(cell);
    }
    heatWrap.appendChild(row);
  }
  body.appendChild(heatWrap);

  body.appendChild(ce("div", {
    class: "mt-8 max-w-3xl border-l-2 border-ink/20 pl-5 font-body italic text-ink-soft",
    html: `Counts shown for melas 1–15 are taken verbatim from the paper's Appendix C (Wikipedia snapshot, 22 April 2026). Counts for melas 16–72 are unknown to this codebase and are shown as <span class='kt'>?</span>. The paper reports the full per-mela table and finds Forte-class population to be a robust positive predictor of janya count: Spearman <span class='kt'>ρ = +0.46</span>, <span class='kt'>p &lt; 10<sup>−4</sup></span> on the full sample of 902 janyas; the top Klein orbit, <span class='kt'>{15, 22, 51, 58}</span>, accounts for <span class='kt'>194</span>.`
  }));
}
renderers.empirical = renderEmpirical;

function renderColophon() {
  const body = qsel("#colophon-body");
  if (!body) return;
  if (body.dataset.built === "1") return;
  body.dataset.built = "1";
  body.innerHTML = "";
  const grid = ce("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl" });
  const left = ce("div");
  left.appendChild(ce("h3", { class: "font-display text-2xl mb-3", text: "References" }));
  left.appendChild(ce("ul", { class: "space-y-3 font-body text-sm text-ink-2" }));
  const ul = left.querySelector("ul");
  const refs = [
    "Allen Forte. <em>The Structure of Atonal Music.</em> Yale University Press, 1973.",
    "Govindācārya. <em>Sangraha Chudamani.</em> c. 1750.",
    "Yusuke Imai, Stephen C. Dellby, Nobuaki Tanaka. General theory of music by icosahedron 3: Musical invariant and Melakarta raga. arXiv:2109.12475, 2021.",
    "Robert D. Morris. <em>Composition with Pitch-Classes.</em> Yale University Press, 1987.",
    "John Rahn. <em>Basic Atonal Theory.</em> Longman, 1980.",
    "Ian Ring. A study of musical scales. ianring.com/musictheory/scales/, 2024–2026.",
    "P. Sambamurthy. <em>South Indian Music,</em> vols. I–VI. The Indian Music Publishing House, Madras, 1963–1973.",
    "William A. Sethares. <em>Tuning, Timbre, Spectrum, Scale.</em> Springer, 2nd ed., 2005.",
    "Venkaṭamakhin. <em>Chaturdandi Prakāśikā.</em> c. 1635."
  ];
  for (const r of refs) ul.appendChild(ce("li", { html: r }));
  grid.appendChild(left);

  const right = ce("div");
  right.appendChild(ce("h3", { class: "font-display text-2xl mb-3", text: "Methods" }));
  right.appendChild(ce("p", { class: "font-body italic text-ink-soft text-sm leading-relaxed", html: "All bit data is computed at boot from the encoding of paper §2.3. The Warnsdorff Hamiltonian is solved live and the result asserted against the paper's invariants; if the assertion fails, a banner appears at the top of the page. Forte prime forms are computed by Forte's procedure. Janya counts are read only from the paper's Appendix C; the remainder are not assumed."}));
  right.appendChild(ce("h3", { class: "font-display text-xl mt-8 mb-3", text: "Citation" }));
  right.appendChild(ce("pre", { class: "font-mono text-[11px] bg-vellum-2 p-4 border border-ink/15 leading-snug", text: "Author. The algebraic structure of the seventy-two Melakartas. Working paper.\nSee accompanying interactive companion at this URL." }));
  grid.appendChild(right);

  body.appendChild(grid);
}
renderers.colophon = renderColophon;

// ═══ Console (Plate ∞ — Perform) ═════════════════════════════════════════

function renderPerform({ partial = false } = {}) {
  const stage = qsel("#perform-stage");
  if (!stage) return;
  if (stage.dataset.built !== "1") {
    stage.dataset.built = "1";
    stage.innerHTML = "";

    // Header
    const head = ce("div", { class: "perform-header" });
    const left = ce("div");
    left.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.32em]", style: "color: var(--ink-soft);", text: "The Console · ∞" }));
    left.appendChild(ce("div", { id: "perform-mela-name", class: "font-display text-3xl mt-1" }));
    left.appendChild(ce("div", { id: "perform-mela-meta", class: "font-mono text-[11px]", style: "color: var(--ink-soft);" }));
    head.appendChild(left);

    const right = ce("div", { class: "flex items-center gap-3" });
    const instSel = ce("select", {
      class: "paper-select",
      id: "perform-instrument-select",
      style: "background: transparent; color: var(--ink); border-color: var(--ink-soft);",
      onchange: (e) => { state.instrument = e.target.value; }
    });
    for (const [v, label] of [["yantra","Yantra wheel"], ["fretboard","Fretboard"], ["piano","Piano roll"], ["vina","Vīṇa neck"], ["roli","ROLI Lightpad (hardware)"]]) {
      instSel.appendChild(ce("option", { value: v, text: label }));
    }
    instSel.value = state.instrument;
    right.appendChild(instSel);
    const exitBtn = ce("button", { class: "paper-btn", text: "← Exit (~)", onclick: () => { state.mode = "explore"; state.view = "atlas"; } });
    right.appendChild(exitBtn);
    head.appendChild(right);

    stage.appendChild(head);

    // Left margin: meta + sa-grama keys + drone controls
    const leftCol = ce("div", { class: "perform-left" });
    leftCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em]", style: "color: var(--ink-soft);", text: "Tonic" }));
    const sruti = ce("input", { type: "range", min: 196, max: 294, step: 1, value: 220, class: "paper-range w-full", oninput: (e) => { window.audioEngine?.setSa(parseInt(e.target.value, 10)); } });
    leftCol.appendChild(sruti);
    leftCol.appendChild(ce("div", { class: "font-mono text-[10px]", style: "color: var(--ink-soft);", text: "Sa pitch (Hz)" }));

    leftCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "Drone" }));
    const droneBtns = ce("div", { class: "flex gap-2" });
    droneBtns.appendChild(ce("button", { class: "paper-btn", text: "Tambura on", onclick: async () => { (await ensureAudio()).startDrone(); } }));
    droneBtns.appendChild(ce("button", { class: "paper-btn", text: "Mute", onclick: async () => { (await ensureAudio()).stopDrone(); } }));
    leftCol.appendChild(droneBtns);

    leftCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "Klein generators" }));
    const kBtns = ce("div", { class: "grid grid-cols-3 gap-2" });
    kBtns.appendChild(ce("button", { class: "paper-btn", text: "K₁", onclick: () => applyXOR(D.K1) }));
    kBtns.appendChild(ce("button", { class: "paper-btn", text: "K₂", onclick: () => applyXOR(D.K2) }));
    kBtns.appendChild(ce("button", { class: "paper-btn", text: "K₃", onclick: () => applyXOR(D.K3) }));
    leftCol.appendChild(kBtns);

    leftCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "Gray walk" }));
    const gw = ce("div", { class: "flex gap-2" });
    gw.appendChild(ce("button", { class: "paper-btn", text: "Walk", onclick: async () => { (await ensureAudio()).startGrayWalk(); } }));
    gw.appendChild(ce("button", { class: "paper-btn", text: "Stop", onclick: async () => { (await ensureAudio()).stopGrayWalk(); } }));
    leftCol.appendChild(gw);

    stage.appendChild(leftCol);

    // Center: instrument surface
    const center = ce("div", { class: "perform-center", id: "perform-center" });
    stage.appendChild(center);

    // Right margin: exports
    const rightCol = ce("div", { class: "perform-right" });
    rightCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em]", style: "color: var(--ink-soft);", text: "Export" }));
    const exGrid = ce("div", { class: "grid grid-cols-1 gap-2" });
    exGrid.appendChild(ce("button", { class: "paper-btn", text: "Engrave .scl (active mela)", onclick: () => downloadSCL(state.mela) }));
    exGrid.appendChild(ce("button", { class: "paper-btn", text: "Engrave Gray-walk .mid", onclick: () => downloadGrayMidi() }));
    exGrid.appendChild(ce("button", { class: "paper-btn", text: "Engrave master .json", onclick: () => downloadMasterJson() }));
    rightCol.appendChild(exGrid);

    rightCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "Active orbit" }));
    rightCol.appendChild(ce("div", { id: "perform-orbit-info", class: "font-mono text-[11px]" }));

    rightCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "9 d=2 morph pads" }));
    const padsWrap = ce("div", { id: "perform-pads", class: "grid grid-cols-3 gap-2" });
    rightCol.appendChild(padsWrap);

    // ROLI Lightpad status panel
    rightCol.appendChild(ce("div", { class: "text-[10px] font-mono uppercase tracking-[0.2em] mt-6", style: "color: var(--ink-soft);", text: "ROLI Lightpad" }));
    const roliStatus = ce("div", { id: "perform-roli-status", class: "font-mono text-[11px] flex flex-col gap-2" });
    rightCol.appendChild(roliStatus);

    stage.appendChild(rightCol);
  }

  // Repaint instrument
  paintPerform();
}
renderers.perform = renderPerform;

function paintPerform() {
  const m = D.MELA[state.mela];
  const nameEl = qsel("#perform-mela-name"); if (nameEl) nameEl.textContent = m.name;
  const metaEl = qsel("#perform-mela-meta");
  if (metaEl) {
    const roli = state.roli.connected ? `· roli ✓` : "";
    metaEl.textContent = `Mela ${m.n} · ${m.hex} · ${m.forte} · orbit ${m.orbitId} · oct ${state.octaveShift >= 0 ? "+" : ""}${state.octaveShift} ${roli}`;
  }
  const roliPanel = qsel("#perform-roli-status");
  if (roliPanel) renderRoliStatus(roliPanel);

  const orbInfo = qsel("#perform-orbit-info");
  if (orbInfo) {
    orbInfo.innerHTML = "";
    const members = m.orbitMembers;
    for (const x of members) {
      orbInfo.appendChild(ce("a", {
        href: `#/perform&mela=${x}`,
        class: x === m.n ? "block py-0.5" : "block py-0.5 hover:underline",
        style: x === m.n ? "color: var(--kumkum);" : "",
        text: `${x === m.n ? "● " : "  "}${String(x).padStart(2,"0")} · ${D.MELA[x].name}`,
        onclick: (e) => { e.preventDefault(); state.mela = x; }
      }));
    }
  }

  // d=2 pads
  const pads = qsel("#perform-pads");
  if (pads) {
    pads.innerHTML = "";
    const all = [...D.NEIGHBORS[m.n].L.map(n => ({n, region: "L"})),
                 ...D.NEIGHBORS[m.n].U.map(n => ({n, region: "U"})),
                 ...D.NEIGHBORS[m.n].M.map(n => ({n, region: "M"}))];
    for (const { n, region } of all) {
      const b = ce("button", {
        class: "paper-btn",
        style: region === "L" ? "color: var(--indigo); border-color: var(--indigo);" :
               region === "U" ? "color: var(--ink); border-color: var(--ink-soft);" :
                                "color: var(--brass); border-color: var(--brass);",
        text: `${region}·${n}`,
        title: D.MELA[n].name,
        onclick: () => { state.mela = n; }
      });
      pads.appendChild(b);
    }
  }

  // Render the chosen instrument
  const center = qsel("#perform-center");
  if (!center) return;
  center.innerHTML = "";
  const inst = state.instrument || "yantra";
  const sel = qsel("#perform-instrument-select");
  if (sel && sel.value !== inst) sel.value = inst;
  if (inst === "yantra") center.appendChild(buildYantra());
  else if (inst === "fretboard") center.appendChild(buildFretboard());
  else if (inst === "piano") center.appendChild(buildPianoRoll());
  else if (inst === "vina") center.appendChild(buildVinaNeck());
  else if (inst === "roli") center.appendChild(buildRoliPreview());
}

// ─── ROLI status panel + on-screen preview of the Block layout ────────

function renderRoliStatus(root) {
  root.innerHTML = "";
  if (!navigator.requestMIDIAccess) {
    root.appendChild(ce("div", { class: "text-ink-soft", text: "Web MIDI is unavailable in this browser." }));
    return;
  }
  if (state.roli.connected) {
    const info = state.roli.info || {};
    root.appendChild(ce("div", { class: "text-kumkum", text: `Connected · ${info.inputName || "Lightpad"}` }));
    if (info.manufacturer) root.appendChild(ce("div", { style: "color: var(--ink-soft);", text: info.manufacturer }));
    const row = ce("div", { class: "flex gap-2 mt-1" });
    row.appendChild(ce("button", {
      class: state.roli.fallbackCC ? "paper-btn is-on" : "paper-btn",
      text: state.roli.fallbackCC ? "Fallback CCs ON" : "Use Standard CCs",
      onclick: () => {
        const next = !state.roli.fallbackCC;
        state.roli = { ...state.roli, fallbackCC: next };
        if (roliBlock) roliBlock.sendFallbackMode(next);
        renderRoliStatus(root);
      }
    }));
    row.appendChild(ce("button", {
      class: "paper-btn", text: "Disconnect",
      onclick: () => { roliBlock?.disconnect(); roliBlock = null; roliPromise = null; renderRoliStatus(root); }
    }));
    root.appendChild(row);
    root.appendChild(ce("div", { class: "mt-1", style: "color: var(--ink-soft);", text: `Octave shift: ${state.octaveShift >= 0 ? "+" : ""}${state.octaveShift}` }));
  } else {
    root.appendChild(ce("div", { class: "text-ink-soft", text: "Disconnected — connect a Lightpad Block via USB." }));
    const btn = ce("button", { class: "paper-btn mt-1", text: "Connect", onclick: async () => {
      try { await ensureMidi(); }
      catch (e) {
        const err = ce("div", { class: "text-kumkum mt-1", text: e.message || String(e) });
        root.appendChild(err);
      }
    } });
    root.appendChild(btn);
  }
}

function buildRoliPreview() {
  // On-screen mirror of the 15×15 Block layout.  Useful when developing
  // without hardware connected, and as live "what is the Block showing"
  // visualization when connected.
  const m = D.MELA[state.mela];
  const W = 600, H = 600;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full max-w-[600px]" });
  const cellW = W / 15, cellH = H / 15;

  // Title
  svg.appendChild(ce("text", {
    x: W/2, y: 18, "text-anchor": "middle",
    style: "font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.18em; fill: var(--ink-soft); text-transform:uppercase;",
    text: state.roli.connected ? "ROLI Lightpad — live mirror" : "ROLI Lightpad — preview (connect to drive hardware)"
  }));

  for (let row = 0; row < 15; row++) {
    const nibble = row % 3;        // 0 = upper bits, 1 = mid, 2 = lower
    const bits = nibble === 0 ? (m.bits >> 8) & 0xF
              :  nibble === 1 ? (m.bits >> 4) & 0xF
              :                 m.bits & 0xF;
    const rowOctave = 2 - Math.floor(row / 3);    // +2 .. -2
    for (let col = 0; col < 15; col++) {
      const x = col * cellW + 2;
      const y = row * cellH + 24;
      const w = cellW - 4;
      const h = cellH - 4;

      let fill = "var(--vellum-2)";
      let stroke = "var(--rule)";
      let label = "";

      if (col < 12) {
        const bitGroup = Math.floor(col / 3);
        const bitMask = 1 << (3 - bitGroup);
        const isLit = !!(bits & bitMask);
        let pc = nibble === 0 ? bitGroup
              :  nibble === 1 ? 4 + bitGroup
              :                 11 - bitGroup;
        if (isLit) {
          fill = PC_HSL[pc];
          stroke = PC_HSL[pc];
          if (m.roughPCs.includes(pc)) { stroke = "var(--kumkum)"; }
          if (col % 3 === 1) label = D.PITCH_NAMES_SHORT[pc];
        }
      } else if (col === 12) { fill = "var(--indigo)"; stroke = "var(--indigo)"; if (row === 7) label = "K₁"; }
      else if (col === 13) { fill = "var(--indigo)"; stroke = "var(--indigo)"; if (row === 7) label = "K₂"; }
      else /* col === 14 */ {
        if (row < 7)        { fill = "var(--indigo)"; stroke = "var(--indigo)"; if (row === 3) label = "K₃"; }
        else if (row < 10)  { fill = "var(--brass)"; stroke = "var(--brass)"; if (row === 8) label = "+"; }
        else if (row < 13)  { fill = "var(--brass)"; stroke = "var(--brass)"; if (row === 11) label = "−"; }
        else                { fill = "var(--ink)"; stroke = "var(--ink)"; if (row === 13) label = "drone"; }
      }

      svg.appendChild(ce("rect", {
        x, y, width: w, height: h,
        fill, stroke, "stroke-width": 0.5
      }));
      if (label) {
        svg.appendChild(ce("text", {
          x: x + w/2, y: y + h/2 + 3, "text-anchor": "middle",
          style: "font-family:'JetBrains Mono',monospace; font-size:8px; fill: var(--vellum); pointer-events:none;",
          text: label
        }));
      }
    }
    // Octave label on the left
    if (row % 3 === 1) {
      svg.appendChild(ce("text", {
        x: 8, y: row * cellH + 24 + cellH/2 + 3,
        style: "font-family:'JetBrains Mono',monospace; font-size:8px; fill: var(--ink-soft);",
        text: (rowOctave > 0 ? "+" : "") + rowOctave
      }));
    }
  }

  // Caption
  svg.appendChild(ce("text", {
    x: 8, y: H - 4,
    style: "font-family:'JetBrains Mono',monospace; font-size:9px; fill: var(--ink-soft);",
    text: `5 octaves × 3 nibble-rows · cols 12-13 = K₁ K₂ · col 14 = K₃ + oct± + drone`
  }));

  return svg;
}

function buildYantra() {
  const m = D.MELA[state.mela];
  const W = 720, H = 720;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "yantra-svg w-full h-full max-w-[720px]" });
  const cx = W/2, cy = H/2;
  const Rrim = 320, Rin = 160;

  // Outer rim — 72 melas in Gray-path order
  const positions = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU - Math.PI / 2;
    positions.push({ a, x: cx + Rrim * Math.cos(a), y: cy + Rrim * Math.sin(a), mela: D.GRAY_PATH[i] });
  }
  // Active rotation: rotate so active mela sits at 12 o'clock
  const activeIdx = D.GRAY_PATH.indexOf(m.n);
  const rotateBy = -activeIdx * (TAU / 72);
  positions.forEach(p => {
    const a = p.a + rotateBy;
    p.x = cx + Rrim * Math.cos(a); p.y = cy + Rrim * Math.sin(a);
  });

  // Background concentric circles
  svg.appendChild(ce("circle", { cx, cy, r: Rrim, fill: "none", stroke: "var(--ink-soft)", "stroke-width": 0.4, opacity: 0.4 }));
  svg.appendChild(ce("circle", { cx, cy, r: Rin,  fill: "none", stroke: "var(--ink-soft)", "stroke-width": 0.4, opacity: 0.5 }));

  // Rim vertices
  positions.forEach(p => {
    const isActive = p.mela === m.n;
    const isNeighbor = D.NEIGHBORS[m.n].all.includes(p.mela);
    svg.appendChild(ce("circle", {
      cx: p.x, cy: p.y, r: isActive ? 7 : (isNeighbor ? 4.5 : 2.5),
      class: `yantra-rim-vertex ${isActive ? "is-active" : ""} ${isNeighbor ? "is-neighbor" : ""}`,
      onclick: () => state.mela = p.mela
    }));
    if (isActive || isNeighbor) {
      svg.appendChild(ce("text", {
        x: cx + (Rrim + 18) * Math.cos(((D.GRAY_PATH.indexOf(p.mela) - activeIdx + 72) % 72) / 72 * TAU - Math.PI/2),
        y: cy + (Rrim + 18) * Math.sin(((D.GRAY_PATH.indexOf(p.mela) - activeIdx + 72) % 72) / 72 * TAU - Math.PI/2) + 3,
        "text-anchor": "middle", class: "yantra-rim-label", text: p.mela
      }));
    }
  });

  // Inner d=2 ring — 9 morph pads at angular positions
  const padPositions = [];
  const all = [...D.NEIGHBORS[m.n].L, ...D.NEIGHBORS[m.n].U, ...D.NEIGHBORS[m.n].M];
  all.forEach((n, i) => {
    const a = (i / all.length) * TAU - Math.PI / 2;
    padPositions.push({ a, x: cx + Rin * Math.cos(a), y: cy + Rin * Math.sin(a), mela: n });
  });
  padPositions.forEach(p => {
    svg.appendChild(ce("circle", {
      cx: p.x, cy: p.y, r: 14, class: "yantra-d2-pad",
      onclick: () => state.mela = p.mela
    }));
    svg.appendChild(ce("text", {
      x: p.x, y: p.y + 4, "text-anchor": "middle",
      style: "font-family:'JetBrains Mono',monospace; font-size:10px; fill: var(--ink); pointer-events: none;",
      text: p.mela
    }));
  });

  // Three K-anchors — at 0°, 120°, 240°
  const kAnchors = [
    { a: -Math.PI/2, label: "K₁", op: D.K1 },
    { a: -Math.PI/2 + TAU/3, label: "K₂", op: D.K2 },
    { a: -Math.PI/2 + 2*TAU/3, label: "K₃", op: D.K3 }
  ];
  const Rk = (Rrim + Rin) / 2 + 30;
  kAnchors.forEach(k => {
    const x = cx + Rk * Math.cos(k.a), y = cy + Rk * Math.sin(k.a);
    svg.appendChild(ce("circle", {
      cx: x, cy: y, r: 18, class: "yantra-k-anchor",
      onclick: () => applyXOR(k.op)
    }));
    svg.appendChild(ce("text", {
      x, y: y + 4, "text-anchor": "middle", class: "yantra-k-label", text: k.label
    }));
  });

  // Center: active mela block
  svg.appendChild(ce("text", { x: cx, y: cy - 14, class: "yantra-active-name", text: m.name }));
  svg.appendChild(ce("text", { x: cx, y: cy + 8, class: "yantra-active-meta", text: m.hex }));
  svg.appendChild(ce("text", { x: cx, y: cy + 26, class: "yantra-active-meta", style: "font-size: 10px;", text: `Forte ${m.forte}` }));

  // Sa-grama lower-tetrachord row
  const sa = ce("g", { transform: `translate(${cx - 200}, ${cy + 250})` });
  const labels = ["Sa","R₁","R₂","R₃","G₃","M₁","M₂","P","D₁","D₂","D₃","N₃"];
  for (let i = 0; i < 12; i++) {
    const lit = !!(m.bits & (1 << D.PITCH_TO_BIT[i]));
    sa.appendChild(ce("rect", {
      x: i * 34, y: 0, width: 28, height: 36,
      fill: lit ? PC_HSL[i] : "transparent", stroke: lit ? PC_HSL[i] : "var(--ink-soft)", "stroke-width": 0.6,
      onclick: async () => { (await ensureAudio()).playPC(i); }
    }));
    sa.appendChild(ce("text", { x: i*34 + 14, y: 22, "text-anchor": "middle", class: "yantra-rim-label", style: "font-size:9px;", text: labels[i] }));
  }
  svg.appendChild(sa);

  return svg;
}

function buildFretboard() {
  // Reduced: single neck row, 24 frets, scale notes lit
  const m = D.MELA[state.mela];
  const W = 1100, H = 220;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full max-w-[1100px]" });
  const strings = [40, 45, 50, 55, 59, 64];   // standard E
  const sH = H / (strings.length + 1);
  const fretW = (W - 60) / 24;
  for (let s = 0; s < strings.length; s++) {
    const y = (s + 1) * sH;
    svg.appendChild(ce("line", { x1: 30, y1: y, x2: W - 30, y2: y, class: "fret-string" }));
    for (let f = 0; f <= 24; f++) {
      const x = 30 + f * fretW;
      svg.appendChild(ce("line", { x1: x, y1: sH - 4, x2: x, y2: H - sH + 4, stroke: "var(--ink-soft)", "stroke-width": 0.4, opacity: 0.4 }));
      const midi = strings[strings.length - 1 - s] + f;
      const pc = midi % 12;
      const lit = !!(m.bits & (1 << D.PITCH_TO_BIT[pc]));
      if (lit) {
        const isRough = m.roughPCs.includes(pc);
        const style = isRough
          ? `fill: ${PC_HSL[pc]}; stroke: var(--kumkum); stroke-width: 2;`
          : `fill: ${PC_HSL[pc]}; stroke: ${PC_HSL[pc]};`;
        svg.appendChild(ce("circle", {
          cx: x + fretW/2, cy: y, r: 8,
          class: "fret-node",
          style,
          onclick: async () => { (await ensureAudio()).playMidi(midi); }
        }));
        svg.appendChild(ce("text", {
          x: x + fretW/2, y: y + 3, "text-anchor": "middle",
          style: "font-family:'JetBrains Mono',monospace; font-size:8px; fill: var(--vellum); pointer-events: none;",
          text: D.PITCH_NAMES_SHORT[pc]
        }));
      }
    }
  }
  return svg;
}

function buildPianoRoll() {
  const m = D.MELA[state.mela];
  const W = 1100, H = 220;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-full max-w-[1100px]" });
  const lowMidi = 36, highMidi = 84;
  const keys = highMidi - lowMidi + 1;
  const kW = W / keys;
  // White-key strip
  for (let i = 0; i < keys; i++) {
    const midi = lowMidi + i;
    const pc = midi % 12;
    const isBlack = [1,3,6,8,10].includes(pc);
    const lit = !!(m.bits & (1 << D.PITCH_TO_BIT[pc]));
    const isRough = m.roughPCs.includes(pc);
    svg.appendChild(ce("rect", {
      x: i * kW, y: 0, width: kW - 0.4, height: H * 0.85,
      fill: lit ? PC_HSL[pc] : (isBlack ? "var(--ink-soft)" : "transparent"),
      stroke: lit && isRough ? "var(--kumkum)" : "var(--ink-soft)",
      "stroke-width": lit && isRough ? 1.5 : 0.4,
      onclick: async () => { (await ensureAudio()).playMidi(midi); }
    }));
    if (lit) {
      svg.appendChild(ce("text", {
        x: i*kW + kW/2, y: H * 0.85 - 6, "text-anchor": "middle",
        style: "font-family:'JetBrains Mono',monospace; font-size:9px; fill: var(--vellum); pointer-events: none;",
        text: D.PITCH_NAMES_SHORT[pc]
      }));
    }
  }
  return svg;
}

function buildVinaNeck() {
  const m = D.MELA[state.mela];
  const W = 200, H = 720;
  const svg = ce("svg", { viewBox: `0 0 ${W} ${H}`, class: "h-full max-h-[720px]" });
  // Single string, 24 frets
  svg.appendChild(ce("line", { x1: W/2, y1: 30, x2: W/2, y2: H - 30, stroke: "var(--ink-soft)", "stroke-width": 0.8 }));
  const fretH = (H - 60) / 24;
  for (let f = 0; f <= 24; f++) {
    const y = 30 + f * fretH;
    svg.appendChild(ce("line", { x1: 30, y1: y, x2: W - 30, y2: y, stroke: "var(--ink-soft)", "stroke-width": 0.4, opacity: 0.45 }));
    const pc = (24 - f) % 12;   // open string at top = high
    const midi = 60 + (24 - f);
    const lit = !!(m.bits & (1 << D.PITCH_TO_BIT[pc]));
    if (lit) {
      const isRough = m.roughPCs.includes(pc);
      const style = isRough
        ? `fill: ${PC_HSL[pc]}; stroke: var(--kumkum); stroke-width: 2;`
        : `fill: ${PC_HSL[pc]}; stroke: ${PC_HSL[pc]};`;
      svg.appendChild(ce("circle", {
        cx: W/2, cy: y, r: 10,
        class: "fret-node",
        style,
        onclick: async () => { (await ensureAudio()).playMidi(midi); }
      }));
      svg.appendChild(ce("text", {
        x: W/2, y: y + 3, "text-anchor": "middle",
        style: "font-family:'JetBrains Mono',monospace; font-size:9px; fill: var(--vellum); pointer-events: none;",
        text: D.PITCH_NAMES_SHORT[pc]
      }));
    }
  }
  return svg;
}

// ═══ Mode toggle + night mode ═════════════════════════════════════════════

function toggleMode() {
  state.mode = state.mode === "perform" ? "explore" : "perform";
  state.view = state.mode === "perform" ? "perform" : (state.view === "perform" ? "atlas" : state.view);
}
function toggleNight() {
  state.night = !state.night;
  document.documentElement.dataset.theme = state.night ? "ink" : "vellum";
}

// ═══ Boot ════════════════════════════════════════════════════════════════

function boot() {
  // Run self-test, surface failures as a banner.
  const test = D.selfTest();
  if (!test.ok) {
    const banner = qsel("#selftest-banner");
    if (banner) {
      banner.classList.remove("hidden");
      qsel("#selftest-message").textContent = `Self-test failed (${test.failures.length}). The page proceeds, but math may disagree with the paper. First failure: ${test.failures[0]}`;
    }
    console.warn("Self-test failures:", test.failures);
  }

  bindActive();

  parseHash();
  if (state.night) document.documentElement.dataset.theme = "ink";

  // First-time render of the active view (atlas by default)
  showPlate(state.view);
  currentView = state.view;

  // Hash sync
  window.addEventListener("hashchange", parseHash);

  // Keybindings
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    // Color-legend drawer takes ESC first when it's open
    const legend = qsel("#color-legend");
    const legendOpen = legend && legend.classList.contains("open");
    if (e.key === "Escape" && legendOpen) { e.preventDefault(); closeColorLegend(); return; }
    if (e.key === "l" || e.key === "L") { e.preventDefault(); toggleColorLegend(); return; }
    if (e.key === "~" || e.key === "`") { e.preventDefault(); toggleMode(); }
    else if (e.key === "n") { toggleNight(); }
    else if (e.key === "Escape" && state.mode === "perform") { state.mode = "explore"; state.view = "atlas"; }
    else if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10);
      const map = { 1: "encoding", 2: "orbits", 3: "hamming", 4: "graycode", 5: "zrelation", 6: "vivadi", 7: "cross", 8: "empirical", 9: "colophon" };
      if (map[idx]) state.view = map[idx];
    }
    else if (e.key === "0") { state.view = "atlas"; }
  });

  // Mode pivot button
  qsel("#mode-pivot")?.addEventListener("click", toggleMode);

  // Atlas was hidden by default — make sure it's visible if we're at /
  if (state.view === "atlas") {
    qall('section.plate').forEach(s => s.classList.toggle("hidden", s.dataset.plate !== "atlas"));
    renderAtlas();
  }
}

// ═══ Exports (lazy, only when invoked) ════════════════════════════════════

async function downloadSCL(n) {
  const mod = await import("./exports/scl-midi-json.js");
  mod.downloadSCL(D.MELA[n]);
}
async function downloadGrayMidi() {
  const mod = await import("./exports/scl-midi-json.js");
  mod.downloadGrayMidi(D.GRAY_PATH, D.M_CROSSING_INDEX, D.MELA);
}
async function downloadMasterJson() {
  const mod = await import("./exports/scl-midi-json.js");
  mod.downloadMasterJson(D.MELA, D.ORBITS, D.EDGES, D.GRAY_PATH);
}

// Run boot once DOM is ready.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
