// data.js — precomputed mela data and proofs.
// Authoritative spec: /paper §2 (encoding), §3 (Klein-4), §4 (Hamming-2), §5 (Gray walk),
// §6 (Z-relation), §7 (vivadi). When math and code disagree, the paper wins.

// ─── Constants ──────────────────────────────────────────────────────────

export const NAMES = [
  "Kanakangi","Ratnangi","Ganamurti","Vanaspati","Manavati","Tanarupi",
  "Senavati","Hanumatodi","Dhenuka","Natakapriya","Kokilapriya","Rupavati",
  "Gayakapriya","Vakulabharanam","Mayamalavagowla","Chakravakam","Suryakantam","Hatakambari",
  "Jhankaradhwani","Natabhairavi","Keeravani","Kharaharapriya","Gourimanohari","Varunapriya",
  "Mararanjani","Charukesi","Sarasangi","Harikambhoji","Dheerasankarabharanam","Naganandini",
  "Yagapriya","Ragavardhini","Gangeyabhushani","Vagadheeswari","Shulini","Chalanata",
  "Salagam","Jalarnavam","Jhalavarali","Navaneetam","Pavani","Raghupriya",
  "Gavambhodi","Bhavapriya","Shubhapantuvarali","Shadvidamargini","Suvarnangi","Divyamani",
  "Dhavalambari","Namanarayani","Kamavardhani","Ramapriya","Gamanashrama","Vishwambari",
  "Shamalangi","Shanmukhapriya","Simhendramadhyamam","Hemavati","Dharmavati","Neetimati",
  "Kantamani","Rishabhapriya","Latangi","Vachaspati","Mechakalyani","Chitrambari",
  "Sucharitra","Jyoti Swarupini","Dhatuvardhani","Nasikabhushani","Kosalam","Rasikapriya"
];

// Diacritic-rich Devanagari/IAST names for typographic care (Plate I, headings)
export const NAMES_IAST = [
  "Kanakāṅgī","Ratnāṅgī","Gānamūrti","Vanaspati","Mānavatī","Tānarūpī",
  "Senāvatī","Hanumatōḍi","Dhenuka","Naṭakapriyā","Kōkilapriyā","Rūpavati",
  "Gāyakapriyā","Vakuḷābharaṇaṃ","Māyāmāḷavagauḷa","Cakravākaṃ","Sūryakāntaṃ","Hāṭakāmbarī",
  "Jhaṅkāradhvani","Naṭabhairavī","Kīravāṇī","Kharaharapriyā","Gaurīmanōharī","Varuṇapriyā",
  "Māraranjanī","Cārukēśī","Sarasāṅgī","Harikāmbhōji","Dhīraśaṅkarābharaṇaṃ","Nāgānandinī",
  "Yāgapriyā","Rāgavardhinī","Gāṅgēyabhūṣaṇī","Vāgadhīśvarī","Śūlinī","Calanāṭa",
  "Sālagaṃ","Jalārṇavaṃ","Jhālavarāḷī","Navanītaṃ","Pāvanī","Raghupriyā",
  "Gavāmbhōdi","Bhāvapriyā","Śubhapantuvarāḷī","Ṣaḍvidhamārgiṇī","Suvarṇāṅgī","Divyamaṇi",
  "Dhavaḷāmbarī","Nāmanārāyaṇī","Kāmavardhanī","Rāmapriyā","Gamanāśrama","Viśvambharī",
  "Śyāmalāṅgī","Ṣaṇmukhapriyā","Siṃhēndramadhyamaṃ","Hemavatī","Dharmavatī","Nītimatī",
  "Kāntāmaṇi","R̥ṣabhapriyā","Lataṅgī","Vācaspati","Mēcakalyāṇī","Citrāmbarī",
  "Sucaritra","Jyōti Svarūpiṇī","Dhātuvardhanī","Nāsikābhūṣaṇi","Kosalaṃ","Rasikapriyā"
];

