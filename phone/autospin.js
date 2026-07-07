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
 *   node phone/autospin.js --first-min-combos 4  # abort (no touch) unless the plan's
 *                                                # FIRST-wave combos reach 4
 *   node phone/autospin.js --beam 800            # wider beam search (default 200; slower, finds more)
 *   node phone/autospin.js --max-path 40         # longer drag budget (default 30 moves)
 *   node phone/autospin.js --step-ms 10          # interval per touch point (default 16;
 *                                                # deadline-scheduled, accurate to ~1ms)
 *   node phone/autospin.js --steps-per-cell 3    # touch points per cell move (default 5)
 *                                                # ms per move = step-ms x steps-per-cell
 *   node phone/autospin.js --check            # capture + recognize, write phone/check.html
 *                                             # (screenshot with recognition overlaid) — no solve, no touch
 *   node phone/autospin.js --board my.txt     # manual board (skips recognition), then spin
 *   node phone/autospin.js --board my.txt --dry
 *   node phone/autospin.js --sealed 0,5       # force sealed columns; --sealed none disables
 *
 * Board file: 5 lines x 6 tokens (comma/space separated). Tokens: w=Water
 * f=Fire g=Wood(green) l=Light d=Dark h=Heart or digits 0-5. Suffixes
 * (combinable): `*` thorn/sealed-column marker, `!` frozen (cannot pick up or
 * drag through: CELL_FLAGS NO_PICKUP|NO_SWAP), `x` this cell cannot dissolve
 * (CELL_FLAGS NO_DISSOLVE). Example line:  f* l w! gx h h*
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
const { Board, DoraSolver, CELL_FLAGS } = require('../algorithm.js');

const COLS = [90, 270, 450, 630, 810, 990];
const ROWS = [1330, 1510, 1690, 1870, 2050];
const PATCH_HALF = 55, PATCH_STEP = 5;
// Drag timing is paced ON THE DEVICE via minitouch `w` commands (PROJECT-FACTS
// P8, LESSONS L9/L10) — PC-side pacing is unreliable over adb/USB (burst
// delivery drops the rune). Counter-verified exact: 50ms/move (5ms x 10) and
// 80ms/move (8ms x 10). Faster than 50ms/move is UNTESTED.
const MOVE_INTERVAL_MS = 5;  // per touch point, slept on-device
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

