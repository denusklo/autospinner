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
 *     For all three: DoraSolver tries first, TargetPlanner constructs the
 *     arrangement if the beam misses, abort only if impossible/unroutable
 *     (no touch sent on abort). --first-min-combos N = legacy alias for N+.
 *   node phone/autospin.js --beam 800            # wider beam search (default 200; slower, finds more)
 *   node phone/autospin.js --max-path 40         # longer drag budget (default 30 moves)
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
 *   node phone/autospin.js --sealed 0,5       # force sealed columns; --sealed none disables
 *   node phone/autospin.js --shock-bases l    # set electric-rune base element(s) when the
 *                                             # bright glow defeats auto-detection: one letter
 *                                             # for all, or a comma list mapping to the
 *                                             # ELECTRIC_CELLS row-major order (e.g. w,l,d)
 *
 * Board file: 5 lines x 6 tokens (comma/space separated). Tokens: w=Water
 * f=Fire g=Wood(green) l=Light d=Dark h=Heart or digits 0-5. Suffixes
 * (combinable): `*` thorn/sealed-column marker, `!` frozen (cannot pick up or
 * drag through: CELL_FLAGS NO_PICKUP|NO_SWAP), `x` this cell cannot dissolve
 * (CELL_FLAGS NO_DISSOLVE), `^` electric (P11: interrupts the drag if touched
 * or passed through, still dissolves with its base element, and clearing it
 * first-wave gets a big solver bonus — token g^ = electric Wood).
 * Example line:  f* l w! g^ h h*
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
const { Board, DoraSolver, TargetPlanner, solveMaxFirstCombos, CELL_FLAGS } = require('../algorithm.js');

const COLS = [90, 270, 450, 630, 810, 990];
const ROWS = [1330, 1510, 1690, 1870, 2050];
const PATCH_HALF = 55, PATCH_STEP = 5;
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
  { type: 0, thorn: true, rgb: [70, 98, 119] },    // Water + thorn
  { type: 1, thorn: true, rgb: [129, 61, 53] },    // Fire + thorn
  { type: 2, thorn: true, rgb: [59, 116, 62] },    // Wood + thorn
  { type: 3, thorn: true, rgb: [118, 98, 52] },    // Light + thorn
  { type: 4, thorn: true, rgb: [115, 58, 124] },   // Dark + thorn
  { type: 5, thorn: true, rgb: [140, 79, 113] },   // Heart + thorn
];
const MAX_SIG_DIST = 60;
const TYPE_NAMES = ['Water', 'Fire', 'Wood', 'Light', 'Dark', 'Heart'];
const TYPE_LETTERS = ['w', 'f', 'g', 'l', 'd', 'h'];
const TYPE_CSS = ['#44a0e0', '#e03020', '#30c040', '#d0a020', '#a040d0', '#e060a0'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cellLabel = c => (c.unknownBase ? 'Shock?' : TYPE_NAMES[c.type] + (c.electric ? '^' : '')) + (c.thorn ? '*' : '');

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

function cellStats(img, cx, cy) {
  let r = 0, g = 0, b = 0, n = 0, dark = 0;
  for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy += PATCH_STEP) {
    for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx += PATCH_STEP) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const pr = img.buf[i], pg = img.buf[i + 1], pb = img.buf[i + 2];
      r += pr; g += pg; b += pb; n++;
      if (pr + pg + pb < 120) dark++;
    }
  }
  return { rgb: [r / n, g / n, b / n], darkPct: dark / n };
}

// Electric glow rule (P11): arcs push at least TWO channels near-white —
// cyan arcs (wood/water base): g+b high, dims to (98,233,218); magenta arcs
// (dark base): r+b high, g swings 135-207. Enhanced runes light up only ONE
// channel pair partially (enhanced dark (225,77,237) is the near-miss — it
// passes this candidate rule and is rejected later by the flicker test:
// electric cells swing up to ~60/frame, all normal runes are frame-stable).
const isElectricGlow = rgb => ((rgb[0] > 210 ? 1 : 0) + (rgb[1] > 210 ? 1 : 0) + (rgb[2] > 205 ? 1 : 0)) >= 2;

