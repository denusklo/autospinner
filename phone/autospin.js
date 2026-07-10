/**
 * Phone auto-spinner: drives the real TOS Android game over adb + MaaTouch.
 *
 * Pipeline: raw screencap (RGBA8888, no PNG decode) -> per-cell patch color
 * classification -> Board -> DoraSolver -> grid path -> interpolated touch
 * path -> MaaTouch (minitouch protocol on stdin).
 *
 * Usage:
 *   node phone/autospin.js                    # capture -> recognize -> solve -> spin
 *   node phone/autospin.js --rounds 5         # spin 5 turns; waits for the board to
 *                                             # settle (2 identical captures) between spins
 *   node phone/autospin.js --dry              # everything except the touch
 *   node phone/autospin.js --confirm          # print recognized board + path, then
 *                                             # wait for Enter before actually spinning
 *   node phone/autospin.js --first-combos 4      # EXACTLY 4 first-wave combos (combo-shield
 *                                                # mode; overshoot rejected too)
 *   node phone/autospin.js --first-combos 7+     # at least 7 first-wave combos
 *   node phone/autospin.js --first-combos max    # highest achievable (never aborts)
 *   node phone/autospin.js --first-runes 20      # clear EXACTLY 20 RUNES in the first wave
 *                                                # (楊玉環 "NUM N" boss: read N off the enemy
 *                                                # badge; distinct from combo COUNT)
 *   node phone/autospin.js --first-runes 20+     # at least 20 first-wave runes
 *   node phone/autospin.js --first-wave-no=f,g   # first wave must NOT dissolve
 *                                                # Fire or Wood; those types may
 *                                                # still dissolve after gravity
 *     For first-wave constraints: DoraSolver tries first, TargetPlanner constructs the
 *     arrangement if the beam misses, abort only if impossible/unroutable
 *     (no touch sent on abort). --first-min-combos N = legacy alias for N+.
 *   node phone/autospin.js --clear-all heart      # first wave must dissolve EVERY
 *                                                # heart on the board (boss 首批消除
 *                                                # 所有X符石). Comma list for several
 *                                                # types: --clear-all heart,water
 *                                                # (letters w/f/g/l/d/h or digits 0-5
 *                                                # work too). STRICT about thorn/sealed
 *                                                # columns: required runes there must be
 *                                                # dragged out and dissolved; fewer than
 *                                                # 3 of a type on the board = provably
 *                                                # impossible: prints CLEAR_ALL_INFEASIBLE
 *                                                # and interactively asks [y/N] whether to
 *                                                # drop it and solve normally with every
 *                                                # other flag intact (--force-partial-clear-all
 *                                                # skips the prompt and auto-continues; default
 *                                                # is abort, no touch, if not a TTY). Composes
 *                                                # with --first-combos/-runes, --sealed,
 *                                                # --start/--end. Clear-all alone CLUMPS the
 *                                                # required runes into one big group (1 combo);
 *                                                # add --first-combos N+ to split them into
 *                                                # multiple 3-groups for more combos (e.g.
 *                                                # --clear-all dark --first-combos 5+ turned a
 *                                                # 6-dark blob into [3,3] = 8 total combos). If
 *                                                # clear-all MISSes, raise --beam (8000+), keep
 *                                                # --max-path ~60 (a long path does not help).
 *   node phone/autospin.js --beam 800            # wider beam search (default 200; slower, finds more)
 *   node phone/autospin.js --max-path 40         # longer drag budget (default 30 moves)
 *   node phone/autospin.js --workers 4           # beam search shards across N worker threads
 *                                                # (default: CPU cores - 1; P18). --workers 1 =
 *                                                # exact sequential solve. Sharded results can
 *                                                # differ slightly from sequential either way;
 *                                                # for clear-all keep total --beam ~16000 so
 *                                                # each shard stays wide enough (~1000+).
 *   node phone/autospin.js --move-ms 215         # ms per CELL move (decimals ok) — the direct,
 *                                                # fine speed knob. The game drops the rune below
 *                                                # a sharp cell-traversal time (~205ms on the
 *                                                # shock stage); dial just above it. Default 240.
 *   node phone/autospin.js --step-ms 24          # alt: per-touch-point time (× steps-per-cell
 *                                                # = per move). Whole numbers jump 10ms/move, so
 *                                                # prefer --move-ms near the drop threshold.
 *   node phone/autospin.js --steps-per-cell 10   # touch points per cell (default 10 = 18px steps)
 *   node phone/autospin.js --check            # capture + recognize, write phone/check.html
 *                                             # (screenshot with recognition overlaid) — no solve, no touch
 *   node phone/autospin.js --board my.txt     # manual board (skips recognition), then spin
 *   node phone/autospin.js --board my.txt --dry
 *   node phone/autospin.js --start 5,1        # pin the drag's START cell (col,row,
 *                                             # 0-indexed: col 0-5, row 0-4)
 *   node phone/autospin.js --end 5,1          # pin the drag's END cell; --start and
 *                                             # --end are independent (may differ) and
 *                                             # compose with every other flag below.
 *                                             # If the end can't be reached within
 *                                             # --max-path the run aborts (no touch).
 *   node phone/autospin.js --fire-route       # drag leaves a fire trail: the last 6 cells
 *                                             # the finger LEFT stay on fire and cannot be
 *                                             # re-entered (self-avoiding within a sliding
 *                                             # window; oldest releases as you advance).
 *                                             # --fire-route N sets the trail length. Composes
 *                                             # with all other flags; may reduce combos.
 *   node phone/autospin.js --2-match=h,f      # named rune types dissolve at a run of TWO
 *                                             # instead of three (boss); a 2-run counts as a
 *                                             # full combo everywhere (scoring, first-wave
 *                                             # counts, clear-all). Types NOT listed still
 *                                             # need 3. Letters w/f/g/l/d/h or digits 0-5.
 *                                             # Composes with every other flag.
 *   node phone/autospin.js --sealed 0,5       # force sealed columns; --sealed none disables
 *   node phone/autospin.js --shock-bases l    # set electric-rune base element(s) when the
 *                                             # bright glow defeats auto-detection: one letter
 *                                             # for all, or a comma list mapping to the
 *                                             # ELECTRIC_CELLS row-major order (e.g. w,l,d)
 *   node phone/autospin.js --drag-from=2      # drag from card 2 (1-6, left to right) instead
 *                                             # of a board cell: auto-reads that card's element
 *                                             # badge (live screen capture, required even with
 *                                             # --board) and drops a rune of that element at
 *                                             # (card-1, 0), displacing whatever was read there,
 *                                             # BEFORE solving. One continuous drag (card -> that
 *                                             # cell -> the rest of the solved path) — forces
 *                                             # --start to (card-1,0), overriding any --start
 *                                             # you pass. Unrecognized card badge = abort, no
 *                                             # touch sent (add its color to CARD_SIGNATURES).
 *   node phone/autospin.js --no-solvable-type=fire # override the locked element for the
 *                                             # board-wide no-solvable prohibition-ring overlay
 *                                             # (any cell, `%` suffix; auto-detected but the ring
 *                                             # color can't be reliably read — default Wood).
 *
 * Board file: 5 lines x 6 tokens (comma/space separated). Tokens: w=Water
 * f=Fire g=Wood(green) l=Light d=Dark h=Heart or digits 0-5. Suffixes
 * (combinable): `*` thorn/sealed-column marker, `!` locked (cannot pick up or
 * drag through: CELL_FLAGS NO_PICKUP|NO_SWAP), `x` this cell cannot dissolve
 * (CELL_FLAGS NO_DISSOLVE), `^` electric (P11: interrupts the drag if touched
 * or passed through, still dissolves with its base element, and clearing it
 * first-wave gets a big solver bonus — token g^ = electric Wood), `#` frozen
 * (ice mechanic, P16: an ICED rune is fully normal — dissolvable — but if it
 * survives a spin round it FREEZES for 3 rounds: can move / be dragged /
 * pass-through, the ice travels WITH the rune, but it cannot dissolve until
 * the freeze expires. `#` marks the FROZEN state, solved as the per-rune
 * FROZEN value 6, not a positional flag. The dissolvable iced pre-state needs
 * no marker — it plays as its base element).
 * Example line:  f* l w! g^ h f#
 *
 * Sealed columns (special-card mode): thorn-overlaid runes mark columns that
 * cannot dissolve but can be dragged through. Auto-detected from the thorn
 * overlay (>=3 thorned cells in a column); override with --sealed.
 *
 * Device facts (Mi 9T Pro, 1080x2340): board cells are 180px; column centers
 * x=90+180*gx, row centers y=1330+180*gy. MaaTouch coords are 1:1 screen px.
 * Facts base: .claude/harness/PROJECT-FACTS.md section 5.
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Board, BoardSimulator, DoraSolver, TargetPlanner, CELL_FLAGS, FROZEN } = require('../algorithm.js');
const { solveDoraParallel, solveClearAllParallel, solveMaxFirstCombosParallel, defaultWorkers } = require('./parallel.js');

const COLS = [90, 270, 450, 630, 810, 990];
const ROWS = [1330, 1510, 1690, 1870, 2050];
const PATCH_HALF = 55, PATCH_STEP = 5;

// --drag-from card geometry (Mi 9T Pro, live-measured 2026-07-10). The 6
// character cards sit in a row above the board; their horizontal centers
// align with the board's own COLS (confirmed: card box left edges measured
// at 10,192,... i.e. exactly a 180px cell width apart, box center ~= COLS).
// CARD_TOUCH_Y = card box vertical center (1020-1178), used as the physical
// touch-down point. CARD_BADGE_X/Y = the small element-icon badge in each
// card's top-left corner (offset from the box, NOT centered on COLS), used
// only for color sampling — measured center (34,1042) for card 1, spaced by
// the same 180px column width.
const CARD_TOUCH_Y = 1099;
const CARD_BADGE_X = [34, 214, 394, 574, 754, 934];
const CARD_BADGE_Y = 1042;
const CARD_PATCH_HALF = 10, CARD_PATCH_STEP = 2;
// Drag pacing: PC-side deadline-scheduled writes. The held rune TRAILS the
// finger and cuts corners at speed (into shock cells — P11); human-like
// pacing plus turn dwells (gridPathToScreenPath) keep it on the finger's
// path. Instant injection is only safe on hazard-free boards.
const STEP_MS = 24;          // per touch point -> 240ms/move at 10 points/cell
const STEPS_PER_CELL = 10;   // 18px per event on 180px cells

// Rune encoding per PROJECT-FACTS F2: 0=Water 1=Fire 2=Wood 3=Light 4=Dark 5=Heart.
// Signatures calibrated from live screenshots (Mi 9T Pro, 2026-07-07, P5).
// Thorn = black web overlay shown on runes sitting in sealed columns.
// HARD RULE (LESSONS L2/L8): every entry must be a LIVE-MEASURED patch average.
// Never extrapolate — a wrong signature misreads silently, an absent one makes
// the unknown-guard refuse to spin and print the measured rgb/dark% to add here.
// Known-missing variant (never observed yet): enhanced (white sparkle) Wood.
const SIGNATURES = [
  { type: 0, thorn: false, rgb: [68, 146, 202] },  // Water
  { type: 1, thorn: false, rgb: [213, 36, 16] },   // Fire
  { type: 2, thorn: false, rgb: [30, 178, 39] },   // Wood
  { type: 3, thorn: false, rgb: [194, 144, 11] },  // Light
  { type: 4, thorn: false, rgb: [180, 33, 208] },  // Dark
  { type: 5, thorn: false, rgb: [229, 92, 168] },  // Heart
  { type: 0, thorn: false, rgb: [118, 193, 239] }, // Water enhanced (white sparkle)
  { type: 1, thorn: false, rgb: [246, 101, 67] },  // Fire enhanced (white sparkle)
  { type: 3, thorn: false, rgb: [241, 188, 51] },  // Light enhanced (white sparkle)
  { type: 4, thorn: false, rgb: [225, 77, 237] },  // Dark enhanced (white sparkle)
  { type: 5, thorn: false, rgb: [253, 183, 204] }, // Heart enhanced (white sparkle)
  { type: 0, thorn: false, electric: true, rgb: [172, 248, 247] }, // Electric rune (flicker phase A)
  { type: 0, thorn: false, electric: true, rgb: [191, 251, 250] }, // Electric rune (flicker phase B)
  // ICED pre-freeze state: still dissolves as its base element this turn, but
  // should be prioritized because survivors become FROZEN for later rounds.
  { type: 4, thorn: false, iced: true, rgb: [168, 110, 225] },       // Iced Dark, live 2026-07-10
  { type: 5, thorn: false, iced: true, rgb: [190, 140, 206] },       // Iced Heart, live 2026-07-10
  { type: 0, thorn: false, iced: true, rgb: [115, 162, 217] },       // Iced Water, live 2026-07-10
  // FROZEN rune (ice mechanic, P16). Two states: an ICED rune is fully normal
  // and dissolvable (dissolve it that round or it freezes!); if it survives a
  // spin round it becomes FROZEN for 3 rounds — can move/drag/pass-through
  // (the ice travels WITH the rune) but cannot dissolve. This signature is
  // the FROZEN white-crystal shell, whose appearance CHANGES each of its 3
  // rounds — later-round shells and the dissolvable iced look are UNMEASURED
  // (unknown-guard will refuse and print rgb to add here). The shell fully
  // masks the base element: all 5 frozen cells on the live board read an
  // identical (176,171,210) regardless of base (Fire underneath per the
  // User). Frame-stable (delta 0) and NOT an electric-glow candidate (only b
  // clears its threshold). main() puts the per-rune FROZEN value (6) on the
  // solver board instead of a positional flag; the placeholder type here is
  // display-only. Measured live 2026-07-08.
  { type: 1, thorn: false, frozen: true, rgb: [176, 171, 210] },     // Frozen (shell, round 1 of 3)
  { type: 1, thorn: false, frozen: true, rgb: [178, 112, 123] },     // Frozen Fire shell, 2 rounds left, brighter crystal, live 2026-07-10
  { type: 1, thorn: true, frozen: true, rgb: [114, 112, 130] },       // Frozen + thorn/fence overlay, live 2026-07-09
  { type: 1, thorn: true, frozen: true, rgb: [115, 90, 95] },         // Frozen Fire + thorn/fence overlay, 2 rounds left, live 2026-07-10
  { type: 0, thorn: true, rgb: [70, 98, 119] },    // Water + thorn
  { type: 1, thorn: true, rgb: [129, 61, 53] },    // Fire + thorn
  { type: 2, thorn: true, rgb: [59, 116, 62] },    // Wood + thorn
  { type: 3, thorn: true, rgb: [118, 98, 52] },    // Light + thorn
  { type: 4, thorn: true, rgb: [115, 58, 124] },   // Dark + thorn
  { type: 5, thorn: true, rgb: [140, 79, 113] },   // Heart + thorn
];
const MAX_SIG_DIST = 60;

// Chromaticity (r,g,b normalized to sum=1): brightness-invariant color, same
// principle as electricBase's glare-floor subtraction. Defined here (used by
// EDGE_HAZARD_SIGNATURES below, evaluated at module load) and again by
// classifyEdgeHazardBase per live sample.
function chroma(rgb) {
  const s = rgb[0] + rgb[1] + rgb[2];
  return [rgb[0] / s, rgb[1] / s, rgb[2] / s];
}

// Fiery edge-hazard overlay (left/right columns): the flame masks the normal
// board signature, so classify the hidden base from the center patch only.
// Live-calibrated from user-confirmed labels, 2026-07-10. Classified in
// CHROMATICITY space, not raw RGB: the flame's brightness varies by scene
// lighting/animation phase, and two live captures of the SAME board (~13%
// apart in absolute brightness) gave the SAME chromaticity per cell but
// different (wrong) nearest-signature results under raw Euclidean RGB
// distance — confirming the hazard's base type is a fixed per-cell property
// (never changes turn-to-turn) that raw-RGB matching was failing to read
// consistently.
// ⚠️ Heart and Water are NOT reliably separable at this overlay (found live
// 2026-07-10): on one board, User-confirmed (5,2)=Heart and (0,3)=Water
// measured (169,86,67) and (169,86,67) — literally under 1 RGB unit apart at
// every patch size tested (10/20/35/50), not a sampling artifact. Whatever
// visually distinguishes them here isn't average color. Both entries are
// kept (better to sometimes guess wrong between Heart/Water than refuse and
// block settling), but a nearest-match hit on either should be treated as
// LOW CONFIDENCE for that specific distinction — Dark/Fire/Light stay well
// separated (0.10+ margin) so cross-matching into those remains rare.
const EDGE_HAZARD_SIGNATURES = [
  { type: 1, rgb: [149, 60, 30], chroma: chroma([149, 60, 30]) }, // Fire
  { type: 3, rgb: [145, 74, 29], chroma: chroma([145, 74, 29]) }, // Light
  { type: 4, rgb: [146, 55, 59], chroma: chroma([146, 55, 59]) }, // Dark
  { type: 5, rgb: [156, 60, 52], chroma: chroma([156, 60, 52]) }, // Heart
  { type: 0, rgb: [149, 94, 74], chroma: chroma([149, 94, 74]) }, // Water (earlier board, User-confirmed 2026-07-10)
  { type: 5, rgb: [169, 86, 67], chroma: chroma([169, 86, 67]) }, // Heart (5,2), User-confirmed 2026-07-10
  { type: 0, rgb: [169, 86, 67], chroma: chroma([169, 86, 67]) }, // Water (0,3), User-confirmed 2026-07-10 — see ambiguity note above
  { type: 4, rgb: [167, 88, 79], chroma: chroma([167, 88, 79]) }, // Dark (5,3), User-confirmed 2026-07-10
  { type: 5, rgb: [167, 86, 66], chroma: chroma([167, 86, 66]) }, // Heart (0,4), User-confirmed 2026-07-10
];
// Raised 0.035->0.08 (2026-07-10) to include the new calibration points
// above (measured 0.044-0.073 from the nearest PRE-EXISTING signature) —
// still a comfortable margin under the nearest WRONG-type distance (Fire/
// Light stayed 0.11+ away in the same measurement), so this doesn't create
// new false-positive risk, it just accepts the Heart/Water ambiguity above.
const MAX_EDGE_HAZARD_DIST = 0.08;

// --drag-from card-badge signatures (separate palette from board SIGNATURES
// above — the UI icon's colors are brighter/more saturated than in-board
// runes; a badge Dark sample is ~115 units from the board Dark signature,
// well past MAX_SIG_DIST, so reusing SIGNATURES would misclassify). Same
// nearest-signature convention: HARD RULE (L8) every entry is a LIVE patch
// average, never extrapolated. Dark confirmed by the User directly (3 cards,
// same element, notably different brightness/saturation per card — this
// game renders Dark's badge with real per-character variance, not one fixed
// color, hence 3 entries for one type). Wood/Water are inferred from
// standard icon shape (leaf / wave) but NOT explicitly User-confirmed like
// Dark was. Fire/Light/Heart are UNMEASURED — the unknown-guard below
// refuses and prints the measured rgb so entries can be added here.
const CARD_SIGNATURES = [
  { type: 4, rgb: [219.7, 141.1, 211.3] }, // Dark (card 1), confirmed
  { type: 4, rgb: [192.0, 110.5, 186.8] }, // Dark (card 4), confirmed
  { type: 4, rgb: [192.5, 76.5, 202.4] },  // Dark (card 6), confirmed
  { type: 2, rgb: [102.0, 170.5, 51.0] },  // Wood (card 2), inferred from leaf icon
  { type: 2, rgb: [98.3, 165.3, 49.2] },   // Wood (card 3), inferred from leaf icon
  { type: 0, rgb: [77.2, 148.1, 204.4] },  // Water (card 5), inferred from wave icon
];
const MAX_CARD_SIG_DIST = 90; // Dark's own internal spread reaches ~71; cross-type distance is 200+
const TYPE_NAMES = ['Water', 'Fire', 'Wood', 'Light', 'Dark', 'Heart'];
const TYPE_LETTERS = ['w', 'f', 'g', 'l', 'd', 'h'];
const TYPE_CSS = ['#44a0e0', '#e03020', '#30c040', '#d0a020', '#a040d0', '#e060a0'];

// Edge-hazard cells (P22) are classified against a DIFFERENT signature table
// in CHROMATICITY units (MAX_EDGE_HAZARD_DIST=0.035, vs the board's raw-RGB
// MAX_SIG_DIST=60) — a flat MAX_SIG_DIST check would silently pass a truly
// unknown edge-hazard base whose chromaticity distance is actually large.
const cellUnknown = c => c.dist > (c.edgeNoClear ? MAX_EDGE_HAZARD_DIST : MAX_SIG_DIST);

// Bug found live 2026-07-10: displaying an edge-hazard cell's chromaticity
// distance (scale ~0.01-0.1) with .toFixed(0) always prints "d=0" — even for
// a genuinely-failing distance like 0.08 — making a real classification
// failure look like a confidently-suppressed dist=0. Use enough decimals for
// the scale actually in play.
const distStr = c => (c.edgeNoClear ? c.dist.toFixed(4) : c.dist.toFixed(0));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cellLabel = c => (c.unknownBase ? 'Shock?' : TYPE_NAMES[c.type] + (c.electric ? '^' : '') + (c.iced ? '~' : '') + (c.frozen ? '#' : '') + (c.noSolvable ? '%' : '') + (c.edgeNoClear ? '$' : '')) + (c.thorn ? '*' : '') + (c.go ? '@' : '');

// ---------- capture + recognition ----------

function captureRaw() {
  const rawPath = path.join(__dirname, 'screen.raw');
  execSync('adb shell screencap /sdcard/tos_screen.raw');
  execSync(`adb pull /sdcard/tos_screen.raw "${rawPath}"`, { stdio: 'pipe' });
  const buf = fs.readFileSync(rawPath);
  const w = buf.readUInt32LE(0), h = buf.readUInt32LE(4);
  let off = 12;
  if (buf.length - 16 === w * h * 4) off = 16;
  if (buf.length - off !== w * h * 4) throw new Error(`unexpected raw size: ${buf.length} for ${w}x${h}`);
  return { buf, w, h, off };
}

function capturePng(outFile) {
  execSync('adb shell screencap -p /sdcard/tos_screen.png');
  execSync(`adb pull /sdcard/tos_screen.png "${outFile}"`, { stdio: 'pipe' });
}

function cellStats(img, cx, cy, half = PATCH_HALF, step = PATCH_STEP) {
  let r = 0, g = 0, b = 0, n = 0, dark = 0;
  for (let dy = -half; dy <= half; dy += step) {
    for (let dx = -half; dx <= half; dx += step) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const pr = img.buf[i], pg = img.buf[i + 1], pb = img.buf[i + 2];
      r += pr; g += pg; b += pb; n++;
      if (pr + pg + pb < 120) dark++;
    }
  }
  return { rgb: [r / n, g / n, b / n], darkPct: dark / n };
}

function cellCornerStats(img, cx, cy) {
  let r = 0, g = 0, b = 0, n = 0, dark = 0;
  for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy += PATCH_STEP) {
    for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx += PATCH_STEP) {
      if (Math.abs(dx) <= 25 || Math.abs(dy) <= 25) continue;
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const pr = img.buf[i], pg = img.buf[i + 1], pb = img.buf[i + 2];
      r += pr; g += pg; b += pb; n++;
      if (pr + pg + pb < 120) dark++;
    }
  }
  return { rgb: [r / n, g / n, b / n], darkPct: dark / n };
}

function isGoOverlayStats(stats) {
  const [r, g, b] = stats.rgb;
  return (g > 190 && r >= 70 && r <= 150 && b >= 70 && b <= 160 && stats.darkPct < 0.12)
    || (g > 160 && r >= 80 && r <= 155 && b >= 80 && b <= 155
      && Math.abs(r - b) <= 30 && g - Math.max(r, b) >= 25 && stats.darkPct < 0.30);
}

function classifyGoCoveredCell(stats) {
  const [r, g, b] = stats.rgb;
  if (g - Math.max(r, b) >= 25 && Math.abs(r - b) <= 30) {
    const thorn = stats.darkPct > 0.2;
    const sig = thorn ? SIGNATURES.find(s => s.type === 2 && s.thorn)
                      : SIGNATURES.find(s => s.type === 2 && !s.thorn && !s.iced && !s.frozen && !s.electric);
    const dist = Math.hypot(r - sig.rgb[0], g - sig.rgb[1], b - sig.rgb[2]);
    return { type: 2, thorn, electric: false, iced: false, frozen: false, dist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
  }
  return classifyNormal(stats);
}

function noSolvableOverlayStats(img, cx, cy) {
  let muted = 0, brown = 0, darkGreen = 0, n = 0;
  for (let dy = -70; dy <= 70; dy += 2) {
    for (let dx = -70; dx <= 70; dx += 2) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
      n++;
      if (r >= 60 && r <= 150 && g >= 75 && g <= 170 && b >= 45 && b <= 130
          && Math.abs(g - r) < 70 && g >= b) muted++;
      if (r >= 90 && r <= 170 && g >= 55 && g <= 140 && b >= 25 && b <= 100
          && r >= g && g >= b) brown++;
      if (r >= 25 && r <= 100 && g >= 70 && g <= 150 && b >= 25 && b <= 100
          && g - r > 25 && g - b > 25) darkGreen++;
    }
  }
  return { mutedPct: muted / n, brownPct: brown / n, darkGreenPct: darkGreen / n };
}

function hasNoSolvableOverlay(img, cx, cy) {
  const s = noSolvableOverlayStats(img, cx, cy);
  return s.darkGreenPct > 0.18 && s.mutedPct > 0.08 && s.brownPct > 0.06;
}

/**
 * Secondary, lower-threshold green check for a cell that ALSO has the fire
 * overlay (P22): a cell can carry BOTH the no-solvable ring AND the fire
 * texture at once (User-confirmed live 2026-07-10), and the flame obscures
 * most of the ring — hasNoSolvableOverlay's wide-area percentage thresholds
 * never cross (measured live: darkGreenPct ~0.012 on 3 confirmed dual-hazard
 * cells, vs its 0.18 requirement). Green pixels peeking through flame gaps
 * are real but sparse: measured live 0.042-0.047 on the 3 dual cells vs
 * 0.005 on a genuinely fire-only cell and 0.55 on an unobscured ring — a
 * comfortable margin above the fire-only baseline, well below a full ring.
 */