// Mirrored-endianness bit map (paper §2.3)
export const PITCH_TO_BIT = {0:11,1:10,2:9,3:8,4:7,5:5,6:6,7:4,8:0,9:1,10:2,11:3};
export const BIT_TO_PITCH = {11:0,10:1,9:2,8:3,7:4,5:5,6:6,4:7,0:8,1:9,2:10,3:11};
export const PITCH_NAMES_FULL = {
  0:"Sa", 1:"R₁", 2:"R₂/G₁", 3:"R₃/G₂", 4:"G₃", 5:"M₁", 6:"M₂",
  7:"Pa", 8:"D₁", 9:"D₂/N₁", 10:"D₃/N₂", 11:"N₃"
};
export const PITCH_NAMES_SHORT = {
  0:"S", 1:"R₁", 2:"R₂", 3:"R₃", 4:"G₃", 5:"M₁", 6:"M₂",
  7:"P", 8:"D₁", 9:"D₂", 10:"D₃", 11:"N₃"
};

// The six admissible popcount-2 nibble shapes (paper §2.1, §3.2).
// Lower (R-G) tetrachord and upper (D-N) tetrachord index these in *opposite*
// bit-orders because of the mirrored endianness convention (§2.3): for any
// mela's "type k", the D-N nibble is the 4-bit reversal of the R-G nibble.
export const ADMISSIBLE_NIBBLES_RG = [0xC, 0xA, 0x9, 0x6, 0x5, 0x3];
const reverseNibble = (n) => ((n & 1) << 3) | ((n & 2) << 1) | ((n & 4) >> 1) | ((n & 8) >> 3);
export const ADMISSIBLE_NIBBLES_DN = ADMISSIBLE_NIBBLES_RG.map(reverseNibble);
// Back-compat alias used for grid/visualization code that doesn't care about
// which tetrachord the nibble lives in.
export const ADMISSIBLE_NIBBLES = ADMISSIBLE_NIBBLES_RG;

// Klein-4 group masks (paper §3)
export const K1 = 0x060;  // madhyama swap
export const K2 = 0x7EF;  // antipodal complement (fixes Sa & Pa)
export const K3 = 0x78F;  // K1 ⊕ K2
export const K_LABEL = { [K1]:"K₁ (madhyama)", [K2]:"K₂ (antipodal)", [K3]:"K₃ (full)" };

// Bit regions
export const BITS = {
  S: 11, P: 4,
  L: [10,9,8,7],   // R-G tetrachord  (lower)
  M: [5,6],        // madhyamas
  U: [3,2,1,0]     // D-N tetrachord  (upper)
};

// Janya counts hardcoded from paper Appendix C.  All other counts are unknown
// to this codebase and rendered as "?". Do not fabricate.
export const JANYA_KNOWN = {
  1:12, 2:7, 3:5, 4:4, 5:3, 6:1, 7:5, 8:25, 9:5, 10:12,
  11:10, 12:2, 13:5, 14:14, 15:38
};

// ─── Core arithmetic ────────────────────────────────────────────────────

export const popcount = (n) => { let c=0; while(n){ c += n&1; n >>>= 1; } return c; };

// Mela bit construction (§2.1 + paper §2.3 mirrored endianness)
export function getMelaBits(n) {
  const c = Math.ceil(n / 6);
  const p = (n % 6 === 0) ? 6 : (n % 6);
  const rgIdx = ((c - 1) % 6) + 1;
  const dnIdx = p;
  const rg = ADMISSIBLE_NIBBLES_RG[rgIdx - 1];
  const dn = ADMISSIBLE_NIBBLES_DN[dnIdx - 1];
  const m  = c <= 6 ? (1 << 5) : (1 << 6);
  return (1 << 11) | (rg << 7) | m | (1 << 4) | dn;
}

// Klein-orbit canonical index n ∈ {1..18} for any mela m ∈ {1..72}
export function orbitId(m) {
  if (m <= 18) return m;
  if (m <= 36) return 37 - m;
  if (m <= 54) return m - 36;
  return 73 - m;
}
export function orbitMembers(orbit) {
  const n = orbit;
  return [n, 37 - n, 36 + n, 73 - n];
}