function classify(stats) {
  // Electric runes (P11): near-white cyan, flickering arcs. Interrupt the
  // spin when touched or passed through. NOTE: single-frame whiteness can be
  // a GHOST (arc flare bleeding from a neighboring shock) — final electric
  // status requires persistence across frames (readBoardFromScreen).
  if (isElectricGlow(stats.rgb)) {
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
  return { type: best.type, thorn, electric: best.electric ?? false, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
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

function readBoardFromScreen() {
  const img = captureRaw();
  const cells = [];
  let anyCandidate = false;
  for (let gy = 0; gy < 5; gy++) {
    const row = [];
    for (let gx = 0; gx < 6; gx++) {
      const c = classify(cellStats(img, COLS[gx], ROWS[gy]));
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
        const meanMin = Math.min(...[0, 1, 2].map(ch => statsPerFrame.reduce((s, f) => s + f.rgb[ch], 0) / statsPerFrame.length));
        // Electric = persistent glow + flicker (or all channels lifted, which
        // no enhanced rune shows). Frame-stable glowless cells are normal.
        if (candFrames >= 2 && (maxDelta > 25 || meanMin > 90)) {
          const c = { type: 0, thorn: false, electric: true, dist: 0, rgb: statsPerFrame[0].rgb.map(Math.round), darkPct: statsPerFrame[0].darkPct };
          const base = electricBase(imgs, COLS[gx], ROWS[gy]);
          if (base === -1) { c.dist = 999; c.unknownBase = true; } // refuse loudly
          else c.type = base;
          cells[gy][gx] = c;
        } else {
          // not electric: classify from the least-white frame to dodge flares
          const s = statsPerFrame.reduce((a, b) =>
            Math.min(a.rgb[1], a.rgb[2]) <= Math.min(b.rgb[1], b.rgb[2]) ? a : b);
          const c = classify(s);
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
      c.dist <= MAX_SIG_DIST || (allowUnknownShocks && c.electric && c.unknownBase)));
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
      if (c.dist > MAX_SIG_DIST) unk.push(`(${gx},${gy})d=${c.dist.toFixed(0)}rgb=(${c.rgb})dark=${Math.round(c.darkPct * 100)}%`);
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
      let core = tok.toLowerCase(), thorn = false, electric = false, flags = 0;
      while (/[*!x^]$/.test(core)) {
        const s = core.slice(-1);
        if (s === '*') thorn = true;
        if (s === '!') flags |= CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
        if (s === 'x') flags |= CELL_FLAGS.NO_DISSOLVE;
        if (s === '^') electric = true;
        core = core.slice(0, -1);
      }
      const type = /^[0-5]$/.test(core) ? Number(core) : TYPE_LETTERS.indexOf(core);
      if (type === -1) throw new Error(`bad token "${tok}" at (${gx},${gy})`);
      return { type, thorn, electric, flags, dist: 0, rgb: null, darkPct: null };
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
 * cuts corners diagonally through cells the finger never visits — through a
 * shock cell that's an instant interrupt (P11). So dwell (hold position) at
 * every turn, and longer when the cell neighbors a shock, letting the
 * trailing rune settle into the cell before the direction changes.
 */
function gridPathToScreenPath(gridPath, stepsPerCell = STEPS_PER_CELL, electricCells = []) {
  const centers = gridPath.map(p => ({ x: COLS[p.x], y: ROWS[p.y] }));
  const nearElectric = p => electricCells.some(e => Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1);
  const out = [];
  for (let i = 0; i < centers.length - 1; i++) {
    let dwell = 0;
    if (i > 0) {
      const turned = (centers[i].x - centers[i - 1].x) !== (centers[i + 1].x - centers[i].x)
        || (centers[i].y - centers[i - 1].y) !== (centers[i + 1].y - centers[i].y);
      if (turned) dwell = 4;
      if (nearElectric(gridPath[i])) dwell = Math.max(dwell, 8);
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
      const suspect = c.dist > MAX_SIG_DIST;
      const left = (COLS[gx] - 90) * SCALE, top = (ROWS[gy] - 90) * SCALE, size = 180 * SCALE;
      overlays += `<div class="cell${suspect ? ' suspect' : ''}" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;border-color:${TYPE_CSS[c.type]}">` +
        `<span style="background:${TYPE_CSS[c.type]}">${TYPE_NAMES[c.type]}${c.thorn ? '*' : ''}</span>` +
        `<small>d=${c.dist.toFixed(0)}</small></div>`;
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

function askEnter(msg) {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => { rl.close(); resolve(); });
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
      : (checkOnly || dry) ? readBoardFromScreen()
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
      if (c.dist > MAX_SIG_DIST) unknowns.push(`(${gx},${gy})d=${c.dist.toFixed(0)}rgb=(${c.rgb})dark=${Math.round(c.darkPct * 100)}%`);
    }));
    cells.forEach((row, gy) => {
      console.log('[TOS] BOARD_ROW' + gy + '=' + row.map(cellLabel).join(','));
    });
    const elecList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.electric) elecList.push(`${gx},${gy}`); }));
    if (elecList.length) console.log('[TOS] ELECTRIC_CELLS=' + elecList.join(' ') + ' (row-major; --shock-bases maps in this order)');

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
    board.fromArray(cells.map(row => row.map(c => c.type)));
    // Electric runes (P11): cannot be picked up or dragged through (interrupt
    // the spin) but DO dissolve with their base element — and clearing them is
    // top priority (they block attacking until dissolved).
    const priorityCells = [];
    const flagGrid = cells.map((row, gy) => row.map((c, gx) => {
      let f = c.flags ?? 0;
      if (c.electric) {
        f |= CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
        priorityCells.push({ x: gx, y: gy });
      }
      return f;
    }));
    const hasFlags = flagGrid.some(row => row.some(v => v !== 0));
    if (hasFlags) console.log('[TOS] CELL_FLAGS_ROWS=' + flagGrid.map(r => r.join('')).join('|'));

    // --start / --end pin the drag's begin/end cell (col,row). Orthogonal to
    // every other knob (sealed columns, first-combos/-runes, priority) — they
    // just restrict the beam's seed cells and which states may be the answer.
    const startCell = argCell('--start');
    const endCell = argCell('--end');
    if (startCell && (flagGrid[startCell.y][startCell.x] & (CELL_FLAGS.NO_PICKUP))) {
      console.log(`[TOS] ABORT=start-unpickable start=${startCell.x},${startCell.y} is electric/frozen (NO_PICKUP) — the game can't lift it; pick another --start (no touch sent)`);
      return;
    }
    const startCells = startCell ? [startCell] : null;
    if (startCell || endCell) {
      console.log(`[TOS] PIN=start:${startCell ? `${startCell.x},${startCell.y}` : 'any'} end:${endCell ? `${endCell.x},${endCell.y}` : 'any'}`);
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
    const t0 = Date.now();
    let sol, engine;

    if (minFirstRunes > 0) {
      sol = new DoraSolver(board, {
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        sealedColumns: sealedCols,
        flags: hasFlags ? flagGrid : null, priorityCells,
        minFirstRunes, exactFirstRunes: exactRunesMode,
        startCells, endCell,
      }).solve();
      engine = `DoraSolver(firstRunes${exactRunesMode ? '==' : '>='}${minFirstRunes})`;
    } else if (maxMode) {
      // Find the highest achievable first-wave count (bound -> planner -> baseline)
      const res = solveMaxFirstCombos(board, {
        sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, priorityCells,
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        plannerBeamWidth: Math.max(300, Number(argValue('--beam') ?? 0)),
        plannerMaxPath: Math.max(60, Number(argValue('--max-path') ?? 0)),
        startCells, endCell,
      });
      sol = res.solution;
      engine = `MaxFirstCombos(achieved=${res.achieved}/bound=${res.bound})`;
    } else {
      sol = new DoraSolver(board, {
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        sealedColumns: sealedCols,
        flags: hasFlags ? flagGrid : null, priorityCells,
        minFirstCombos: minFirstArg, exactFirstCombos: exactMode,
        startCells, endCell,
      }).solve();
      engine = 'DoraSolver';
    }

    const missesTarget = () => exactMode ? sol.firstCombos !== minFirstArg : sol.firstCombos < minFirstArg;

    // Guarantee escalation: if the beam search misses the first-combo target,
    // the two-phase planner either constructs it or proves it impossible.
    if (!maxMode && minFirstRunes === 0 && minFirstArg > 0 && missesTarget()) {
      const plannerBeam = Math.max(300, Number(argValue('--beam') ?? 0));
      const plannerMaxPath = Math.max(60, Number(argValue('--max-path') ?? 0));
      const planner = new TargetPlanner(board, {
        sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null,
        minFirstCombos: minFirstArg, exact: exactMode,
        beamWidth: plannerBeam, maxPath: plannerMaxPath,
        startCells, endCell,
      });
      const planned = planner.solve();
      if (planned.solution) {
        sol = planned.solution;
        engine = `TargetPlanner(target#${planned.targetsTried})`;
      } else {
        console.log('[TOS] PLANNER=failed reason=' + planned.reason + (planned.reason === 'routing-failed'
          ? ` (targets exist; tried beam=${plannerBeam} maxPath=${plannerMaxPath} targets=${planned.targetsTried}; retry with --beam ${plannerBeam * 2} and/or --max-path ${plannerMaxPath + 30})`
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
    const screenPath = gridPathToScreenPath(sol.path, stepsPerCell, priorityCells);
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
