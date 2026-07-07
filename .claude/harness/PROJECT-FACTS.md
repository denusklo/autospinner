# PROJECT-FACTS — Verified Project Facts Base

> Rule: every fact is annotated with [verification] = verification method + date. Entries marked `UNVERIFIED` come from historical conversations — the code behavior is trustworthy but the game-side behavior has not been re-tested; design a verification before depending on one.
> Update rules in `04-KNOWLEDGE-PROTOCOL.md` section 3. **Read sections 3 and 4 of this file before writing any code.**

## 1. What This Project Is

Chrome MV3 extension that, on the orb-spinning simulator `https://louisalflame.github.io/TOSwebsite/canvas.html`: reads canvas pixels → recognizes the 5×6 board of runes → solves for the best drag path → auto-spins with synthetic MouseEvents. Single-person project, no build step, no external dependencies, no automated test framework.

## 2. File Map and Responsibilities

See the `CLAUDE.md` file map (single source of truth, not repeated here). Load-order constraint: `manifest.json`'s `content_scripts.js` is `["algorithm.js","content.js"]`; content.js depends on algorithm.js's global classes, and the order must not be reversed. [Verification] read manifest.json:21-27, 2026-07-07

## 3. Game / DOM Hard Facts

| # | Fact | Verification |
|---|---|---|
| F1 | Board is 6 wide × 5 high; coordinates `grid[y][x]` (y before x); `get(x,y)` returns -1 when out of bounds | algorithm.js:7,25-30, 2026-07-07 |
| F2 | Rune type encoding: 0=Water💧 1=Fire🔥 2=Wood🌿 3=Light💡 4=Dark🌙 5=Heart❤️ | algorithm.js:16, content.js:367, 2026-07-07 |
| F3 | Target canvas is `DragCanvas` (matched by id/className), fallback picks the largest area; the page also has a `BarCanvas` | content.js:49-91 (code); the page having two canvases is UNVERIFIED (2025-11 historical observation) |
| F4 | Color signatures (sample 1px at cell center, compare by nearest Euclidean distance): Water(64,193,241) Fire(153,34,0) Wood(34,204,34) Light(136,85,0) Dark(153,0,148) Heart(238,34,136). The Light value was calibrated by live measurement back then | content.js:178-185, 2026-07-07. CONFIRMED misread pair (2026-07-07, real run): **Dark(153,0,148) and Fire(153,34,0) share r=153** — a dimmed Dark rune during the clear animation was read as Fire. Reading the board right after mouseup catches the clear animation; mismatches inside matched groups are animation artifacts, not drag errors (the [TOS] RESULT log separates the two) |
| F5 | Board reading samples only 1 pixel at each cell center (content.js:226-230) → fragile to animation frames, rune dimming, theme changes. On misreads, suspect this first | content.js:210-241, 2026-07-07 |
| F6 | Drag implementation: dispatch mousedown to the canvas → setInterval **16ms** point-by-point mousemove → mouseup; coordinates = `rect.left + point.x` (path points are canvas-relative coordinates) | content.js:399-442, 2026-07-07 |
| F7 | UNVERIFIED (2025-11 historical): cells the drag passes through swap with the held rune; moving "too fast" (skipping cells or too-large event intervals) drops the rune early. The conclusion back then was that smooth step-by-step movement is required |
| F8 | UNVERIFIED (2025-11 historical): after the rune is dropped, 3+ same-color connected runes clear, and runes above fall to fill in (skyfall). Whether algorithm.js's simulation handles post-fall cascades — read MatchFinder/related code to confirm before depending on it |
| F9 | ⚠️ **Encoding conflict**: `docs/autodora-algorithm-spec.md` uses rune encoding `0=Fire, 1=Water` (spec §1), while this project's code uses `0=Water, 1=Fire` (F2) — **Water/Fire are swapped; the other four colors match**. When porting any pseudocode/weight table from the spec, you must perform the encoding conversion, and after converting, verify with a Node comparison on fixed boards. The spec's board-size notation "6×5" does not state the axis orientation; when implementing, re-align to this project's `grid[y][x]`, width 6 height 5 | spec:37-43 vs algorithm.js:16, 2026-07-07 |
| F10 | Known gaps in the spec (read spec §9 before implementing): per-color base weights, attack-type/multi-color bonus, W_EXTRA, maxHurtCount and other constants are **not published** and need tuning. Published hard values: combo bonus ×4, column-clear ×12, puzzle-shield tier table, fire path penalty -50, default maxPath=30 / beamWidth=450 | spec §5-§9, 2026-07-07 |
| F11 | Ported from the spec: `BoardSimulator` (algorithm.js:863, exact forward model: run-scan without double counting + flood fill merging L/T shapes + gravity cascades, no skyfall of new runes) and `DoraSolver` (algorithm.js:983, beam search, unpublished constants gathered in `this.tunable`). The legacy `MatchFinder` **double-counts combos** for runs of 4+ and has no cascade simulation — known defect, kept for regression comparison; **all new code must use BoardSimulator**. DoraSolver defaults to 4 directions; 8 directions (the spec default) has a `moveMode: 8` switch reserved, but whether the simulator accepts diagonal drags = UNVERIFIED; real-browser verification required before enabling | node verify.js actual run 22/22 PASS + fresh-context acceptance PASS, 2026-07-07 |
| F12 | Test-board construction essentials: gravity drops per **column** independently, so for a post-clear cascade you must create new horizontal lines, and the fall distances of the columns must be **different** — use an L-shaped first clear to construct cascades (example in verify.js U3b). Columns falling by equal amounts always restore their original relative positions and can never produce a cascade | verify.js U3b derivation + live test, 2026-07-07 |