function hasGreenTintUnderFire(img, cx, cy) {
  let green = 0, n = 0;
  for (let dy = -70; dy <= 70; dy += 2) {
    for (let dx = -70; dx <= 70; dx += 2) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
      n++;
      if (g > r && g > b && g > 60) green++;
    }
  }
  return (green / n) > 0.02;
}

function edgeNoClearOverlayStats(img, cx, cy) {
  let fire = 0, yellow = 0, dark = 0, n = 0;
  for (let dy = -70; dy <= 70; dy += 2) {
    for (let dx = -70; dx <= 70; dx += 2) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
      n++;
      if (r > 150 && g > 45 && g < 170 && b < 90 && r - b > 80) fire++;
      if (r > 180 && g > 120 && b < 90) yellow++;
      if (r + g + b < 120) dark++;
    }
  }
  return { firePct: fire / n, yellowPct: yellow / n, darkPct: dark / n };
}

function hasEdgeNoClearOverlay(img, cx, cy) {
  const s = edgeNoClearOverlayStats(img, cx, cy);
  // darkPct threshold lowered 0.28->0.20 (bug found live 2026-07-10): all 10
  // genuine fire-hazard cells on a live board measured darkPct 0.272-0.303,
  // but 3 of them fell just under the old 0.28 cutoff, causing flaky
  // detection (flip-flopping true/false across captures -> the board could
  // never settle). The closest false-positive risk (a plain Light gem, whose
  // own warm color satisfies firePct/yellowPct) measured darkPct 0.173 —
  // 0.20 keeps a comfortable margin on both sides.
  return s.firePct > 0.18 && s.yellowPct > 0.05 && s.darkPct > 0.20;
}