function classify(stats) {
  let best = null, bestDist = Infinity;
  for (const sig of SIGNATURES) {
    const d = Math.hypot(stats.rgb[0] - sig.rgb[0], stats.rgb[1] - sig.rgb[1], stats.rgb[2] - sig.rgb[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  // Two independent thorn signals: nearest signature + dark-pixel share (P5).
  // Trust the dark-pixel metric when they disagree.
  const thorn = stats.darkPct > 0.2;
  return { type: best.type, thorn, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
}

function readBoardFromScreen() {
  const img = captureRaw();
  const cells = [];
  for (let gy = 0; gy < 5; gy++) {
    const row = [];
    for (let gx = 0; gx < 6; gx++) row.push(classify(cellStats(img, COLS[gx], ROWS[gy])));
    cells.push(row);
  }
  return cells;
}

/**
 * Capture until the board is fully recognizable AND unchanged between two
 * consecutive captures — protects against reading mid-animation frames
 * (clear/skyfall) and against spinning while a dialog covers the board.
 */
async function waitForStableBoard(timeoutMs = 30000) {
  const t0 = Date.now();
  let prevKey = null, last = null;
  while (Date.now() - t0 < timeoutMs) {
    const cells = readBoardFromScreen();
    last = cells;
    const allKnown = cells.every(row => row.every(c => c.dist <= MAX_SIG_DIST));
    if (allKnown) {
      const key = cells.map(r => r.map(c => c.type + (c.thorn ? '*' : '')).join(',')).join('|');
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
      console.log('[TOS] SETTLE_LAST_ROW' + gy + '=' + row.map(c => TYPE_NAMES[c.type] + (c.thorn ? '*' : '')).join(','));
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
      let core = tok.toLowerCase(), thorn = false, flags = 0;
      while (/[*!x]$/.test(core)) {
        const s = core.slice(-1);
        if (s === '*') thorn = true;
        if (s === '!') flags |= CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
        if (s === 'x') flags |= CELL_FLAGS.NO_DISSOLVE;
        core = core.slice(0, -1);
      }
      const type = /^[0-5]$/.test(core) ? Number(core) : TYPE_LETTERS.indexOf(core);
      if (type === -1) throw new Error(`bad token "${tok}" at (${gx},${gy})`);
      return { type, thorn, flags, dist: 0, rgb: null, darkPct: null };
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

function gridPathToScreenPath(gridPath, stepsPerCell = STEPS_PER_CELL) {
  const centers = gridPath.map(p => ({ x: COLS[p.x], y: ROWS[p.y] }));
  const out = [];
  for (let i = 0; i < centers.length - 1; i++) {
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
 * Device-paced dispatch: the whole drag is sent upfront as one minitouch
 * script with embedded `w <ms>` waits, executed sequentially ON THE PHONE.
 * PC-side pacing (sleep or deadline loops) is unreliable here — stdin over
 * adb/USB delivers writes in bursts, so the game saw clustered jumps and
 * dropped the rune regardless of our local timing accuracy (LESSONS L9).
 */
async function executeTouchPath(screenPath, stepMs = MOVE_INTERVAL_MS) {
  const p = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App'], { stdio: ['pipe', 'pipe', 'inherit'] });
  await sleep(1500); // MaaTouch init
  const script = [`d 0 ${screenPath[0].x} ${screenPath[0].y} 100`, 'c', 'w 100'];
  for (let i = 1; i < screenPath.length; i++) {
    script.push(`m 0 ${screenPath[i].x} ${screenPath[i].y} 100`, 'c', `w ${stepMs}`);
  }
  script.push('u 0', 'c');
  p.stdin.write(script.join('\n') + '\n');
  const nominalMs = 100 + (screenPath.length - 1) * stepMs;
  await sleep(nominalMs + 800); // device executes the script; wait it out
  p.kill();
  return nominalMs;
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
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
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
      : await waitForStableBoard();

    const unknowns = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => {
      if (c.dist > MAX_SIG_DIST) unknowns.push(`(${gx},${gy})d=${c.dist.toFixed(0)}rgb=(${c.rgb})dark=${Math.round(c.darkPct * 100)}%`);
    }));
    cells.forEach((row, gy) => {
      console.log('[TOS] BOARD_ROW' + gy + '=' + row.map(c => TYPE_NAMES[c.type] + (c.thorn ? '*' : '')).join(','));
    });

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
      throw new Error('unrecognized cells, refusing to spin — run --check or supply --board');
    }

    const board = new Board();
    board.fromArray(cells.map(row => row.map(c => c.type)));
    const flagGrid = cells.map(row => row.map(c => c.flags ?? 0));
    const hasFlags = flagGrid.some(row => row.some(v => v !== 0));
    if (hasFlags) console.log('[TOS] CELL_FLAGS_ROWS=' + flagGrid.map(r => r.join('')).join('|'));
    const minFirstArg = Number(argValue('--first-min-combos') ?? 0);
    const solver = new DoraSolver(board, {
      beamWidth: Number(argValue('--beam') ?? 200),
      maxPath: Number(argValue('--max-path') ?? 30),
      sealedColumns: sealedCols,
      flags: hasFlags ? flagGrid : null, minFirstCombos: minFirstArg,
    });
    const t0 = Date.now();
    const sol = solver.solve();
    console.log(`[TOS] SOLVE ms=${Date.now() - t0} start=${sol.startX},${sol.startY} moves=${sol.moves.length} first=${sol.firstCombos} combos=${sol.comboCount} chains=${sol.chains} weight=${sol.score}`);
    console.log('[TOS] PATH=' + sol.path.map(p => `${p.x},${p.y}`).join(' '));

    const minFirstCombos = Number(argValue('--first-min-combos') ?? 0);
    if (minFirstCombos > 0 && sol.firstCombos < minFirstCombos) {
      console.log(`[TOS] ABORT=first-min-combos first=${sol.firstCombos} required=${minFirstCombos} (no touch sent)`);
      return;
    }

    if (dry) { console.log('[TOS] DRY_RUN=1 (no touch sent)'); return; }
    if (process.argv.includes('--confirm')) {
      await askEnter('[TOS] CONFIRM board+path above, press Enter to spin (Ctrl+C aborts)... ');
    }

    const stepsPerCell = Number(argValue('--steps-per-cell') ?? STEPS_PER_CELL);
    const stepMs = Number(argValue('--step-ms') ?? MOVE_INTERVAL_MS);
    const screenPath = gridPathToScreenPath(sol.path, stepsPerCell);
    const dragMs = await executeTouchPath(screenPath, stepMs);
    console.log(`[TOS] SPIN=done points=${screenPath.length} dragMs=${Math.round(dragMs)} msPerMove=${Math.round(dragMs / sol.moves.length)}`);
  }

  if (!dry && !checkOnly && !process.argv.includes('--no-final')) {
    console.log('[TOS] WAIT=post-spin settle (cascades/skyfall/attack animations); pass --no-final to skip this report');
    const fin = await waitForStableBoard();
    fin.forEach((row, gy) => {
      console.log('[TOS] FINAL_ROW' + gy + '=' + row.map(c => TYPE_NAMES[c.type] + (c.thorn ? '*' : '')).join(','));
    });
  }
}

main().catch(e => { console.error('[TOS] ERROR=' + e.message); process.exit(1); });