## 4. Verification Channels (a weak model's lifeline)

### 4a. Directly Verifiable Under Node (pure logic — prefer this path)

Environment: Node v20.19.6. `algorithm.js` has CommonJS exports: `Board, MatchFinder, PathFinder, RuneSolver, ComboMaximizer, BeamSearchSolver, UnlimitedSolver, BoardSimulator, DoraSolver`. [Verification] actual run, 2026-07-07

**Standard regression command (the concrete form of R2)**: run `node verify.js` in the repo root — 38 checks (simulator unit tests + DoraSolver solution legality + old/new A/B + sealed columns/CELL_FLAGS constraints + minFirstCombos steering + smoke regression); exit 0 = all pass. Must run after changing algorithm.js; when adding behavior, add a matching check to verify.js. [Verification] actual run 38/38 PASS, 2026-07-07

Supplementary smoke test (outputs 1 combo / score 55):

```powershell
node -e "
const {Board, MatchFinder} = require('C:/Projects/autospinner/algorithm.js');
const b = new Board();
b.fromArray([
 [0,0,0,1,2,3],
 [1,2,3,4,5,0],
 [2,3,4,5,0,1],
 [3,4,5,0,1,2],
 [4,5,0,1,2,3]
]);
const mf = new MatchFinder(b);
console.log('score:', JSON.stringify(mf.calculateScore()));
"
```

Usage rules:
- Before changing a solver, run once and record the baseline output; run again after the change and compare (regression protection).
- For A/B comparisons use **fixed** test board arrays (hard-coded in the script), not random boards — a test with non-reproducible output is meaningless.
- Before calling any class, read algorithm.js to confirm method signatures (class/method line overview: Board:6, MatchFinder:79, PathFinder:175, ComboMaximizer:265, BeamSearchSolver:404, UnlimitedSolver:680, RuneSolver:819, BoardSimulator:863, DoraSolver:983).
- Note: the `BeamSearchSolver` constructor defaults to `verbose=true` and spews a lot of log; pass `verbose=false` for batch tests.

### 4b. Verifiable Only in a Real Browser (must go through the [TOS] log contract + User manual testing)

- Whether canvas pixel reading is correct (the real accuracy of F4/F5)
- Whether MouseEvents are accepted by the simulator, drag timing (F6/F7)
- Extension loading / popup / panel UI

Rule: when delivering such changes, you must attach "a ≤3-step verification guide for the User + expected `[TOS]` log output", and explicitly mark the report "not verified in a real browser". See `02-JUDGMENT-MATRIX.md` DoD-2.

### 4c. Not Yet Built (future upgrade direction, see 05-HANDOVER-LETTER)

A fully automated e2e loop: Playwright driving the real simulator page + `--load-extension`. Until it is built, the final acceptor for 4b-type changes is always the User.

## 5. Phone (Android, Real Game) Channel Facts — new subproject `phone/`

Target: the real TOS game (Madhead) on the User's rooted phone, driven over USB adb. Demo account only (User stated, 2026-07-07) — automation violates the game's ToS; never run against a real account.