// Pitch-class set extraction
export function bitsToPcSet(bits) {
  const out = [];
  for (let pc = 0; pc < 12; pc++) {
    if (bits & (1 << PITCH_TO_BIT[pc])) out.push(pc);
  }
  return out.sort((a,b) => a-b);
}

// Interval-class vector (§6.2 — IC vector matches IFF Z-related or T_n / T_n I related)
export function icv(pcs) {
  const v = [0,0,0,0,0,0];
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i+1; j < pcs.length; j++) {
      let d = (pcs[j] - pcs[i]) % 12;
      if (d > 6) d = 12 - d;
      v[d-1]++;
    }
  }
  return v;
}

// Forte prime-form algorithm.  Among all rotations of the set rooted at 0,
// pick the one with the smallest outer interval; tie-break by smallest a[1],
// then smallest a[2], etc. (compact from BOTTOM, i.e. left-to-right in the
// sorted rotation).  Then take the smaller of (original, inversion) by the
// same comparator.  This is Forte's convention; e.g. it gives 7-Z18 the
// prime form (0,1,2,3,5,8,9) — matching the paper.
function rotateToZero(pcs, k) {
  const t = pcs[k];
  return pcs.map(p => (p - t + 12) % 12).sort((a, b) => a - b);
}
function compareForte(a, b) {
  // 1. Smallest outer interval (a[n-1], since rooted at 0).
  const outerA = a[a.length - 1], outerB = b[b.length - 1];
  if (outerA !== outerB) return outerA - outerB;
  // 2. Tie-break: smallest a[1], a[2], ..., a[n-2] (left-packed bottom-up).
  for (let i = 1; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
function normalForm(pcs) {
  const candidates = [];
  for (let k = 0; k < pcs.length; k++) candidates.push(rotateToZero(pcs, k));
  candidates.sort(compareForte);
  return candidates[0];
}
export function primeForm(pcs) {
  const n0 = normalForm(pcs);
  const inv = pcs.map(p => (12 - p) % 12).sort((a, b) => a - b);
  const n1 = normalForm(inv);
  return compareForte(n0, n1) <= 0 ? n0 : n1;
}

// Forte labels for the heptachord prime forms named in the paper.
// Other realised classes are tagged by their prime form alone.  The four
// inversionally-symmetric classes {7-22, 7-33, 7-34, 7-35} are the ones
// quoted in the proof of Theorem 6.2; the Z-pair is from Theorem 6.2 itself.
const FORTE_NAMED = new Map([
  ["0,1,2,5,6,8,9",  "7-22"],   // Hungarian minor / Double harmonic (§8.1)
  ["0,1,2,4,6,8,10", "7-33"],
  ["0,1,3,4,6,8,10", "7-34"],
  ["0,1,3,5,6,8,10", "7-35"],   // Western diatonic family (§8.1)
  ["0,1,2,3,5,8,9",  "7-Z18"],  // ⟨4,3,4,4,4,2⟩ — Divyamaṇi (48), Dhavaḷāmbarī (49)
  ["0,1,2,4,5,7,8",  "7-Z38"],  // ⟨4,3,4,4,4,2⟩ — Navanītaṃ (40)
]);

export function forteLabel(pcs) {
  const pf = primeForm(pcs);
  const key = pf.join(",");
  return { label: FORTE_NAMED.get(key) || `[${pf.join(",")}]`, primeForm: pf };
}

// Vivadi predicate (paper §7)
export function vivadiFlags(bits) {
  const rg = (bits >> 7) & 0xF;
  const dn = bits & 0xF;
  const extremalSet = (rg === 0x3 || rg === 0xC || dn === 0x3 || dn === 0xC);
  const tension1Set = new Set([0x3, 0x6, 0xC]);
  const naiveSet = tension1Set.has(rg) || tension1Set.has(dn);
  // 14-exception set X (Prop 7.5): naive but not extremal
  const exception = naiveSet && !extremalSet;
  return {
    extremal: extremalSet,
    naive: naiveSet,
    exception,
    rgNibble: rg,
    dnNibble: dn,
    // Which pitch classes carry the perceptual roughness, per §7.4
    roughPCs: roughPCs(rg, dn)
  };
}
function roughPCs(rg, dn) {
  const out = [];
  if (rg === 0xC) out.push(1, 2);
  if (rg === 0x3) out.push(3, 4);
  if (dn === 0xC) out.push(8, 9);
  if (dn === 0x3) out.push(10, 11);
  return out;
}

// ─── MELA[]: master per-mela record ─────────────────────────────────────

export const MELA = new Array(73);  // 1-indexed; MELA[0] left undefined

for (let n = 1; n <= 72; n++) {
  const bits = getMelaBits(n);
  const pcs = bitsToPcSet(bits);
  const ic = icv(pcs);
  const f = forteLabel(pcs);
  const vf = vivadiFlags(bits);
  const c = Math.ceil(n / 6);
  const p = (n % 6 === 0) ? 6 : (n % 6);
  const oid = orbitId(n);
  MELA[n] = {
    n,
    name: NAMES[n - 1],
    nameIAST: NAMES_IAST[n - 1],
    bits,
    hex: "0x" + bits.toString(16).toUpperCase().padStart(3, "0"),
    binary: bits.toString(2).padStart(12, "0"),
    chakra: c,
    position: p,
    rgNibble: vf.rgNibble,
    dnNibble: vf.dnNibble,
    mBit: c <= 6 ? 5 : 6,
    pcSet: pcs,
    primeForm: f.primeForm,
    forte: f.label,
    icv: ic,
    vivadi: { extremal: vf.extremal, naive: vf.naive, exception: vf.exception },
    roughPCs: vf.roughPCs,
    orbitId: oid,
    orbitMembers: orbitMembers(oid),
    janya: JANYA_KNOWN[n] ?? null,
    janyaProvenance: JANYA_KNOWN[n] != null ? "Wikipedia 2026-04-22 (paper App. C)" : null
  };
}

// Lookup: bits → mela number
export const BITS_TO_MELA = (() => {
  const m = new Map();
  for (let n = 1; n <= 72; n++) m.set(MELA[n].bits, n);
  return m;
})();

// ─── Distance matrix, edges, antipodes (§4) ─────────────────────────────

export const DIST = new Uint8Array(72 * 72);
for (let a = 1; a <= 72; a++) {
  for (let b = 1; b <= 72; b++) {
    DIST[(a - 1) * 72 + (b - 1)] = popcount(MELA[a].bits ^ MELA[b].bits);
  }
}
export function dist(a, b) { return DIST[(a - 1) * 72 + (b - 1)]; }

// 324 d=2 edges (Theorem 4.1)
export const EDGES = [];
for (let a = 1; a <= 72; a++) {
  for (let b = a + 1; b <= 72; b++) {
    const xor = MELA[a].bits ^ MELA[b].bits;
    if (popcount(xor) === 2) {
      let region;
      if (xor === K1) region = "M";
      else if (xor & 0x780) region = "L";  // R-G nibble bits 10..7
      else region = "U";                    // D-N nibble bits 3..0
      EDGES.push({ a, b, region, xor });
    }
  }
}

// 36 antipodal pairs (Prop 3.2 / Theorem 4.4)
export const ANTIPODES = [];
for (let n = 1; n <= 36; n++) ANTIPODES.push([n, 73 - n]);

// d=2 neighbours of each mela, partitioned by region
export const NEIGHBORS = {};
for (let n = 1; n <= 72; n++) NEIGHBORS[n] = { L: [], M: [], U: [], all: [] };
for (const e of EDGES) {
  NEIGHBORS[e.a][e.region].push(e.b);
  NEIGHBORS[e.a].all.push(e.b);
  NEIGHBORS[e.b][e.region].push(e.a);
  NEIGHBORS[e.b].all.push(e.a);
}

// ─── Gray-code Hamiltonian (§5) ─────────────────────────────────────────

// Warnsdorff: at each step move to the unvisited d=2 neighbour with the
// fewest unvisited d=2 neighbours of its own; tie-break by mela number.
function warnsdorffPath(start = 1) {
  const visited = new Set([start]);
  const path = [start];
  let cur = start;
  while (path.length < 72) {
    const opts = NEIGHBORS[cur].all.filter(m => !visited.has(m));
    if (opts.length === 0) break;
    opts.sort((a, b) => {
      const ca = NEIGHBORS[a].all.filter(x => !visited.has(x)).length;
      const cb = NEIGHBORS[b].all.filter(x => !visited.has(x)).length;
      if (ca !== cb) return ca - cb;
      return a - b;
    });
    cur = opts[0];
    visited.add(cur);
    path.push(cur);
  }
  return path;
}

export const GRAY_PATH = warnsdorffPath(1);

// Index of the unique madhyama crossing (Prop 5.2). Computed, not hardcoded.
export const M_CROSSING_INDEX = (() => {
  for (let i = 0; i < GRAY_PATH.length - 1; i++) {
    const xor = MELA[GRAY_PATH[i]].bits ^ MELA[GRAY_PATH[i + 1]].bits;
    if (xor === K1) return i;  // 0-indexed; UI displays i+1
  }
  return -1;
})();

// ─── Klein orbits (§3) ──────────────────────────────────────────────────

export const ORBITS = [];
for (let i = 1; i <= 18; i++) {
  const members = orbitMembers(i);
  ORBITS.push({
    id: i,
    members,
    janyaTotal: members.reduce((s, m) => s + (MELA[m].janya || 0), 0),
    forteSet: [...new Set(members.map(m => MELA[m].forte))]
  });
}

// ─── Forte stratification ───────────────────────────────────────────────

export const FORTE_TABLE = (() => {
  const t = new Map();
  for (let n = 1; n <= 72; n++) {
    const f = MELA[n].forte;
    if (!t.has(f)) t.set(f, []);
    t.get(f).push(n);
  }
  return t;
})();

// Forte size distribution (Prop 6.1 expects 8/4/3/4/1/2/2 = 24 classes)
export const FORTE_SIZE_DIST = (() => {
  const sizes = [...FORTE_TABLE.values()].map(arr => arr.length);
  const dist = {};
  for (const s of sizes) dist[s] = (dist[s] || 0) + 1;
  return dist;
})();

// ─── Nibble grid (Plate VI) — 6×6 ───────────────────────────────────────

export const NIBBLE_GRID = (() => {
  const grid = new Map();
  for (const rg of ADMISSIBLE_NIBBLES) {
    for (const dn of ADMISSIBLE_NIBBLES) {
      grid.set(`${rg}-${dn}`, []);
    }
  }
  for (let n = 1; n <= 72; n++) {
    grid.get(`${MELA[n].rgNibble}-${MELA[n].dnNibble}`).push(n);
  }
  return grid;
})();

// ─── Self-test (CLAUDE.md tripwire) ─────────────────────────────────────
// Runs at boot. Asserts Warnsdorff invariants and Klein-4 / vivadi counts.

export function selfTest() {
  const failures = [];

  // Gray path: every consecutive pair must be d=2
  for (let i = 0; i < GRAY_PATH.length - 1; i++) {
    const d = popcount(MELA[GRAY_PATH[i]].bits ^ MELA[GRAY_PATH[i + 1]].bits);
    if (d !== 2) failures.push(`Gray step ${i}: d(${GRAY_PATH[i]},${GRAY_PATH[i+1]}) = ${d} ≠ 2`);
  }
  // Gray path covers all 72
  if (new Set(GRAY_PATH).size !== 72) failures.push(`Gray path covers ${new Set(GRAY_PATH).size}/72`);

  // Exactly one M-crossing (Prop 5.2)
  let mCrossings = 0;
  for (let i = 0; i < GRAY_PATH.length - 1; i++) {
    if ((MELA[GRAY_PATH[i]].bits ^ MELA[GRAY_PATH[i + 1]].bits) === K1) mCrossings++;
  }
  if (mCrossings !== 1) failures.push(`Expected exactly 1 madhyama crossing, found ${mCrossings}`);

  // 9-regular Hamming graph (Theorem 4.1)
  for (let n = 1; n <= 72; n++) {
    if (NEIGHBORS[n].all.length !== 9) failures.push(`Mela ${n} has ${NEIGHBORS[n].all.length} d=2 neighbours, expected 9`);
  }
  // 4 + 4 + 1 partition (Theorem 4.1)
  for (let n = 1; n <= 72; n++) {
    if (NEIGHBORS[n].L.length !== 4 || NEIGHBORS[n].U.length !== 4 || NEIGHBORS[n].M.length !== 1) {
      failures.push(`Mela ${n} neighbours not (4,4,1): L=${NEIGHBORS[n].L.length} U=${NEIGHBORS[n].U.length} M=${NEIGHBORS[n].M.length}`);
    }
  }

  // 324 edges total
  if (EDGES.length !== 324) failures.push(`Expected 324 edges, got ${EDGES.length}`);

  // 40 extremally vivadi (Theorem 7.4)
  let extremalCount = 0;
  for (let n = 1; n <= 72; n++) if (MELA[n].vivadi.extremal) extremalCount++;
  if (extremalCount !== 40) failures.push(`Expected 40 extremally vivadi, got ${extremalCount}`);

  // 14-exception set X (Prop 7.5)
  const X_PAPER = [10,16,20,21,22,23,28,46,52,56,57,58,59,64];
  const X_COMPUTED = [];
  for (let n = 1; n <= 72; n++) if (MELA[n].vivadi.exception) X_COMPUTED.push(n);
  if (X_COMPUTED.join(",") !== X_PAPER.join(",")) {
    failures.push(`Vivadi exception set X mismatch: got [${X_COMPUTED.join(",")}], expected [${X_PAPER.join(",")}]`);
  }

  // Klein-4 orbit closure (Cor 3.6)
  for (let i = 1; i <= 18; i++) {
    const m = orbitMembers(i);
    const expected = [i, 37 - i, 36 + i, 73 - i].sort((a, b) => a - b);
    const actual = [...m].sort((a, b) => a - b);
    if (expected.join(",") !== actual.join(",")) {
      failures.push(`Orbit ${i}: ${actual} ≠ ${expected}`);
    }
  }

  // Z-relation (Theorem 6.2): {40, 48, 49} all share IC vector (4,3,4,4,4,2)
  const Z_ICV = [4,3,4,4,4,2];
  for (const m of [40, 48, 49]) {
    if (MELA[m].icv.join(",") !== Z_ICV.join(",")) {
      failures.push(`Mela ${m} ICV ${MELA[m].icv} ≠ (4,3,4,4,4,2)`);
    }
  }
  // mela 40 in 7-Z38, 48 & 49 in 7-Z18
  if (MELA[40].forte !== "7-Z38") failures.push(`Mela 40 Forte = ${MELA[40].forte}, expected 7-Z38`);
  if (MELA[48].forte !== "7-Z18") failures.push(`Mela 48 Forte = ${MELA[48].forte}, expected 7-Z18`);
  if (MELA[49].forte !== "7-Z18") failures.push(`Mela 49 Forte = ${MELA[49].forte}, expected 7-Z18`);

  // Antipodal pairs are exactly the d=10 pairs (Theorem 4.4)
  let d10 = 0;
  for (let a = 1; a <= 72; a++) for (let b = a + 1; b <= 72; b++) if (dist(a,b) === 10) d10++;
  if (d10 !== 36) failures.push(`Expected 36 d=10 pairs, got ${d10}`);
  for (const [a, b] of ANTIPODES) if (dist(a, b) !== 10) failures.push(`Antipode (${a},${b}) d=${dist(a,b)} ≠ 10`);

  return { ok: failures.length === 0, failures };
}

// Pre-populate orbit janya totals once janya counts are known
// (deferred — counts beyond paper App. C are unknown to this codebase).