function classifyEdgeHazardBase(img, cx, cy) {
  const stats = cellStats(img, cx, cy, 35, 4);
  const c = chroma(stats.rgb);
  let best = null, bestDist = Infinity;
  for (const sig of EDGE_HAZARD_SIGNATURES) {
    const d = Math.hypot(c[0] - sig.chroma[0], c[1] - sig.chroma[1], c[2] - sig.chroma[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  return { type: best.type, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
}

/**
 * Classify the element badge of card `cardIdx` (0-indexed, 0-5) via nearest
 * CARD_SIGNATURES match. Same unknown-guard convention as board cells: a
 * distance past MAX_CARD_SIG_DIST means no calibrated signature is close
 * enough — the caller must refuse rather than guess (L8).
 */
function readCardBadge(img, cardIdx) {
  const stats = cellStats(img, CARD_BADGE_X[cardIdx], CARD_BADGE_Y, CARD_PATCH_HALF, CARD_PATCH_STEP);
  let best = null, bestDist = Infinity;
  for (const sig of CARD_SIGNATURES) {
    const d = Math.hypot(stats.rgb[0] - sig.rgb[0], stats.rgb[1] - sig.rgb[1], stats.rgb[2] - sig.rgb[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  return { type: best ? best.type : -1, dist: bestDist, rgb: stats.rgb.map(Math.round) };
}

// Electric glow rule (P11): arcs push at least TWO channels near-white —
// cyan arcs (wood/water base): g+b high, dims to (98,233,218); magenta arcs
// (dark base): r+b high, g swings 135-207. Enhanced runes light up only ONE
// channel pair partially (enhanced dark (225,77,237) is the near-miss — it
// passes this candidate rule and is rejected later by the flicker test:
// electric cells swing up to ~60/frame, all normal runes are frame-stable).
const isElectricGlow = rgb => ((rgb[0] > 210 ? 1 : 0) + (rgb[1] > 210 ? 1 : 0) + (rgb[2] > 205 ? 1 : 0)) >= 2;

function classify(stats, skipGlow = false) {
  // Electric runes (P11): near-white cyan, flickering arcs. Interrupt the
  // spin when touched or passed through. NOTE: single-frame whiteness can be
  // a GHOST (arc flare bleeding from a neighboring shock) — final electric
  // status requires persistence across frames (readBoardFromScreen).
  // skipGlow=true forces a pure nearest-signature match: the burst path uses
  // it once a glow candidate has FAILED the flicker test, so an enhanced
  // (bright) rune is classified by its real color instead of leaking through
  // as the type:0 placeholder this early-return would otherwise return
  // (LESSONS L18 — an enhanced Heart was misread as electric, then as Water).
  if (!skipGlow && isElectricGlow(stats.rgb)) {
    return { type: 0, thorn: false, electric: true, dist: 0, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
  }
  let best = null, bestDist = Infinity;
  for (const sig of SIGNATURES) {
    const d = Math.hypot(stats.rgb[0] - sig.rgb[0], stats.rgb[1] - sig.rgb[1], stats.rgb[2] - sig.rgb[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  // Two independent thorn signals: nearest signature + dark-pixel share (P5).
  // Trust the dark-pixel metric when they disagree.
  const thorn = stats.darkPct > 0.2;
  return { type: best.type, thorn, electric: best.electric ?? false, iced: best.iced ?? false, frozen: best.frozen ?? false, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
}

function classifyNormal(stats) {
  let best = null, bestDist = Infinity;
  for (const sig of SIGNATURES) {
    if (sig.electric || sig.iced || sig.frozen) continue;
    const d = Math.hypot(stats.rgb[0] - sig.rgb[0], stats.rgb[1] - sig.rgb[1], stats.rgb[2] - sig.rgb[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  const thorn = stats.darkPct > 0.2;
  return { type: best.type, thorn, electric: false, iced: false, frozen: false, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
}

/**
 * Base element of an electric rune (P11/L16) via TEMPORAL MINIMUM. The arcs
 * only ADD light, so the per-pixel minimum across many frames strips the
 * transient glare and leaves the base. Then subtract the lowest channel (the
 * white/glare floor) and read the residual hue — this cleanly separates all
 * six elements for both normal runes AND shocks (measured temporal-min bases:
 * Wood(22,121,16) Water(33,72,115) Dark(103,4,126) Light(102,61,1)
 * Fire(148,18,2) Heart(194,34,110); Light shocks land at the same yellow
 * residual (70,37,0)). Needs >=~8 frames to converge; returns -1 only if the
 * residual is too weak to call.
 * @param imgs array of >=8 captured frames
 */
function electricBase(imgs, cx, cy) {
  // dense grid; per point take the darkest (min sum) sample across frames
  const pts = [];
  for (let dy = -60; dy <= 60; dy += 8) {
    for (let dx = -60; dx <= 60; dx += 8) {
      let best = null, bestSum = Infinity;
      for (const img of imgs) {
        const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
        const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
        if (r + g + b < bestSum) { bestSum = r + g + b; best = [r, g, b]; }
      }
      pts.push(best);
    }
  }
  // average the darkest 40% of temporal-min points (edges catch base best)
  pts.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const keep = pts.slice(0, Math.ceil(pts.length * 0.4));
  const m = [0, 1, 2].map(ch => keep.reduce((s, p) => s + p[ch], 0) / keep.length);
  // strip the glare floor: subtract the lowest channel, read residual hue
  const lo = Math.min(m[0], m[1], m[2]);
  const r = m[0] - lo, g = m[1] - lo, b = m[2] - lo; // one of these is 0
  const chroma = Math.max(r, g, b);
  if (chroma < 20) return -1; // too washed to call
  if (b < 1) {                 // blue is floor -> warm (Wood/Light/Fire)
    if (g > r) return 2;                 // Wood
    return g / r > 0.30 ? 3 : 1;         // Light (yellow) vs Fire (red)
  }
  if (g < 1) {                 // green floor -> Dark / Heart / Fire-shock
    // A Fire SHOCK's arc lifts blue over green (green becomes floor) but the
    // residual stays nearly pure red: b/r ~0.04-0.18. Heart sits ~0.47, Dark
    // ~1.2 — so b/r cleanly separates all three (measured L16).
    const br = b / (r || 1);
    if (br > 0.75) return 4;              // Dark (blue comparable to/above red)
    if (br > 0.30) return 5;             // Heart (pink)
    return 1;                            // Fire (red, blue only mildly lifted)
  }
  return 0;                              // red floor -> Water (cyan/blue)
}

// The no-solvable prohibition-ring overlay locks a single element for the
// whole stage (P22) — its color can't be reliably recovered from the ring's
// translucent tint (see hasNoSolvableOverlay call site), so the type is an
// explicit default, overridable with --no-solvable-type=X (letter/name/digit,
// same convention as --clear-all/--2-match) rather than a per-cell guess.
function noSolvableTypeOverride() {
  const raw = argValue('--no-solvable-type');
  if (raw === null) return 2; // Wood — User-confirmed default (boss skill text), 2026-07-10
  const tok = raw.trim().toLowerCase();
  const t = /^[0-5]$/.test(tok) ? Number(tok)
    : TYPE_LETTERS.indexOf(tok) !== -1 ? TYPE_LETTERS.indexOf(tok)
    : TYPE_NAMES.map(n => n.toLowerCase()).indexOf(tok);
  if (t === -1) throw new Error(`--no-solvable-type: unknown rune type "${raw}" (use ${TYPE_NAMES.join('/')}, ${TYPE_LETTERS.join('/')}, or 0-5)`);
  return t;
}

/**
 * Full layered classification for one board cell against a single captured
 * frame: base signature match -> go-overlay -> no-solvable ring -> edge fire
 * hazard (P22). Shared by BOTH the normal first pass below AND the electric-
 * burst reclassification pass, which used to call plain classify() directly
 * and silently DISCARD every overlay layer for every non-electric cell on
 * the board the moment ANY cell anywhere looked like an electric candidate
 * (bug found live 2026-07-10 — see LESSONS L32). skipGlow mirrors classify().
 */
function classifyBoardCell(img, gx, gy, noSolvableType, skipGlow = false) {
  const cx = COLS[gx], cy = ROWS[gy];
  const stats = cellStats(img, cx, cy);
  let c = classify(stats, skipGlow);
  if (c.dist > MAX_SIG_DIST && isGoOverlayStats(stats)) {
    const edge = classifyGoCoveredCell(cellCornerStats(img, cx, cy));
    if (edge.dist <= MAX_SIG_DIST) c = {...edge, go: true};
  }
  if (!c.frozen && hasNoSolvableOverlay(img, cx, cy)) {
    // The prohibition ring is a TRANSLUCENT TINT of the underlying gem's own
    // color (verified live 2026-07-10 via zoomed crop: green ring on a Wood
    // gem, not a fixed color), but unlike the fire overlay (P22) there is no
    // clean gap showing pure base color — the ring's white outline/slash
    // lines dilute the whole-cell average pervasively. Measured live: raw-RGB
    // nearest match landed on Wood but at dist~98 (past MAX_SIG_DIST);
    // CHROMATICITY nearest match flipped to Light (also a poor, ambiguous
    // fit) — neither whole-cell-average approach reliably recovers the true
    // type under THIS overlay. Since the locked element is a single
    // STAGE-WIDE constant (User-confirmed: Wood here, from the boss's own
    // skill text — far more reliable than pixel-guessing), use an explicit
    // default with a CLI override (--no-solvable-type) rather than a fragile
    // per-cell color guess.
    // ⚠️ hasNoSolvableOverlay's own detection thresholds are calibrated
    // ONLY for a GREEN-tinted ring — a differently-colored ring (a future
    // stage locking a different element) may not be DETECTED at all (a
    // silent miss, not a misclassification) until recalibrated live.
    c.type = noSolvableType;
    c.electric = false;
    c.iced = false;
    c.frozen = false;
    c.noSolvable = true;
    c.dist = 0;
  }
  // NOT restricted to columns 0/5 (User correction, 2026-07-10): this fiery
  // no-dissolve overlay can appear on ANY cell(s), not just edge columns.
  if (hasEdgeNoClearOverlay(img, cx, cy)) {
    c.edgeNoClear = true;
    c.thorn = false;
    // A cell can carry BOTH overlays at once (live-confirmed 2026-07-10:
    // User reported (0,0)/(0,3)/(5,2) as Wood-locked-ring cells that also
    // show the fire texture; direct pixel comparison confirmed a green
    // ring/cross visible through the flame gaps, absent on a genuinely
    // fire-only cell). When noSolvable already fired, its type is a
    // reliable STAGE-WIDE CONSTANT (P22) — don't let classifyEdgeHazardBase
    // clobber it, especially since EDGE_HAZARD_SIGNATURES has no Wood entry
    // at all, so a Wood+fire cell would always misclassify as whichever of
    // Fire/Light/Dark/Heart is nearest (observed: Light).
    // hasNoSolvableOverlay itself MISSES this case (the flame dilutes its
    // wide-area green-percentage below its own 0.18 threshold — measured
    // ~0.012 on the 3 confirmed dual cells) — hasGreenTintUnderFire is a
    // lower-threshold secondary check for exactly this combination.
    if (!c.noSolvable && !c.frozen && hasGreenTintUnderFire(img, cx, cy)) {
      c.type = noSolvableType;
      c.noSolvable = true;
      c.dist = 0;
    }
    if (!c.noSolvable) {
      // The flame overlay dominates the whole-cell patch average (classify()
      // above is unreliable here) but the true base color reliably peeks
      // through the gap between the two flame blobs (live-confirmed
      // 2026-07-10: Fire/Heart/Dark/Light all showed their own tint through
      // that gap) — classifyEdgeHazardBase samples that narrow band instead.
      const edgeBase = classifyEdgeHazardBase(img, cx, cy);
      c.type = edgeBase.type; c.dist = edgeBase.dist; c.rgb = edgeBase.rgb;
    }
  }
  return c;
}

function readBoardFromScreen() {
  const img = captureRaw();
  const noSolvableType = noSolvableTypeOverride();
  const cells = [];
  let anyCandidate = false;
  for (let gy = 0; gy < 5; gy++) {
    const row = [];
    for (let gx = 0; gx < 6; gx++) {
      const c = classifyBoardCell(img, gx, gy, noSolvableType);
      if (c.electric) anyCandidate = true;
      row.push(c);
    }
    cells.push(row);
  }
  if (anyCandidate) {
    // Electric anywhere -> capture a burst. Persistence across frames rejects
    // one-frame neighbor-flare ghosts (P11); the burst also feeds electricBase
    // the temporal minimum it needs to read the base under glare (L16). ~10
    // frames converges the min; the arcs move fast so short spacing is fine.
    // ~18 frames: fewer under-converges the temporal min and pulls Light's
    // residual down toward Fire's (measured: 10 frames misread a Light shock
    // as Fire; 18-20 gives Light g/r ~0.45 vs Fire ~0.11).
    const imgs = [img];
    for (let k = 0; k < 17; k++) imgs.push(captureRaw());
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 6; gx++) {
        const statsPerFrame = imgs.map(im => cellStats(im, COLS[gx], ROWS[gy]));
        const candFrames = statsPerFrame.filter(s => isElectricGlow(s.rgb)).length;
        let maxDelta = 0;
        for (let k = 1; k < statsPerFrame.length; k++) {
          const a = statsPerFrame[k - 1].rgb, b = statsPerFrame[k].rgb;
          maxDelta = Math.max(maxDelta, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]));
        }
        // Electric confirmation = glow candidate in >=2 frames AND FLICKER.
        // Flicker is the sole reliable discriminator: P11 shocks swing maxDelta
        // up to ~60 across a burst, while every normal AND enhanced rune is
        // frame-stable (<=15). The old "|| meanMin > 90" fallback assumed no
        // enhanced rune lifts all channels — false for enhanced (white-sparkle)
        // Heart, measured live at (244,172,210): a glow candidate (r,b over
        // threshold) with all channels high (meanMin 172) yet dead-stable
        // (maxDelta ~7). It was misread as an electric Heart, flagged
        // NO_PICKUP, and blocked --start on that cell (LESSONS L18). Requiring
        // flicker removes the false positive and leaves real shocks (which do
        // flicker) detected.
        if (candFrames >= 2 && maxDelta > 25) {
          const c = { type: 0, thorn: false, electric: true, dist: 0, rgb: statsPerFrame[0].rgb.map(Math.round), darkPct: statsPerFrame[0].darkPct };
          const base = electricBase(imgs, COLS[gx], ROWS[gy]);
          if (base === -1) { c.dist = 999; c.unknownBase = true; } // refuse loudly
          else c.type = base;
          cells[gy][gx] = c;
        } else {
          // not electric: classify from the least-white FRAME to dodge flares
          // (bug found live 2026-07-10, L32: this used to classify() the
          // stats directly, discarding the go-overlay/no-solvable/edge-hazard
          // layers for EVERY non-electric cell on the board the moment ANY
          // cell anywhere looked like a candidate — now routed through the
          // same classifyBoardCell() as the first pass, on the chosen frame).
          // skipGlow=true so a bright glow-candidate that failed the flicker
          // test is matched to its real signature (enhanced Heart -> Heart),
          // not returned as the type:0 electric placeholder (L18).
          let bestIdx = 0, bestVal = Infinity;
          for (let k = 0; k < statsPerFrame.length; k++) {
            const v = Math.min(statsPerFrame[k].rgb[1], statsPerFrame[k].rgb[2]);
            if (v < bestVal) { bestVal = v; bestIdx = k; }
          }
          const c = classifyBoardCell(imgs[bestIdx], gx, gy, noSolvableType, true);
          c.electric = false; // transient flare suppressed
          cells[gy][gx] = c;
        }
      }
    }
  }
  return cells;
}

/**
 * Capture until the board is fully recognizable AND unchanged between two
 * consecutive captures — protects against reading mid-animation frames
 * (clear/skyfall) and against spinning while a dialog covers the board.
 */
async function waitForStableBoard(timeoutMs = 30000, allowUnknownShocks = false) {
  const t0 = Date.now();
  let prevKey = null, last = null;
  while (Date.now() - t0 < timeoutMs) {
    const cells = readBoardFromScreen();
    last = cells;
    // With a --shock-bases override pending, a bright shock whose base can't
    // be read is NOT a blocker — the override supplies it after settle.
    const allKnown = cells.every(row => row.every(c =>
      !cellUnknown(c) || (allowUnknownShocks && c.electric && c.unknownBase)));
    if (allKnown) {
      const key = cells.map(r => r.map(cellLabel).join(',')).join('|');
      if (key === prevKey) return cells;
      prevKey = key;
    } else {
      prevKey = null;
    }
    await sleep(800);
  }
  // Dump the last capture so the log shows WHY it never settled (new rune
  // variant -> SETTLE_UNKNOWN gives the measured value to add to SIGNATURES)
  if (last) {
    last.forEach((row, gy) => {
      console.log('[TOS] SETTLE_LAST_ROW' + gy + '=' + row.map(cellLabel).join(','));
    });
    const unk = [];
    last.forEach((row, gy) => row.forEach((c, gx) => {
      if (cellUnknown(c)) unk.push(`(${gx},${gy})d=${distStr(c)}rgb=(${c.rgb})dark=${Math.round(c.darkPct * 100)}%`);
    }));
    if (unk.length) console.log('[TOS] SETTLE_UNKNOWN=' + unk.join(';'));
  }
  throw new Error('board did not settle within 30s — see SETTLE_* lines: unknown rune variant, battle over, or a dialog covering the board');
}

// ---------- manual board input ----------

function readBoardFromFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length !== 5) throw new Error(`board file needs 5 rows, got ${lines.length}`);
  return lines.map((line, gy) => {
    const tokens = line.split(/[\s,]+/).filter(Boolean);
    if (tokens.length !== 6) throw new Error(`row ${gy} needs 6 cells, got ${tokens.length}`);
    return tokens.map((tok, gx) => {
      let core = tok.toLowerCase(), thorn = false, electric = false, iced = false, frozen = false, flags = 0;
      while (/[*!x^~#]$/.test(core)) {
        const s = core.slice(-1);
        if (s === '*') thorn = true;
        if (s === '!') flags |= CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
        if (s === 'x') flags |= CELL_FLAGS.NO_DISSOLVE;
        if (s === '^') electric = true;
        if (s === '~') iced = true;
        if (s === '#') frozen = true; // flags added in main(), same as electric
        core = core.slice(0, -1);
      }
      const type = /^[0-5]$/.test(core) ? Number(core) : TYPE_LETTERS.indexOf(core);
      if (type === -1) throw new Error(`bad token "${tok}" at (${gx},${gy})`);
      return { type, thorn, electric, iced, frozen, flags, dist: 0, rgb: null, darkPct: null };
    });
  });
}

// ---------- sealed-column inference ----------

function inferSealedColumns(cells) {
  const sealed = [];
  for (let gx = 0; gx < 6; gx++) {
    const thorns = cells.reduce((n, row) => n + (row[gx].thorn ? 1 : 0), 0);
    if (thorns >= 3) sealed.push(gx);
  }
  return sealed;
}

// ---------- touch execution ----------

/**
 * Grid path -> screen points. The held rune TRAILS the finger; at speed it
 * cuts corners diagonally through cells the finger never visits. So dwell
 * (hold position) at every turn, and longer when the cell neighbors a cell
 * in `dwellCells`, letting the trailing rune settle before direction
 * changes. Two distinct reasons feed the same cell list (P11/P22): an
 * electric cell forbids touching it at all — cutting a corner through it is
 * an instant interrupt; a fire-hazard cell allows touching/dragging through
 * freely, but a corner-cut swap can still drift the ACTUAL final rune
 * arrangement away from the verified-safe PLANNED one (User-reported live
 * 2026-07-10: a hazard cell's rune dissolved on a real spin even though the
 * planned path was independently confirmed to never dissolve it — see P22).
 * The dwell MECHANISM (settle before turning) fixes both; only the reason
 * differs, so callers just pass the union of both cell sets.
 */
function gridPathToScreenPath(gridPath, stepsPerCell = STEPS_PER_CELL, dwellCells = []) {
  const centers = gridPath.map(p => ({ x: COLS[p.x], y: ROWS[p.y] }));
  const nearDwellCell = p => dwellCells.some(e => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1);
  const out = [];
  for (let i = 0; i < centers.length - 1; i++) {
    let dwell = 0;
    if (i > 0) {
      const turned = (centers[i].x - centers[i - 1].x) !== (centers[i + 1].x - centers[i].x)
        || (centers[i].y - centers[i - 1].y) !== (centers[i + 1].y - centers[i].y);
      if (turned) dwell = 4;
      if (nearDwellCell(gridPath[i])) dwell = Math.max(dwell, 8);
    }
    for (let k = 0; k < dwell; k++) out.push({ x: centers[i].x, y: centers[i].y });
    for (let j = 0; j < stepsPerCell; j++) {
      const t = j / stepsPerCell;
      out.push({
        x: Math.round(centers[i].x + (centers[i + 1].x - centers[i].x) * t),
        y: Math.round(centers[i].y + (centers[i + 1].y - centers[i].y) * t),
      });
    }
  }
  out.push(centers[centers.length - 1]);
  return out;
}

/**
 * --drag-from: touch-down on card `cardIdx` (0-indexed) and interpolate up
 * to the board's (cardIdx, 0) cell center — ONE continuous drag, no lift.
 * Does NOT include the final (cardIdx,0) point: the solved path's own first
 * point is exactly that cell (enforced by forcing startCells to it), so the
 * caller concatenates this prefix directly before gridPathToScreenPath's
 * output with no duplicate/gap.
 */
function cardDragPrefix(cardIdx, stepsPerCell = STEPS_PER_CELL) {
  const startY = CARD_TOUCH_Y, endY = ROWS[0], x = COLS[cardIdx];
  const steps = Math.max(1, Math.round(stepsPerCell * Math.abs(endY - startY) / 180));
  const out = [];
  for (let j = 0; j < steps; j++) {
    out.push({ x, y: Math.round(startY + (endY - startY) * (j / steps)) });
  }
  return out;
}

/**
 * Paced stdin dispatch + unconditional release (LESSONS L11/L12/L17).
 *
 * CRITICAL (L17): the busy-wait to each deadline MUST yield (setImmediate)
 * each spin, else libuv never flushes the stdin pipe and adb ships the whole
 * drag as a ~0.4ms burst -> the game sees an instant jump and drops the rune
 * (the false "too fast" threshold). Old note below (frame-sampling theory)
 * was wrong; kept only for history:
 * The game samples touch per rendered frame: an instant burst works on light
 * scenes (counter-exact 27/27, 29/29) but drops the rune when heavy boss
 * effects stretch frame times (4/22 on æ˜Ÿæ–—ç ç›¤Â·ç«). MaaTouch has no `w`
 * command, so pacing must happen at the sender: deadline-scheduled writes
 * every stepMs. Jitter/stalls are harmless — a stationary held rune never
 * drops — the only fatal error is discarding the tail of the script, so:
 * generous grace after the final write, and afterwards ALWAYS run a one-shot
 * file-redirected `u 0` script (self-exiting), making a stuck touch
 * impossible regardless of what happened to the streaming session.
 */
async function executeTouchPath(screenPath, stepMs) {
  // Hygiene: a lingering injector from a killed session could still hold or
  // replay touch state — clear the field before every drag (root available).
  try { execSync('adb shell su -c "pkill -f MaaTouch"', { stdio: 'pipe' }); } catch { /* none running */ }
  const p = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await sleep(1500); // MaaTouch boot
  const w = s => p.stdin.write(s + '\n');
  w(`d 0 ${screenPath[0].x} ${screenPath[0].y} 100`); w('c');
  const t0 = performance.now();
  for (let i = 1; i < screenPath.length; i++) {
    const deadline = t0 + i * stepMs;
    const lead = deadline - performance.now();
    if (lead > 20) await sleep(lead - 18);
    // Busy-wait to the exact deadline, but YIELD each spin (setImmediate) so
    // libuv flushes the stdin pipe to adb between points. A pure busy-wait
    // (which happened whenever lead <= 20, i.e. fast speeds) never yields, so
    // Node batched every write and the device received them as one 0.4ms
    // burst -> the game saw an instant jump and dropped the rune (L17).
    while (performance.now() < deadline) { await new Promise(setImmediate); }
    w(`m 0 ${screenPath[i].x} ${screenPath[i].y} 100`); w('c');
  }
  w('u 0'); w('c');
  const dragMs = performance.now() - t0;
  await sleep(2000); // grace: only the 2-line tail can be in flight
  p.kill();

  // Unconditional forced release: one-shot script, runs to EOF and self-exits.
  const localScript = path.join(__dirname, 'spin_script.txt');
  fs.writeFileSync(localScript, 'u 0\nc\n');
  execSync(`adb push "${localScript}" /data/local/tmp/tos_spin.txt`, { stdio: 'pipe' });
  await new Promise(resolve => {
    const q = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App < /data/local/tmp/tos_spin.txt'], { stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { q.kill(); resolve(); }, 8000);
    q.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  return dragMs;
}

// ---------- recognition check page ----------

function writeCheckHtml(cells, sealedCols, outFile) {
  const pngFile = path.join(__dirname, 'check_screen.png');
  capturePng(pngFile);
  const b64 = fs.readFileSync(pngFile).toString('base64');
  const SCALE = 0.5;
  let overlays = '';
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 6; gx++) {
      const c = cells[gy][gx];
      const suspect = cellUnknown(c);
      const left = (COLS[gx] - 90) * SCALE, top = (ROWS[gy] - 90) * SCALE, size = 180 * SCALE;
      overlays += `<div class="cell${suspect ? ' suspect' : ''}" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;border-color:${TYPE_CSS[c.type]}">` +
        `<span style="background:${TYPE_CSS[c.type]}">${TYPE_NAMES[c.type]}${c.electric ? '^' : ''}${c.iced ? '~' : ''}${c.frozen ? '#' : ''}${c.noSolvable ? '%' : ''}${c.edgeNoClear ? '$' : ''}${c.thorn ? '*' : ''}${c.go ? '@' : ''}</span>` +
        `<small>d=${distStr(c)}</small></div>`;
    }
  }
  const html = `<!doctype html><meta charset="utf-8"><title>TOS recognition check</title>
<style>
body{font-family:sans-serif;background:#222;color:#eee;margin:16px}
.wrap{position:relative;width:${1080 * SCALE}px}
.wrap img{width:100%;display:block}
.board{position:absolute;left:0;top:${1240 * SCALE}px}
.cell{position:absolute;border:3px solid;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
.cell span{font-size:12px;font-weight:bold;color:#000;padding:1px 3px;align-self:flex-start}
.cell small{font-size:10px;color:#fff;text-shadow:0 0 3px #000;align-self:flex-end;padding:1px 3px}
.cell.suspect{border-width:6px;border-color:#fff !important;animation:blink .6s infinite alternate}
@keyframes blink{to{opacity:.3}}
</style>
<p>Each box = recognized rune (border color = type, * = thorn). d = color distance
(lower is more confident; blinking white = above threshold ${MAX_SIG_DIST}, unreliable).
Sealed columns detected: <b>[${sealedCols.join(', ')}]</b></p>
<div class="wrap"><img src="data:image/png;base64,${b64}"><div class="board">${overlays}</div></div>`;
  fs.writeFileSync(outFile, html);
}

// ---------- main ----------

function argValue(flag) {
  // Accept both "--flag value" and "--flag=value" (the latter is what a shell
  // produces from --start="5,1"). The "=" form is matched first; flag+"="
  // never collides with a longer flag name (e.g. --first= vs --first-runes=).
  const eq = process.argv.find(a => a.startsWith(flag + '='));
  if (eq !== undefined) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

// Parse a "col,row" cell argument (x=column 0-5, y=row 0-4) — the same
// convention the board grid and [TOS] PATH use. Returns {x,y} or null.
function argCell(flag) {
  const raw = argValue(flag);
  if (raw == null) return null;
  const parts = String(raw).split(',').map(s => Number(s.trim()));
  if (parts.length !== 2 || !parts.every(Number.isInteger)
      || parts[0] < 0 || parts[0] > 5 || parts[1] < 0 || parts[1] > 4) {
    throw new Error(`${flag} must be "col,row" with col 0-5 and row 0-4 (got "${raw}")`);
  }
  return { x: parts[0], y: parts[1] };
}

function parseRuneTypeList(flag) {
  const raw = argValue(flag);
  if (!raw) return [];
  return [...new Set(String(raw).split(',').filter(Boolean).map(s => {
    const tok = s.trim().toLowerCase();
    const t = /^[0-5]$/.test(tok) ? Number(tok)
      : TYPE_LETTERS.indexOf(tok) !== -1 ? TYPE_LETTERS.indexOf(tok)
      : TYPE_NAMES.map(n => n.toLowerCase()).indexOf(tok);
    if (t === -1) throw new Error(`${flag}: unknown rune type "${s.trim()}" (use ${TYPE_NAMES.join('/')}, ${TYPE_LETTERS.join('/')}, or 0-5)`);
    return t;
  }))];
}

function askEnter(msg) {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => { rl.close(); resolve(); });
  });
}

// Defaults to NO (safe: preserves the old always-abort behavior unless the
// User explicitly opts in) and skips the prompt entirely when stdin isn't a
// TTY (scripted/piped runs) so an unattended run can't hang forever.
function askYesNo(msg) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  return new Promise(resolve => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const dry = process.argv.includes('--dry');
  const checkOnly = process.argv.includes('--check');
  const boardFile = argValue('--board');
  let rounds = Math.max(1, Math.floor(Number(argValue('--rounds') ?? 1) || 1));
  if ((dry || checkOnly || boardFile) && rounds > 1) {
    console.log('[TOS] ROUNDS_FORCED=1 (--rounds only applies to live spin mode)');
    rounds = 1;
  }

  for (let round = 1; round <= rounds; round++) {
    if (rounds > 1) console.log(`[TOS] ROUND=${round}/${rounds}`);

    const cells = boardFile ? readBoardFromFile(boardFile)
      : await waitForStableBoard(30000, !!argValue('--shock-bases'));

    // --shock-bases override: bright shocks (esp. Light) defeat pixel base
    // detection (L15). Supply the base elements for the detected electric
    // cells (row-major order): one letter applies to all, or a comma list
    // maps in order. e.g. --shock-bases l  or  --shock-bases w,l,d
    const shockArg = argValue('--shock-bases');
    if (shockArg) {
      const elecCells = [];
      cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.electric) elecCells.push(c); }));
      const bases = shockArg.split(',').map(s => s.trim().toLowerCase());
      elecCells.forEach((c, i) => {
        const tok = bases.length === 1 ? bases[0] : bases[i];
        const t = tok !== undefined && (/^[0-5]$/.test(tok) ? Number(tok) : TYPE_LETTERS.indexOf(tok));
        if (t === -1 || t === undefined || t === false) throw new Error(`--shock-bases: bad/missing element for shock #${i + 1} (need ${elecCells.length} value(s))`);
        c.type = t; c.dist = 0; c.unknownBase = false;
      });
      console.log(`[TOS] SHOCK_BASES_OVERRIDE=${elecCells.length} cell(s) set to [${bases.join(',')}]`);
    }

    const unknowns = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => {
      if (cellUnknown(c)) unknowns.push(`(${gx},${gy})d=${distStr(c)}rgb=(${c.rgb})dark=${Math.round(c.darkPct * 100)}%`);
    }));
    cells.forEach((row, gy) => {
      console.log('[TOS] BOARD_ROW' + gy + '=' + row.map(cellLabel).join(','));
    });
    const elecList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.electric) elecList.push(`${gx},${gy}`); }));
    if (elecList.length) console.log('[TOS] ELECTRIC_CELLS=' + elecList.join(' ') + ' (row-major; --shock-bases maps in this order)');
    const goCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.go) goCells.push({ x: gx, y: gy }); }));
    if (goCells.length) console.log('[TOS] GO_CELLS=' + goCells.map(c => `${c.x},${c.y}`).join(' ') + ' (forced drag start unless --start/--drag-from overrides)');
    const edgeNoClearCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.edgeNoClear) edgeNoClearCells.push(`${gx},${gy}`); }));
    if (edgeNoClearCells.length) console.log('[TOS] EDGE_NO_CLEAR_CELLS=' + edgeNoClearCells.join(' ') + ' (positional hazard: treated as NO_DISSOLVE)');
    // {x,y} form for the drag-execution dwell logic below (User-reported live
    // 2026-07-10: a hazard cell's rune dissolved during an actual spin even
    // though the PLANNED path was verified safe — BoardSimulator never marks
    // a NO_DISSOLVE cell into any group. Touching/dragging THROUGH a hazard
    // cell is completely fine (User-clarified: unlike an electric shock cell,
    // where touching itself is forbidden); the risk is purely EXECUTION
    // FIDELITY — the held rune TRAILS the finger and can cut corners at
    // speed (P11), so the ACTUAL swap sequence the device performs can
    // diverge from the verified-safe PLANNED sequence, landing a different
    // rune arrangement than intended near the hazard cell. Extra dwell at
    // turns near a hazard cell reduces that drift, the same way it already
    // does near an electric cell — the MECHANISM is identical (settle the
    // trailing rune before changing direction), only the REASON differs
    // (there: touching is forbidden; here: an off-plan swap risks an
    // accidental match).
    const hazardDwellCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.edgeNoClear || c.noSolvable) hazardDwellCells.push({ x: gx, y: gy }); }));
    const detectedNoSolvableTypes = [...new Set(cells.flat().filter(c => c.noSolvable).map(c => c.type))];
    let noSolvableTypes = [...new Set([...parseRuneTypeList('--no-solvable'), ...detectedNoSolvableTypes])];
    if (detectedNoSolvableTypes.length > 0) {
      console.log('[TOS] NO_SOLVABLE_MARKERS=' + detectedNoSolvableTypes.map(t => TYPE_NAMES[t]).join(',')
        + ' (detected from board no-symbol overlay)');
    }

    const sealedArg = argValue('--sealed');
    const sealedCols = sealedArg === 'none' ? []
      : sealedArg ? sealedArg.split(',').map(Number)
      : inferSealedColumns(cells);
    console.log('[TOS] SEALED_COLS=' + JSON.stringify(sealedCols) + (sealedArg ? ' (forced)' : ' (inferred from thorn overlay)'));

    if (checkOnly) {
      const out = path.join(__dirname, 'check.html');
      writeCheckHtml(cells, sealedCols, out);
      console.log('[TOS] CHECK_HTML=' + out);
      if (unknowns.length) console.log('[TOS] UNKNOWN_CELLS=' + unknowns.join(';'));
      return;
    }

    if (unknowns.length) {
      console.log('[TOS] UNKNOWN_CELLS=' + unknowns.join(';'));
      const electricUnknown = cells.some(row => row.some(c => c.electric && c.dist > MAX_SIG_DIST));
      throw new Error(electricUnknown
        ? 'shock rune base unreadable (bright glow) — pass --shock-bases (e.g. --shock-bases l for all-Light, or w,l,d in row-major order of the ELECTRIC_CELLS above)'
        : 'unrecognized cells, refusing to spin — run --check or supply --board');
    }

    const board = new Board();
    // Frozen runes go onto the solver board as the per-rune FROZEN value: they
    // drag/swap/fall like any rune (ice travels with them) but never match.
    board.fromArray(cells.map(row => row.map(c => (c.frozen ? FROZEN : c.type))));

    // --drag-from N (1-indexed card, 1-6): the drag PHYSICALLY starts by
    // touching card N and dragging it into the board — that action drops a
    // rune of the card's element at (N-1, 0), displacing whatever was read
    // there, before any solving happens. One continuous drag (card -> board
    // -> solved path), so the solve is also forced to START at (N-1, 0).
    const dragFromArg = argValue('--drag-from');
    let dragFromCol = null;
    if (dragFromArg !== null) {
      const cardNum = Number(dragFromArg);
      if (!Number.isInteger(cardNum) || cardNum < 1 || cardNum > 6) {
        throw new Error(`--drag-from must be a card number 1-6 (got "${dragFromArg}")`);
      }
      dragFromCol = cardNum - 1;
      const cardImg = captureRaw();
      const badge = readCardBadge(cardImg, dragFromCol);
      if (badge.dist > MAX_CARD_SIG_DIST) {
        console.log(`[TOS] ABORT=drag-from-unknown card=${cardNum} rgb=(${badge.rgb}) dist=${badge.dist.toFixed(0)}`
          + ' — no calibrated CARD_SIGNATURES entry within threshold (add one for this element/brightness; no touch sent)');
        return;
      }
      const prevLabel = cellLabel(cells[0][dragFromCol]);
      console.log(`[TOS] DRAG_FROM=card${cardNum} type=${TYPE_NAMES[badge.type]} rgb=(${badge.rgb}) dist=${badge.dist.toFixed(0)}`);
      console.log(`[TOS] DRAG_FROM_OVERWRITE=(${dragFromCol},0) ${prevLabel} -> ${TYPE_NAMES[badge.type]} (existing rune displaced)`);
      board.set(dragFromCol, 0, badge.type);
    }

    // Electric runes (P11): cannot be picked up or dragged through (interrupt
    // the spin) but DO dissolve with their base element — and clearing them is
    // top priority (they block attacking until dissolved).
    const priorityCells = [];
    const flagGrid = cells.map((row, gy) => row.map((c, gx) => {
      let f = c.flags ?? 0;
      if (c.electric) {
        f |= CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
      }
      if (c.edgeNoClear) {
        f |= CELL_FLAGS.NO_DISSOLVE;
      }
      if (c.electric || c.iced) {
        priorityCells.push({ x: gx, y: gy });
      }
      return f;
    }));
    // Frozen runes (P16) are NOT flagged: they are draggable and pass-through
    // (User confirmed), and the ice travels with the rune — handled by the
    // per-rune FROZEN board value above, which positional flags can't model.
    const frozenList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.frozen) frozenList.push(`${gx},${gy}`); }));
    if (frozenList.length) console.log('[TOS] FROZEN_CELLS=' + frozenList.join(' ') + ' (draggable/pass-through, never dissolve; ice travels with the rune)');
    const icedList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.iced) icedList.push(`${gx},${gy}`); }));
    if (icedList.length) console.log('[TOS] ICED_CELLS=' + icedList.join(' ') + ' (dissolvable this round; first-wave priority before they freeze)');
    const hasFlags = flagGrid.some(row => row.some(v => v !== 0));
    if (hasFlags) console.log('[TOS] CELL_FLAGS_ROWS=' + flagGrid.map(r => r.join('')).join('|'));

    // --start / --end pin the drag's begin/end cell (col,row). Orthogonal to
    // every other knob (sealed columns, first-combos/-runes, priority) — they
    // just restrict the beam's seed cells and which states may be the answer.
    // --drag-from FORCES start to (dragFromCol, 0): the physical drag enters
    // the board there, so the solve must begin there too — it overrides any
    // --start value given (they'd conflict with the one continuous motion).
    let startCell = argCell('--start');
    const endCell = argCell('--end');
    if (dragFromCol === null && startCell === null && goCells.length > 0) {
      startCell = goCells[0];
      if (goCells.length > 1) console.log('[TOS] GO_START=multiple detected; using first row-major ' + `${startCell.x},${startCell.y}`);
      else console.log('[TOS] GO_START=' + `${startCell.x},${startCell.y}`);
    }
    if (dragFromCol !== null) {
      if (startCell && (startCell.x !== dragFromCol || startCell.y !== 0)) {
        console.log(`[TOS] DRAG_FROM_OVERRIDE=start forced to ${dragFromCol},0 (was --start ${startCell.x},${startCell.y}` +
          ' — --drag-from\'s physical motion enters the board at its own card column, overriding --start)');
      }
      startCell = { x: dragFromCol, y: 0 };
    }
    if (startCell && (flagGrid[startCell.y][startCell.x] & (CELL_FLAGS.NO_PICKUP))) {
      console.log(`[TOS] ABORT=start-unpickable start=${startCell.x},${startCell.y} is electric/locked (NO_PICKUP) — the game can't lift it; pick another --start (no touch sent)`);
      return;
    }
    const startCells = startCell ? [startCell] : null;
    if (startCell || endCell) {
      console.log(`[TOS] PIN=start:${startCell ? `${startCell.x},${startCell.y}` : 'any'} end:${endCell ? `${endCell.x},${endCell.y}` : 'any'}`);
    }
    // --fire-route [N]: the drag leaves a fire trail; the last N cells the
    // finger left stay on fire and can't be re-entered (self-avoiding within a
    // sliding window; oldest releases as you advance). Bare flag = 6; --fire-route N
    // (or --fire-route=N) sets the length.
    let fireRoute = 0;
    if (process.argv.some(a => a === '--fire-route' || a.startsWith('--fire-route='))) {
      const n = Number(argValue('--fire-route'));
      fireRoute = (Number.isInteger(n) && n > 0) ? n : 6;
      console.log(`[TOS] FIRE_ROUTE=${fireRoute} (last ${fireRoute} cells left behind stay on fire; no re-entry)`);
    }
    // --2-match=h,f : rune types that dissolve at a run of TWO instead of three
    // (boss mechanic). A 2-run of such a type counts as a full combo everywhere
    // (scoring, first-wave counts, clear-all). Everything else still needs 3.
    const twoMatchParsed = parseRuneTypeList('--2-match');
    const twoMatch = twoMatchParsed.length ? twoMatchParsed : null;
    const isTwoMatch = t => twoMatch !== null && twoMatch.includes(t);
    if (twoMatch) console.log(`[TOS] TWO_MATCH=${twoMatch.map(t => TYPE_NAMES[t]).join(',')} (dissolve at a run of 2)`);
    // --no-solvable=f,g : listed rune types never dissolve at all, even if
    // aligned in a run of 3+ (and even if also named in --2-match).
    if (noSolvableTypes.length > 0) {
      const twoConflict = noSolvableTypes.filter(t => isTwoMatch(t));
      if (twoConflict.length > 0) {
        console.log('[TOS] ABORT=no-solvable-conflict ' + twoConflict.map(t => TYPE_NAMES[t]).join(',')
          + ' cannot be both --2-match and --no-solvable (no touch sent)');
        return;
      }
      console.log('[TOS] NO_SOLVABLE=' + noSolvableTypes.map(t => TYPE_NAMES[t]).join(',')
        + ' (never dissolves, including cascades)');
    }
    // --first-combos N = EXACTLY N; --first-combos N+ = at least N;
    // --first-combos max = highest achievable. --first-min-combos N stays
    // as a backward-compatible alias for N+.
    const rawExactFlag = argValue('--first-combos');
    const rawTarget = rawExactFlag ?? argValue('--first-min-combos');
    const maxMode = rawTarget === 'max';
    const exactMode = rawExactFlag !== null && !maxMode && !String(rawExactFlag).endsWith('+');
    const minFirstArg = maxMode ? 0 : Number(String(rawTarget ?? 0).replace(/\+$/, ''));
    // --first-runes N = EXACTLY N runes in the first wave (楊玉環 "NUM N");
    // --first-runes N+ = at least N.
    const rawRunes = argValue('--first-runes');
    const exactRunesMode = rawRunes !== null && !String(rawRunes).endsWith('+');
    const minFirstRunes = Number(String(rawRunes ?? 0).replace(/\+$/, ''));
    // --first-wave-no TYPES: listed types may not dissolve in wave 1. They
    // may still match after gravity/cascades.
    const firstWaveNoTypes = parseRuneTypeList('--first-wave-no');
    if (firstWaveNoTypes.length > 0) {
      console.log('[TOS] FIRST_WAVE_NO=' + firstWaveNoTypes.map(t => TYPE_NAMES[t]).join(',')
        + ' (forbidden only in wave 1; cascades after gravity are allowed)');
    }
    // --clear-all TYPES: the first wave must dissolve EVERY rune of each
    // listed type. Accepts full names / letters / digits, comma-separated
    // (e.g. "heart", "h,w", "5,0"). STRICT semantics: the required count is
    // the type's total count on the board, so runes sitting in thorn/sealed
    // columns or NO_DISSOLVE cells must be dragged OUT and dissolved —
    // parking a required rune into a sealed column never satisfies the boss.
    const clearTypes = parseRuneTypeList('--clear-all');
    const impossibleBoth = clearTypes.filter(t => firstWaveNoTypes.includes(t));
    if (impossibleBoth.length > 0) {
      console.log('[TOS] ABORT=first-wave-no-conflict ' + impossibleBoth.map(t => TYPE_NAMES[t]).join(',')
        + ' cannot be both --clear-all and --first-wave-no in wave 1 (no touch sent)');
      return;
    }
    const noSolveClear = clearTypes.filter(t => noSolvableTypes.includes(t));
    if (noSolveClear.length > 0) {
      console.log('[TOS] ABORT=no-solvable-conflict ' + noSolveClear.map(t => TYPE_NAMES[t]).join(',')
        + ' cannot be both --clear-all and --no-solvable (no touch sent)');
      return;
    }
    if (clearTypes.length > 0) {
      // Exclude frozen cells: their .type is a display placeholder — on the
      // solver board they are FROZEN and can never dissolve, so they are not
      // part of a clear-all demand (they melt in a later round).
      const totals = clearTypes.map(t => ({ t, n: cells.flat().filter(c => c.type === t && !c.frozen).length }));
      console.log('[TOS] CLEAR_ALL_TARGET=' + totals.map(o => `${TYPE_NAMES[o.t]}:${o.n}`).join(',')
        + ' (strict: thorn-column runes must be dragged out and dissolved)');
      const dead = totals.filter(o => o.n > 0 && o.n < (isTwoMatch(o.t) ? 2 : 3));
      if (dead.length > 0) {
        const deadDesc = dead.map(o => `${TYPE_NAMES[o.t]}=${o.n}`).join(',');
        console.log('[TOS] CLEAR_ALL_INFEASIBLE=' + deadDesc
          + ' — too few of a type to ever form a dissolve group (2-match types need 2, others 3)');
        const force = process.argv.includes('--force-partial-clear-all');
        const proceed = force || await askYesNo(
          `[TOS] Continue and solve normally (drop ${deadDesc}, keep every other flag: start/end/first-combos/etc)? [y/N] `);
        if (!proceed) {
          console.log('[TOS] ABORT=clear-all-infeasible ' + deadDesc + ' (no touch sent)');
          return;
        }
        const deadSet = new Set(dead.map(o => o.t));
        for (let i = clearTypes.length - 1; i >= 0; i--) if (deadSet.has(clearTypes[i])) clearTypes.splice(i, 1);
        console.log('[TOS] CLEAR_ALL_TYPES=' + (clearTypes.length ? clearTypes.map(t => TYPE_NAMES[t]).join(',') : 'none')
          + ' (infeasible type(s) dropped; continuing with remaining constraints)');
      }
    }
    // --workers N: shard the beam search across worker_threads (phone/
    // parallel.js). Default = cores-1; 1 = exact sequential solve. The beam
    // is PARTITIONED per worker (beamWidth/N each), so results can differ
    // slightly from --workers 1 in either direction — wall time ~1/N.
    const workers = Math.max(1, Number(argValue('--workers') ?? 0) || defaultWorkers());
    console.log(`[TOS] WORKERS=${workers}` + (workers > 1 ? ` (beam sharded ~${Math.ceil(Number(argValue('--beam') ?? 200) / workers)}/worker; --workers 1 for exact sequential)` : ''));
    const t0 = Date.now();
    let sol, engine;

    if (minFirstRunes > 0) {
      sol = await solveDoraParallel(board, {
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        sealedColumns: sealedCols,
        flags: hasFlags ? flagGrid : null, priorityCells,
        minFirstRunes, exactFirstRunes: exactRunesMode,
        startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
      }, workers);
      engine = `DoraSolver(firstRunes${exactRunesMode ? '==' : '>='}${minFirstRunes})`;
    } else if (maxMode) {
      // Find the highest achievable first-wave count (bound -> planner -> baseline).
      // plannerBeamWidth is a CEILING, not a fixed width: solveClearAllParallel
      // escalates internally (300 -> 2000 -> 8000 -> ... up to this ceiling),
      // so passing the full --beam here is safe and correct — a hard dual
      // start+end pin can genuinely need beam 8000+ to route at all (a fixed
      // cap of 2000 silently MISSed a solvable 5/5 case, L25-adjacent bug).
      const res = await solveMaxFirstCombosParallel(board, {
        sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, priorityCells,
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        plannerBeamWidth: Math.max(300, Number(argValue('--beam') ?? 0)),
        plannerMaxPath: Math.max(60, Number(argValue('--max-path') ?? 0)),
        startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
      }, workers);
      sol = res.solution;
      engine = `MaxFirstCombos(achieved=${res.achieved}/bound=${res.bound})`;
    } else {
      sol = await solveDoraParallel(board, {
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        sealedColumns: sealedCols,
        flags: hasFlags ? flagGrid : null, priorityCells,
        minFirstCombos: minFirstArg, exactFirstCombos: exactMode,
        startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
      }, workers);
      engine = 'DoraSolver';
    }

    const missesTarget = () => exactMode ? sol.firstCombos !== minFirstArg : sol.firstCombos < minFirstArg;
    // DoraSolver's beam often can't gather a scattered scarce type into its
    // dissolving group(s), so clear-all MISSes; detect it to trigger the
    // constructive coverage planner (which CAN, unlike a wider beam).
    const clearAllMissed = () => {
      if (clearTypes.length === 0) return false;
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes });
      const totalsByType = t => board.grid.reduce((n, row) => n + row.filter(v => v === t).length, 0);
      return clearTypes.some(t => sim.firstClearedByType[t] < totalsByType(t));
    };
    const firstWaveNoMissed = () => {
      if (firstWaveNoTypes.length === 0) return false;
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes });
      return firstWaveNoTypes.some(t => sim.firstClearedByType[t] > 0);
    };

    // Guarantee escalation: if beam search misses the first-combo target OR a
    // clear-all demand, the planner constructs it (or proves it impossible).
    if (!maxMode && minFirstRunes === 0 && ((minFirstArg > 0 && missesTarget()) || clearAllMissed() || firstWaveNoMissed())) {
      // plannerBeam is a CEILING: solveClearAllParallel escalates internally
      // (300 -> 2000 -> 8000 -> ... up to this value), so it stays fast on
      // easy/no-pin cases (L22: routes at 300) while still succeeding on a
      // hard dual start+end pin that needs far more width to route at all
      // (measured live: 2000/4000 routing-failed, 8000 succeeded on a
      // solvable 5/5 case — a flat 2000 cap silently MISSed it).
      const plannerBeam = Math.max(300, Number(argValue('--beam') ?? 0));
      const plannerMaxPath = Math.max(60, Number(argValue('--max-path') ?? 0));
      const plannerOpts = {
        sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null,
        minFirstCombos: minFirstArg, exact: exactMode,
        beamWidth: plannerBeam, maxPath: plannerMaxPath,
        startCells, endCell, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, noSolvableTypes,
      };
      // Clear-all coverage targets are independent routing problems — shard
      // them across the same worker pool; the combo-target planner path
      // stays sequential (it early-returns on the first routed target).
      const planned = clearTypes.length
        ? await solveClearAllParallel(board, plannerOpts, workers)
        : new TargetPlanner(board, plannerOpts).solve();
      if (planned.solution) {
        sol = planned.solution;
        engine = clearTypes.length ? `TargetPlanner(clear-all,combos=${planned.solution.comboCount})` : `TargetPlanner(target#${planned.targetsTried})`;
      } else {
        console.log('[TOS] PLANNER=failed reason=' + planned.reason + (planned.reason === 'routing-failed'
          ? ` (targets exist; escalated routing up to beam=${plannerBeam} maxPath=${plannerMaxPath} (${planned.targetsTried} target-attempts total); retry with --beam ${plannerBeam * 2} and/or --max-path ${plannerMaxPath + 30})`
          : ' (demand provably impossible on this board)'));
      }
    }

    console.log(`[TOS] SOLVE ms=${Date.now() - t0} engine=${engine} start=${sol.startX},${sol.startY} moves=${sol.moves.length} first=${sol.firstCombos} firstRunes=${sol.firstRunes} combos=${sol.comboCount} chains=${sol.chains} weight=${sol.score}`);
    console.log('[TOS] PATH=' + sol.path.map(p => `${p.x},${p.y}`).join(' '));

    // Start/end pinning is a hard constraint: if the solver couldn't honor it
    // (end unreachable within --max-path, or nothing to seed), abort rather
    // than spin a path that ignores the pins. Checked before the first-wave
    // aborts so an impossible pin is reported as the root cause.
    if (startCell || endCell) {
      const first = sol.path[0], last = sol.path[sol.path.length - 1];
      const startOk = !startCell || (first.x === startCell.x && first.y === startCell.y);
      const endOk = !endCell || (last.x === endCell.x && last.y === endCell.y);
      if (sol.moves.length === 0 || !startOk || !endOk) {
        console.log(`[TOS] ABORT=start-end required start=${startCell ? `${startCell.x},${startCell.y}` : 'any'} end=${endCell ? `${endCell.x},${endCell.y}` : 'any'} but got start=${first.x},${first.y} end=${last.x},${last.y} moves=${sol.moves.length} — unreachable within --max-path ${Number(argValue('--max-path') ?? 30)} (raise --max-path, or relax --start/--end); no touch sent`);
        return;
      }
    }

    // Clear-all gate: recompute from the post-drag board (engine-independent
    // — planner solutions and max mode pass through here too). Totals are
    // counted on sol.board (drags conserve runes, so they equal the original
    // board's counts); "trapped" = required runes the drag LEFT in sealed /
    // no-dissolve cells, which is why the demand failed there.
    if (clearTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes });
      const detail = [], unmet = [];
      for (const t of clearTypes) {
        let total = 0, trapped = 0;
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 6; x++) {
            if (sol.board.get(x, y) !== t) continue;
            total++;
            if (sealedCols.includes(x) || (hasFlags && (flagGrid[y][x] & CELL_FLAGS.NO_DISSOLVE) !== 0)) trapped++;
          }
        }
        const cleared = sim.firstClearedByType[t];
        detail.push(`${TYPE_NAMES[t]}:${cleared}/${total}`);
        if (cleared < total) unmet.push(`${TYPE_NAMES[t]} ${total - cleared} left` + (trapped > 0 ? ` (${trapped} stuck in sealed/no-dissolve cells)` : ''));
      }
      console.log('[TOS] CLEAR_ALL=' + detail.join(',') + (unmet.length ? ' MISS' : ' ok'));
      if (unmet.length > 0) {
        console.log(`[TOS] ABORT=clear-all ${unmet.join('; ')} (no touch sent; DoraSolver AND the coverage planner both fell short. Retry with a wider --beam and/or --max-path 90; if a required rune is stuck in a sealed/no-dissolve cell it may be impossible.)`);
        return;
      }
    }

    if (firstWaveNoTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes });
      const hit = firstWaveNoTypes
        .map(t => ({ t, n: sim.firstClearedByType[t] }))
        .filter(o => o.n > 0);
      console.log('[TOS] FIRST_WAVE_NO_RESULT=' + firstWaveNoTypes.map(t => `${TYPE_NAMES[t]}:${sim.firstClearedByType[t]}`).join(',')
        + (hit.length ? ' MISS' : ' ok'));
      if (hit.length > 0) {
        console.log('[TOS] ABORT=first-wave-no ' + hit.map(o => `${TYPE_NAMES[o.t]}=${o.n}`).join(',')
          + ' dissolved in wave 1 (no touch sent; try a wider --beam and/or --max-path)');
        return;
      }
    }

    if (noSolvableTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes });
      const cleared = Array(6).fill(0);
      for (const g of sim.groups) cleared[g.type] += g.cells.length;
      const hit = noSolvableTypes.map(t => ({ t, n: cleared[t] })).filter(o => o.n > 0);
      console.log('[TOS] NO_SOLVABLE_RESULT=' + noSolvableTypes.map(t => `${TYPE_NAMES[t]}:${cleared[t]}`).join(',')
        + (hit.length ? ' MISS' : ' ok'));
      if (hit.length > 0) {
        console.log('[TOS] ABORT=no-solvable ' + hit.map(o => `${TYPE_NAMES[o.t]}=${o.n}`).join(',')
          + ' dissolved despite --no-solvable (no touch sent)');
        return;
      }
    }

    if (minFirstRunes > 0 && (exactRunesMode ? sol.firstRunes !== minFirstRunes : sol.firstRunes < minFirstRunes)) {
      console.log(`[TOS] ABORT=first-runes firstRunes=${sol.firstRunes} required${exactRunesMode ? '=exactly ' : '>='}${minFirstRunes} (no touch sent; try --beam 1600 --max-path 60)`);
      return;
    }
    if (!maxMode && minFirstRunes === 0 && minFirstArg > 0 && missesTarget()) {
      console.log(`[TOS] ABORT=first-combos first=${sol.firstCombos} required=${exactMode ? 'exactly ' : '>='}${minFirstArg} (no touch sent)`);
      return;
    }

    if (dry) { console.log('[TOS] DRY_RUN=1 (no touch sent)'); return; }
    if (process.argv.includes('--confirm')) {
      await askEnter('[TOS] CONFIRM board+path above, press Enter to spin (Ctrl+C aborts)... ');
      // Staleness guard: the game may have moved on (attack animations, wave
      // transition) while waiting at the prompt — spinning a stale plan drags
      // on a board that no longer exists. Re-capture and re-solve on mismatch.
      if (!boardFile) {
        const fresh = readBoardFromScreen();
        const same = fresh.every((row, gy) => row.every((c, gx) => cellLabel(c) === cellLabel(cells[gy][gx])));
        if (!same) {
          console.log('[TOS] BOARD_CHANGED=true (board moved while waiting at confirm) — re-solving');
          round--;
          continue;
        }
      }
    }

    const stepsPerCell = Number(argValue('--steps-per-cell') ?? STEPS_PER_CELL);
    // Speed: --move-ms sets ms per CELL move directly (fine, decimal ok — the
    // game's drop threshold sits at a sharp cell-traversal time, ~205ms on the
    // shock stage, that whole-number --step-ms can't straddle). --step-ms sets
    // per touch-point time (× steps-per-cell = per move). --move-ms wins.
    const moveMsArg = argValue('--move-ms');
    const stepMs = moveMsArg != null ? Number(moveMsArg) / stepsPerCell : Number(argValue('--step-ms') ?? STEP_MS);
    // --drag-from: prepend the card-to-board segment so the WHOLE motion
    // (card -> board -> solved path) is one continuous drag, no lift.
    // Extra turn-dwell applies near electric cells (touching is forbidden)
    // AND hazard cells (touching is fine; dwell here is purely to keep the
    // ACTUAL swap sequence matching the verified-safe planned one, per the
    // hazardDwellCells comment above).
    const dwellCells = [...priorityCells, ...hazardDwellCells];
    const screenPath = dragFromCol !== null
      ? [...cardDragPrefix(dragFromCol, stepsPerCell), ...gridPathToScreenPath(sol.path, stepsPerCell, dwellCells)]
      : gridPathToScreenPath(sol.path, stepsPerCell, dwellCells);
    const dragMs = await executeTouchPath(screenPath, stepMs);
    console.log(`[TOS] SPIN=done points=${screenPath.length} moveMs=${(stepMs * stepsPerCell).toFixed(1)} dragMs=${Math.round(dragMs)} (moveMs excludes corner dwells)`);

    // Effect check: a spin should change the board (matches or at least the
    // drag's swaps). Identical board = input was ignored (dialog, enemy
    // phase, defeat screen) — say so instead of silently moving on.
    if (!boardFile) {
      await sleep(1200);
      const after = readBoardFromScreen();
      const unchanged = after.every((row, gy) => row.every((c, gx) => cellLabel(c) === cellLabel(cells[gy][gx])));
      if (unchanged) console.log('[TOS] NO_EFFECT=true (board identical after spin — input blocked? dialog/enemy phase/defeat screen)');
    }
  }

  if (!dry && !checkOnly && !process.argv.includes('--no-final')) {
    console.log('[TOS] WAIT=post-spin settle (cascades/skyfall/attack animations); pass --no-final to skip this report');
    const fin = await waitForStableBoard(30000, !!argValue('--shock-bases'));
    fin.forEach((row, gy) => {
      console.log('[TOS] FINAL_ROW' + gy + '=' + row.map(cellLabel).join(','));
    });
  }
}

main().catch(e => { console.error('[TOS] ERROR=' + e.message); process.exit(1); });