| # | Fact | Verification |
|---|---|---|
| P1 | Device: Xiaomi Mi 9T Pro (raphael), Android 10 / SDK 29, arm64-v8a, 1080×2340 @440dpi, Magisk root (`su -c id` → uid=0) | adb getprop/wm size actual run, 2026-07-07 |
| P2 | Touch injection: MaaTouch v1.1.0 at `/data/local/tmp/maatouch`; launch `adb shell CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App`; minitouch protocol on stdin; header `^ 10 1080 2340 255` → coords are 1:1 screen px | actual run, 2026-07-07 |
| P3 | Board geometry (this device): 180px cells; column centers x=90+180·gx, row centers y=1330+180·gy | one-cell drag swapped exactly the targeted runes + 30/30 recognition, 2026-07-07 |
| P4 | Capture: `adb shell screencap /sdcard/f.raw` + `adb pull` → RGBA8888, 16-byte header on this device (w,h,fmt,+4); avoids PNG decode entirely. Never redirect adb binary output through PowerShell `>` (LESSONS L7) | actual run w=1080 h=2340 fmt=1, 2026-07-07 |
| P5 | Real-game color signatures (110×110 patch average at cell center): Water(68,146,202) Fire(213,36,16) Wood(30,178,39) Light(194,144,11) Dark(180,33,208) Heart(229,92,168); thorn-overlay variants ≈0.55× dimmed with 36–38% near-black pixels (clean runes 0–7%) — see `phone/autospin.js` SIGNATURES. Rendering is frame-stable (identical values across cells). Also measured: Light+thorn(118,98,52), Water+thorn(70,98,119) ⚠️ only ~60 from Dark+thorn — with one absent the other silently wins, both entries are load-bearing. **Enhanced** (white-sparkle) measured: Water(118,193,239), Fire(246,101,67), Light(241,188,51), Dark(225,77,237). Missing variants (enhanced Wood/Heart) are intentionally ABSENT from SIGNATURES so the unknown-guard refuses and prints measured rgb/dark% — never extrapolate (LESSONS L8) | live sampling + 30/30 matched visual ground truth + **User confirmed via check.html overlay** (this stage/theme), 2026-07-07 |
| P6 | Thorn(black-web) overlay appears only when the User activates a special card function; it marks **sealed columns** (leftmost + rightmost while active): runes there **cannot dissolve but can be dragged/dragged-through**. The state is positional, not per-rune — post-skyfall runes landing in those columns show the overlay too | User stated + observed on 3 screenshots (thorns exclusively in cols 0/5, incl. after skyfall), 2026-07-07 |
| P9 | Board-effect constraint system in `algorithm.js`: `CELL_FLAGS` (exported) = per-cell bitmask grid `flags[y][x]` — NO_DISSOLVE(1) excluded from matching, NO_PICKUP(2) can't be the held rune, NO_SWAP(4) drag can't enter. Flags are POSITIONAL (stay with the cell, matching P6's sealed-column observation). `BoardSimulator.resolve(board, {sealedColumns, flags})` / `DoraSolver({sealedColumns, flags})`; the two compose. `phone/autospin.js` auto-infers sealed columns (≥3 thorned cells in a column; override `--sealed 0,5`/`none`); board-file suffixes `*`=thorn `!`=frozen(2\|4) `x`=no-dissolve(1). Modeling of "sealed cells break runs" is UNVERIFIED against the real game | node verify.js 34/34 PASS (S1-S6), 2026-07-07 |
| P7 | Objective execution check: the in-battle move counter decrements by exactly the number of cell moves executed (499→481 for an 18-move path) — use it to verify a path ran to completion without needing mid-animation screenshots | screenshots before/after spin, 2026-07-07 |
| P8 | Drag dispatch MUST be device-paced: send the whole path as one minitouch script with `w <ms>` waits executed on the phone. PC-side pacing (sleep loops AND deadline scheduling) fails — adb/USB delivers writes in bursts, the game sees clustered jumps, drops the rune after 3-5 moves, and **undelivered events replay later as phantom moves corrupting the P7 counter check**. Device-paced verified EXACT: 29/29 moves @ 80ms/move, 27/27 @ 50ms/move (10 points/cell, 18px steps). Faster than 50ms/move untested. `--step-ms`/`--steps-per-cell` control speed; after ANY speed change re-verify via P7 counter check. Real game HAS skyfall — combo counts on screen will exceed BoardSimulator predictions (F11 models no skyfall); post-spin board comparison is NOT a valid check on this channel | counter screenshots 468→439 (29 moves), 439→412 (27 moves), 2026-07-07 |

Unlike channel 4b, this channel is fully self-verifiable by the model (adb = both eyes and hands); the User is only needed to put the game on a board screen.
