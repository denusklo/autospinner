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
 *
 *   Repeated-grinding loop (cmd.exe, NOT PowerShell/bash — %i needs doubling
 *   to %%i inside a .bat file): runs the command 10 times in sequence (1
 *   through 10 inclusive), continuing to the next iteration even if a run
 *   fails/aborts (unlike --rounds, which is one in-process run that stops the
 *   whole batch on an unhandled error). Each iteration is a fresh process, so
 *   a crash/ABORT/stuck board on one iteration doesn't take down the rest —
 *   preferred over --rounds for long unattended sessions for that reason.
 * 
 *     for /L %i in (1,1,10) do node phone/autospin.js --beam 6400 --max-path 120 --no-final --move-ms 60 --fire-route
 * 
 *   Flags used here: --beam/--max-path widen the search for harder boards;
 *   --no-final skips the post-spin settle report (faster loop, since the next
 *   iteration's own board capture re-confirms state anyway); --move-ms 60 is
 *   a faster per-cell drag speed than the 240ms default (raise if runes start
 *   dropping — see PROJECT-FACTS P8/P18); --fire-route applies the AutoDora
 *   fire-trail constraint (P15) — drop it if the current stage doesn't have
 *   that mechanic. Swap in whatever flags the current stage needs; the outer
 *   `for /L` loop structure is what's reusable.
 *   node phone/autospin.js --dry              # everything except the touch
 *   node phone/autospin.js --confirm          # print recognized board + path, then
 *                                             # wait for Enter before actually spinning.
 *                                             # By default, re-captures the board on
 *                                             # Enter and re-solves if it changed while
 *                                             # you were reading (BOARD_CHANGED=true) —
 *                                             # add --no-stale-check to skip that re-check
 *                                             # and just spin the originally solved plan
 *                                             # (useful if it keeps false-positiving on a
 *                                             # busy/animated board and you already know
 *                                             # nothing really moved).
 *   node phone/autospin.js --first-combos 4      # EXACTLY 4 first-wave combos (combo-shield
 *                                                # mode; overshoot rejected too)
 *   node phone/autospin.js --first-combos 7+     # at least 7 first-wave combos
 *   node phone/autospin.js --first-combos max    # highest achievable (never aborts)
 *   node phone/autospin.js --first-attr-combos 6 # EXACTLY 6 first-wave ATTRIBUTE combos
 *                                                # (首消N屬: non-Heart groups; repeats of one
 *                                                # attribute count; Heart groups allowed but
 *                                                # not counted). 6+ = at least 6. No max mode.
 *   node phone/autospin.js --convert wood:5      # touch-conversion card skill: the first 5
 *                                                # runes the finger TOUCHES while dragging
 *                                                # (not the picked-up rune, which always keeps
 *                                                # its own type) turn into Wood as touched.
 *                                                # --convert water:max converts the whole path.
 *   node phone/autospin.js --want-group water:5  # BEST-EFFORT (never aborts): want a match
 *                                                # group of EXACTLY 5 Water cells somewhere
 *                                                # across ANY cascade wave, not just wave 1.
 *   node phone/autospin.js --rearrange            # 排珠: several SEPARATE drags, no dissolve
 *                                                # until the stage timer expires (User-
 *                                                # confirmed: unlimited drags, no gravity
 *                                                # between releases, full cascade at time-up).
 *                                                # Composes with --clear-all/--want-group/
 *                                                # --first-combos/etc (same demand semantics,
 *                                                # solved via best PERMUTATION not a drag
 *                                                # path). Incompatible with --start/--end/
 *                                                # --fire-route/--drag-from (no single-path
 *                                                # meaning). --rearrange-beam N / --rearrange-
 *                                                # steps N tune quality vs time (default
 *                                                # 60/40, per movable component).
 *                                                # --rearrange-pause-ms N sets the gap
 *                                                # between one drag's release and the next
 *                                                # drag's touch-down (default 350, raised
 *                                                # from 150 after a live failure: fast
 *                                                # --move-ms + many chained drags let
 *                                                # consecutive drags bleed into each other,
 *                                                # so the real board diverged from the
 *                                                # simulated BOARD_AFTER_ROW* starting
 *                                                # partway through the sequence — this gap
 *                                                # is what to raise, NOT --move-ms, since it
 *                                                # is the recognition gap BETWEEN drags, not
 *                                                # the speed WITHIN one. Live-confirmed
 *                                                # working (2026-07-11/12, User's device) at
 *                                                # both --move-ms 100 and --move-ms 80 paired
 *                                                # with --rearrange-pause-ms 50 (well below
 *                                                # the 350 default) — full 22-drag
 *                                                # rearrangement, real board matched
 *                                                # BOARD_AFTER_ROW* exactly both times:
 *                                                #   node phone/autospin.js --rearrange
 *                                                #     --convert wood:max --first-runes 30
 *                                                #     --confirm --rearrange-beam 160
 *                                                #     --rearrange-steps 60
 *                                                #     --rearrange-conversion-candidates 200
 *                                                #     --move-ms 80 --rearrange-pause-ms 50
 *                                                #     --screenshot-after-spin --no-final
 *   node phone/autospin.js --rearrange --convert wood:max
 *                                                # --convert composes with --rearrange
 *                                                # (User-confirmed): ONLY the FIRST physical
 *                                                # drag converts its touched cells (the
 *                                                # picked-up rune still never converts);
 *                                                # count may be a number or max/all.
 *   node phone/autospin.js --rearrange --first-runes 30
 *                                                # dissolve the WHOLE board in wave 1. If
 *                                                # RearrangeSolver's swap-beam misses,
 *                                                # RearrangeCoveragePlanner (P52) escalates
 *                                                # automatically — it TILES the movable
 *                                                # region directly (no routing needed, unlike
 *                                                # single-drag mode: any constructed
 *                                                # permutation is exactly realizable). Also
 *                                                # escalates for --clear-all/--first-wave-have/
 *                                                # --first-combos/--first-attr-combos misses
 *                                                # under --rearrange. --rearrange-coverage-
 *                                                # attempts N raises its search budget
 *                                                # (default 300000) for stubborn boards; a MISS
 *                                                # is a search-budget report, NOT proof the
 *                                                # target is impossible.
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
 *   node phone/autospin.js --first-wave-have=w,g # first wave must dissolve AT LEAST
 *                                                # ONE Water AND at least one Wood rune
 *                                                # (does NOT need to clear ALL of a
 *                                                # type — that's --clear-all). "all" =
 *                                                # require all 6 types (very likely
 *                                                # infeasible most rounds — expected).
 *                                                # If a listed type has too few on the
 *                                                # board to ever form a group this round
 *                                                # (<3, or <2 for a 2-match type), prints
 *                                                # FIRST_WAVE_HAVE_INFEASIBLE and asks
 *                                                # [y/N] to drop it and continue with the
 *                                                # rest (--force-partial-first-wave-have
 *                                                # skips the prompt). When a type IS
 *                                                # dropped, the remaining achievable
 *                                                # type(s) get a RESERVE FLOOR: this wave
 *                                                # may not drain them below their own
 *                                                # min-run (3, or 2 for 2-match) worth,
 *                                                # so a future spin can still pair them
 *                                                # once the dropped type is replenished
 *                                                # by skyfall. If DoraSolver's beam can't
 *                                                # find all listed types at once (a much
 *                                                # tighter target than 1-2 types — a real
 *                                                # local optimum, not a bug), TargetPlanner
 *                                                # CONSTRUCTS coverage the same way it does
 *                                                # for --clear-all (one small group per type,
 *                                                # not full clearance). Live example (P33):
 *                                                # --first-wave-have=w,g,f,l,d (5 types,
 *                                                # sealed cols 0/5) only got 2/5 via
 *                                                # DoraSolver alone at --beam 6400; the
 *                                                # TargetPlanner construction fix solved
 *                                                # all 5 in ~11.6s (combos=6).
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
 *                                             # Repeat --end to allow MULTIPLE end cells
 *                                             # (--end 5,1 --end 0,4): the rune may land
 *                                             # on ANY of them, and the solver picks
 *                                             # whichever gives the best combo outcome.
 *                                             # If no end can be reached within
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
 *   node phone/autospin.js --after-spin-kill  # ignores every other flag/solver: after recognizing
 *                                             # the board, moves ONE cell into any free neighbor,
 *                                             # holds (never sends the release), screenshots it
 *                                             # (phone/screenshots/<timestamp>_mid-hold.png), then
 *                                             # force-stops the game while still held, restarts,
 *                                             # taps through the resulting "戰鬥尚未結束" resume
 *                                             # dialog (Continue), and waits for the board to
 *                                             # settle again (2nd screenshot: ..._post-continue.png).
 *                                             # Verified live: the board comes back byte-for-byte
 *                                             # identical to right before the move — nothing is
 *                                             # ever committed, so this is a safe repeatable probe
 *                                             # for "does the kill/restart/resume cycle still work"
 *                                             # on a real account, independent of solving. Composes
 *                                             # with --rounds (each round re-probes after reverting).
 *   node phone/autospin.js --screenshot-after-spin  # after the spin's drag(s) finish (works for
 *                                             # both normal single-drag mode and --rearrange's
 *                                             # multi-drag mode), saves a screenshot to
 *                                             # phone/screenshots/<timestamp>_after-spin.png. Off
 *                                             # by default (no option — plain on/off flag).
 *
 * Shield overlay (`+` suffix, live 2026-07-10): per-rune status — cannot
 * dissolve even at a match of 3+, but CAN be picked up and dragged/passed
 * through freely, and the shield TRAVELS WITH THE RUNE when dragged (User-
 * confirmed) — NOT positional like sealed columns. Modeled the same way as
 * the FROZEN ice mechanic (P16): the solver board gets the per-rune FROZEN
 * value at that cell (never matches, moves/falls normally), while the
 * display label keeps the real element (`Wood+`). Auto-detected via a
 * dedicated signature; only confirmed on Wood so far — other elements are
 * unmeasured (unknown-guard refuses).
 *
 * Hurricane zone (`Hurricane` label, live 2026-07-10): an opaque positional
 * column effect. Its hidden runes cannot dissolve, be picked up, touched,
 * entered, or passed through. Auto-detected from the neutral-gray cyclone
 * texture and modeled with NO_DISSOLVE|NO_PICKUP|NO_SWAP on every zone cell.
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
const { Board, BoardSimulator, DoraSolver, TargetPlanner, RearrangeSolver, RearrangeCoveragePlanner, decomposeRearrangement, solveRearrangeConvertAware, CELL_FLAGS, FROZEN, SHIELD_BASE, CURSE_BASE } = require('../algorithm.js');
const { solveDoraParallel, solveClearAllParallel, solveHaveParallel, solveMaxFirstCombosParallel, solveRearrangeConvertAwareParallel, defaultWorkers } = require('./parallel.js');

const COLS = [90, 270, 450, 630, 810, 990];
const ROWS = [1330, 1510, 1690, 1870, 2050];
const PATCH_HALF = 55, PATCH_STEP = 5;

// --after-spin-kill (2026-07-10): kill+restart+resume trick, verified live.
// Real TOS package/activity (this device): force-stopping mid-battle and
// relaunching shows a "戰鬥尚未結束" (battle not ended) resume dialog;
// tapping Continue reloads the board at its last checkpoint. Verified this
// checkpoint is BEFORE an in-flight, never-released drag: touch-down + move
// without ever sending the MaaTouch release, then force-stop while still
// held, reverted to a byte-for-byte identical board (same HP/CD/currency) —
// so the safe way to use this trick is to hold, never release, then kill.
const TOS_PKG = 'com.madhead.tos.zh';
const TOS_ACTIVITY = 'com.unity3d.player.UnityPlayerActivity';
// Continue-button tap point, as a FRACTION of screen size (measured live on
// this 1080x2340 device at (339,1375) — resolution-independent so it survives
// a different device/DPI). Scaled against a live `adb shell wm size` read.
const CONTINUE_BUTTON_FRAC = { x: 0.314, y: 0.588 };
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

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
  // DISABLED 2026-07-10 (L51, PROJECT-FACTS P45): unlike every other
  // calibration this session, these 3 had no "User-confirmed at (x,y)"
  // citation — just a bare "live 2026-07-10" comment. A live board's plain
  // Water cell (5,0) matched Iced Water by a WIDE, confident margin (dist
  // 23.9 vs 51.2+ to any real Water variant — not a narrow tiebreak like the
  // Dark/Heart pair), and the User confirmed they have never actually seen a
  // genuine iced-then-frozen rune. Same root cause as L37 (frozen entries
  // mislabeled at capture time): kept `disabled:true` with the historical
  // rgb so a future GENUINELY confirmed sighting (one that later turns into
  // a frozen shell, closing the loop end to end) can be compared and
  // re-enabled, rather than losing the data and recalibrating from zero.
  { type: 4, thorn: false, iced: true, disabled: true, rgb: [168, 110, 225] }, // Iced Dark, live 2026-07-10 — UNCONFIRMED, see disable note above
  { type: 5, thorn: false, iced: true, disabled: true, rgb: [190, 140, 206] }, // Iced Heart, live 2026-07-10 — UNCONFIRMED, see disable note above
  { type: 0, thorn: false, iced: true, disabled: true, rgb: [115, 162, 217] }, // Iced Water, live 2026-07-10 — UNCONFIRMED, see disable note above
  // Dim plain-Water variant (live 2026-07-10, User-confirmed, L51): after
  // disabling the unconfirmed Iced-Water entry above, this same cell's
  // NEXT-nearest match was the disabled-adjacent-but-still-ENABLED "Frozen
  // Fire shell round 1" signature (176,171,210, P16, dist 49.3, well under
  // MAX_SIG_DIST) — worse than iced (would have blocked a normal Water from
  // dissolving at all). The cell genuinely renders dimmer than the
  // enhanced-Water cluster on this board (r+10/g-24/b-28 vs (118,193,239))
  // by a wide, uniform margin, frame-stable across 8 captures — not
  // animation flicker. No structural cause found (not a thorn/corner/edge
  // positional effect: sibling row-0/col-5 cells read normally). Adding the
  // measured value directly as a 3rd plain-Water reference point, same
  // per-instance-variance pattern as L27/L47/L50.
  { type: 0, thorn: false, rgb: [128.7, 164.8, 197.6] }, // Water (dim variant)
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
  // SOFT-DISABLED 2026-07-10 (live User report, LESSONS L37), NOT deleted —
  // `disabled:true` makes classify() skip these as match candidates while
  // keeping the historical rgb/comment, so a future genuine sighting can be
  // compared against them (and re-enabled by removing the flag) instead of
  // starting calibration from zero. Both "2 rounds left" entries below sat
  // closer, by raw-RGB distance, to User-confirmed plain thorn-Water AND
  // plain thorn-Heart cells (on a board with NO frost active at all,
  // User-confirmed) than those cells' own correct signatures — misreading 6
  // live cells as "Fire#" (frozen). `classify()` searches ALL signatures
  // regardless of the cell's own detected thorn state, so even the
  // thorn:false entry was reachable for a thorn-darkened cell. Colliding with
  // two DIFFERENT unrelated confirmed types is strong evidence both samples
  // were themselves mislabeled plain thorn cells, not real frozen
  // calibrations — re-verify with the User (not just visual impression, L8)
  // before re-enabling either.
  { type: 1, thorn: false, frozen: true, disabled: true, rgb: [178, 112, 123] }, // Frozen Fire shell, 2 rounds left, brighter crystal, live 2026-07-10
  { type: 1, thorn: true, frozen: true, disabled: true, rgb: [114, 112, 130] },  // Frozen + thorn/fence overlay, live 2026-07-09
  { type: 1, thorn: true, frozen: true, rgb: [115, 90, 95] },         // Frozen Fire + thorn/fence overlay, 2 rounds left, live 2026-07-10 — NOT shown to collide on today's board (dist ~47-55 from all 6 disputed cells) so left enabled, but shares the same suspect "2 rounds left" provenance and was never independently User-confirmed as frozen; treat a future match with suspicion
  { type: 0, thorn: true, rgb: [70, 98, 119] },    // Water + thorn
  { type: 1, thorn: true, rgb: [129, 61, 53] },    // Fire + thorn
  { type: 2, thorn: true, rgb: [59, 116, 62] },    // Wood + thorn
  { type: 3, thorn: true, rgb: [118, 98, 52] },    // Light + thorn
  { type: 4, thorn: true, rgb: [115, 58, 124] },   // Dark + thorn
  { type: 5, thorn: true, rgb: [140, 79, 113] },   // Heart + thorn
  // SHIELD overlay (new mechanic, live 2026-07-10, User-stated): a per-cell
  // status — cannot dissolve even at a match of 3+, but CAN be picked up and
  // dragged/passed through freely. Structurally identical to the existing
  // sealed/fence NO_DISSOLVE semantics (P6/P9), just positional-per-rune
  // instead of whole-column, and confirmed a HARD engine-level block (unlike
  // the fire-hazard's post-hoc rejection, P23/L34) — reuses CELL_FLAGS
  // NO_DISSOLVE directly, no new solver semantics needed. Visually: a pale
  // translucent shield-shaped border + white shamrock watermark over the
  // base rune; NOT a darkening overlay (measured dark%~1, vs thorn's >20%) so
  // it doesn't interact with thorn detection. Whole-cell average is stable
  // and consistent across 3 live cells (101,190,113)/(102,190,113) — a clean
  // ~104-unit distance from plain Wood, well past MAX_SIG_DIST, so it needs
  // its own signature entry rather than being recovered via chromaticity.
  // Only confirmed on Wood so far — shield on other elements is UNMEASURED
  // (unknown-guard will refuse and print rgb per L8, same as every other
  // unmeasured variant in this table).
  { type: 2, thorn: false, shield: true, rgb: [101, 190, 113] }, // Wood + shield
  // Shield + thorn/fence combo (live 2026-07-10, User-confirmed at (5,1)/
  // (5,2), both in the sealed edge column): the plain-shield signature above
  // was ~71 units away (past MAX_SIG_DIST) once thorn-darkened, and the
  // nearest OTHER match was Water+thorn at dist 40.3 — close enough to be
  // silently accepted as Water rather than refused. Two live samples
  // (88,123,93)/(87,123,93) agree tightly, consistent with thorn darkening
  // the plain-shield rgb by roughly the same ratio seen on other types.
  { type: 2, thorn: true, shield: true, rgb: [88, 123, 93] }, // Wood + shield + thorn
  // Shielded Dark (live 2026-07-10, User-confirmed on 9 cells, L47). Two
  // distinct plain clusters on the same board (per-instance brightness
  // variance, same phenomenon as L27's card badges), both dark%~0 like all
  // shield variants. Without these entries the cells silently matched the
  // ICED signatures (Dark~/Heart~) — wrong element AND wrong solver
  // semantics. The thorn variant sits only ~20 raw units from live thorn-
  // Heart cells — disambiguated by the r-b family discriminator in
  // classify(), not by raw distance alone.
  { type: 4, shield: true, rgb: [185, 112, 207] },             // Dark + shield (cluster A)
  { type: 4, shield: true, rgb: [215, 151, 230] },             // Dark + shield (cluster B, brighter)
  { type: 4, thorn: true, shield: true, rgb: [133, 114, 140] }, // Dark + shield + thorn
  // Bright-drifted thorn palette (live 2026-07-10, L47): this stage renders
  // thorn cells ~38 units brighter than the original thorn calibration —
  // live confirmed Water*/Heart* cells sat dist 38.9 from their own
  // signatures, close enough that the shield-Dark+thorn point above stole a
  // real Water* cell by <1 unit. Second calibration points at the drifted
  // values restore confident raw matches (the original points stay for the
  // original stage/lighting).
  { type: 0, thorn: true, rgb: [96, 121, 137] },   // Water + thorn (bright stage)
  { type: 5, thorn: true, rgb: [143, 116, 123] },  // Heart + thorn (bright stage)
  // Bright plain Wood+thorn (live 2026-07-10, User-confirmed, L50): a plain
  // thorn-Wood cell measured (78,103,78) while its SIBLING on the same board
  // measured (64,113,65) (spot-on the original Wood* signature) — per-
  // instance brightness variance (L27 phenomenon), NOT a uniform stage
  // drift. The bright instance sat 27.1 from Wood+shield+thorn vs 28.4 from
  // plain Wood* — misread as shielded by 1.3 units. Whitish-pixel-fraction
  // was probed as a shield discriminator and does NOT separate (plain
  // Hearts overlap non-thorn shields); the signature point is the fix.
  { type: 2, thorn: true, rgb: [78, 103, 78] },    // Wood + thorn (bright instance)
  // Shielded Heart (live 2026-07-12, User-confirmed on 3 cells — (4,0)/(4,1)/
  // (5,1) — all measuring an identical (218,140,189), r-b=+29, cleanly in the
  // Heart-family direction per the r-b discriminator above). No Heart+shield
  // entry existed yet, so nearest-match fell through to the closest available
  // shield signature (Dark+shield cluster B, dist 42.6) — silently wrong
  // element. This point sits far enough from both Dark+shield clusters
  // (dist 42.6/46.9) that the existing r-b family discriminator (scoped to
  // thorn cells only) isn't needed here; these are plain non-thorn shields.
  { type: 5, shield: true, rgb: [218, 140, 189] }, // Heart + shield
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
// Dark was. Fire/Light added 2026-07-11 (User swapped in Fire/Light cards):
// live-sampled, stable across 2 captures, icon shape confirms (flame / gold
// cross matching the board Light rune's own shape). Heart is still UNMEASURED
// — the unknown-guard below refuses and prints the measured rgb to add it.
// IMPORTANT (found while adding Fire/Light): Light's rgb sits only 73-76
// units from BOTH Wood entries below — under the old Wood-only table this
// would have silently misclassified as Wood (MAX_CARD_SIG_DIST=90). Adding
// the real Light entry fixes it (exact match, dist=0), but it means this
// table has little headroom left — if a future card badge classifies as Wood
// unexpectedly, re-measure it rather than trusting the nearest-match blindly.
const CARD_SIGNATURES = [
  { type: 4, rgb: [219.7, 141.1, 211.3] }, // Dark (card 1), confirmed
  { type: 4, rgb: [192.0, 110.5, 186.8] }, // Dark (card 4), confirmed
  { type: 4, rgb: [192.5, 76.5, 202.4] },  // Dark (card 6), confirmed
  { type: 2, rgb: [102.0, 170.5, 51.0] },  // Wood (card 2), inferred from leaf icon
  { type: 2, rgb: [98.3, 165.3, 49.2] },   // Wood (card 3), inferred from leaf icon
  { type: 0, rgb: [77.2, 148.1, 204.4] },  // Water (card 5), inferred from wave icon
  { type: 1, rgb: [209.8, 88.3, 70.2] },   // Fire (card 3), live 2026-07-11, flame icon
  { type: 3, rgb: [140.4, 110.2, 25.8] },  // Light (card 4), live 2026-07-11, gold cross icon
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
const cellLabel = c => c.hurricane ? 'Hurricane'
  : (c.unknownBase ? 'Shock?' : TYPE_NAMES[c.type] + (c.electric ? '^' : '') + (c.iced ? '~' : '') + (c.frozen ? '#' : '') + (c.noSolvable ? '%' : '') + (c.edgeNoClear ? '$' : '') + (c.shield ? '+' : '') + (c.curse ? '&' : '')) + (c.thorn ? '*' : '') + (c.go ? '@' : '');

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

// Hurricane zone (live 2026-07-10): an opaque neutral-gray cyclone with a
// black center emblem. It occupies a whole column and completely hides the
// rune underneath. The hidden element is both unreadable and irrelevant:
// hurricane cells cannot dissolve, be picked up, be entered, or be passed
// through. Two live captures gave a wide separation from ordinary runes:
// hurricane grayPct=0.30..0.65 and saturatedPct=0.00..0.04, versus ordinary
// cells grayPct<=0.06 and saturatedPct>=0.55. Detect the column structurally
// (>=3 of its 5 cells) and mark all five cells, so one pale rune cannot create
// a false hurricane and animation at one row cannot make the column flicker.
function hurricaneOverlayStats(img, cx, cy) {
  let gray = 0, saturated = 0, n = 0;
  for (let dy = -70; dy <= 70; dy += 2) {
    for (let dx = -70; dx <= 70; dx += 2) {
      const i = img.off + ((cy + dy) * img.w + (cx + dx)) * 4;
      const r = img.buf[i], g = img.buf[i + 1], b = img.buf[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const mean = (r + g + b) / 3;
      n++;
      if (spread < 28 && mean > 85 && mean < 230) gray++;
      if (spread > 80) saturated++;
    }
  }
  return { grayPct: gray / n, saturatedPct: saturated / n };
}

function detectHurricaneColumns(img) {
  const columns = new Set();
  for (let gx = 0; gx < 6; gx++) {
    let hits = 0;
    for (let gy = 0; gy < 5; gy++) {
      const s = hurricaneOverlayStats(img, COLS[gx], ROWS[gy]);
      if (s.grayPct > 0.20 && s.saturatedPct < 0.10) hits++;
    }
    if (hits >= 3) columns.add(gx);
  }
  return columns;
}

function hurricaneCell(stats) {
  return {
    type: 0, thorn: false, electric: false, iced: false, frozen: false,
    shield: false, noSolvable: false, edgeNoClear: false, curse: false, hurricane: true,
    dist: 0, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct,
  };
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

// "Curse" badge (new mechanic, live 2026-07-10, User-stated + live-measured):
// a small circular badge in the cell's TOP-RIGHT corner — magenta/pink ring,
// white background, red chrysanthemum-flower icon — distinct from the
// pre-existing plain black-circle/white-butterfly badge on every OTHER cell
// (P22: confirmed cosmetic, correctly ignored). User-confirmed semantics
// match the fire-hazard mechanic exactly (P22/P23): dissolvable at a normal
// match of 3+, but the dissolve should be AVOIDED across every cascade wave
// (not just wave 1); fully draggable/pass-through, touching is fine. User
// was NOT sure this stays locked to one element in future battles (this
// capture: all 5 instances were on Dark runes, zero on any other element) —
// so this is detected and modeled PER-CELL (like the fire-hazard overlay),
// not as a type-global constraint, and merged into the SAME hazardPositions
// mechanism rather than adding a new one. Live-measured badge-patch average
// (offset +52,-52 from cell center, half=18): (206,101,167) on 4/5 samples;
// the 5th sample (also thorn-sealed, whose overlay dims everything ~0.55x
// per P5) measured (181,98,150), dist ~30 from the signature — still a
// comfortable margin from the plain-badge cluster (measured (109-114,
// 106-113,89-100) across 16 samples spanning thorn/non-thorn/every visible
// element, dist ~120+ from the curse signature).
const CURSE_BADGE_RGB = [206, 101, 167];
const MAX_CURSE_BADGE_DIST = 55;
// A HEART rune's own top-right lobe fills the badge patch with almost the
// same pink as the curse badge (live 2026-07-10, L49): every Heart on a
// curse-free board measured (239-241,130-133,199-202) — dist 54-59 from
// CURSE_BADGE_RGB, straddling the 55 threshold (one Heart at 54.2 was
// falsely flagged cursed). Fix: the patch must be NEARER the badge
// signature than this heart-corner reference to count as a badge. A real
// badge on a Heart still detects fine — the opaque badge replaces the
// corner pixels (dist ~0-30 to the badge signature vs ~55-83 to this).
const HEART_CORNER_RGB = [240, 131, 200];
function curseBadgeStats(img, cx, cy) {
  const bx = cx + 52, by = cy - 52;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -18; dy <= 18; dy += 2) {
    for (let dx = -18; dx <= 18; dx += 2) {
      const i = img.off + ((by + dy) * img.w + (bx + dx)) * 4;
      r += img.buf[i]; g += img.buf[i + 1]; b += img.buf[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}
function hasCurseOverlay(img, cx, cy) {
  const rgb = curseBadgeStats(img, cx, cy);
  const dBadge = Math.hypot(rgb[0] - CURSE_BADGE_RGB[0], rgb[1] - CURSE_BADGE_RGB[1], rgb[2] - CURSE_BADGE_RGB[2]);
  const dHeartCorner = Math.hypot(rgb[0] - HEART_CORNER_RGB[0], rgb[1] - HEART_CORNER_RGB[1], rgb[2] - HEART_CORNER_RGB[2]);
  return dBadge < MAX_CURSE_BADGE_DIST && dBadge < dHeartCorner;
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
    if (sig.disabled) continue; // see SIGNATURES comment: unconfirmed/retracted entries, kept for history only
    const d = Math.hypot(stats.rgb[0] - sig.rgb[0], stats.rgb[1] - sig.rgb[1], stats.rgb[2] - sig.rgb[2]);
    if (d < bestDist) { bestDist = d; best = sig; }
  }
  // Two independent thorn signals: nearest signature + dark-pixel share (P5).
  // Trust the dark-pixel metric when they disagree.
  const thorn = stats.darkPct > 0.2;
  let type = best.type;
  // Dark-family vs Heart family discriminator for thorn cells (LESSONS
  // L38/L39/L46/L47 — this exact pair has misread 4 times). Whole-cell
  // raw-RGB nearest-match is UNRELIABLE here: thorn-Dark, thorn-Heart and
  // thorn-shield-Dark all sit within ~20-45 units of each other, and adding
  // the shield-Dark+thorn signature (L47) put a Dark-family point only ~20
  // units from live confirmed Heart* cells. The feature that separates the
  // FAMILIES cleanly across every live data point ever recorded is r-b
  // (purple runes have blue>red, pink runes red>blue): Dark family -9..-2
  // (incl. shield variants), Heart family +15.7..+27 — an ~18-unit gap.
  // (The previous g-b signal had overlapping ranges and failed once, L46.)
  // Per L39, only invoked when the cross-family raw race is CLOSE; gate=30
  // chosen from live data: races needing the override measured gap 10-27,
  // confident same-family matches measured 36+. Both family distances are
  // MIN over all active signatures of that family so shield variants
  // participate, and the winning family's nearest signature supplies the
  // flags (shield in particular).
  if ((best.type === 4 || best.type === 5) && best.thorn) {
    let dDark = Infinity, dHeart = Infinity, darkSig = null, heartSig = null;
    for (const s of SIGNATURES) {
      if (s.disabled || !s.thorn || (s.type !== 4 && s.type !== 5)) continue;
      const d = Math.hypot(stats.rgb[0] - s.rgb[0], stats.rgb[1] - s.rgb[1], stats.rgb[2] - s.rgb[2]);
      if (s.type === 4 && d < dDark) { dDark = d; darkSig = s; }
      if (s.type === 5 && d < dHeart) { dHeart = d; heartSig = s; }
    }
    if (Math.abs(dDark - dHeart) < 30) {
      const rb = stats.rgb[0] - stats.rgb[2];
      best = rb < 7 ? darkSig : heartSig;
      type = best.type;
      bestDist = rb < 7 ? dDark : dHeart;
    }
  }
  return { type, thorn, electric: best.electric ?? false, iced: best.iced ?? false, frozen: best.frozen ?? false, shield: best.shield ?? false, dist: bestDist, rgb: stats.rgb.map(Math.round), darkPct: stats.darkPct };
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
    // Light/Fire cutoff LOWERED 0.30->0.12 (live 2026-07-10, LESSONS L44,
    // same pattern as the L42 Dark/Heart fix): a User-confirmed live Light
    // shock at (1,3) was resampled 9 times across independent 18-frame
    // captures — g/r = 0.176, 0.438, 0.509, 0.445, 0.419, 0.243, 0.292,
    // 0.416, 0.441 — genuinely noisy, with the observed floor (0.176) itself
    // already below the old 0.30 cutoff (3 of 9 samples misclassified as
    // Fire). 0.12 clears the observed Light floor with margin; the original
    // Fire reference (residual g/r near 0, L16) is UNVERIFIED this session —
    // no live Fire shock was available to resample, so this margin is a
    // one-sided estimate, same caveat as P34's Dark reference.
    return g / r > 0.12 ? 3 : 1;         // Light (yellow) vs Fire (red)
  }
  if (g < 1) {                 // green floor -> Dark / Heart / Fire-shock
    // A Fire SHOCK's arc lifts blue over green (green becomes floor) but the
    // residual stays nearly pure red: b/r ~0.04-0.18. Heart sits ~0.47, Dark
    // ~1.2 (original L16 calibration). Cutoff RAISED 0.75->1.05 in two steps
    // (live 2026-07-10, LESSONS L40): a User-confirmed live Heart shock at
    // (3,4) was resampled 6 times across independent 18-frame captures and
    // measured b/r = 0.791, 0.869, 0.980, 0.867, 0.895, 0.976 — a genuinely
    // NOISY signal (not a single miscalibrated constant), with 2 of 6 samples
    // already past a first-attempt cutoff of 0.95. 1.05 clears the observed
    // Heart max (0.980) by margin while staying below the original Dark
    // reference (1.2, UNVERIFIED this session — no live Dark shock was
    // available to resample; if a real Dark shock is ever misread as Heart,
    // that reference itself likely needs re-measuring this session, same
    // pattern as the thorn-color drift seen elsewhere today, L37-L39).
    const br = b / (r || 1);
    if (br > 1.05) return 4;              // Dark (blue comparable to/above red)
    if (br > 0.30) return 5;             // Heart (pink)
    return 1;                            // Fire (red, blue only mildly lifted)
  }
  // Red floor: assumed Water-only until live 2026-07-10 (LESSONS L43) — a
  // User-confirmed Wood shock at (2,3) also landed here (residual r=0,
  // g=88.4, b=25.7), not the "blue-floor" case the Wood branch above assumed
  // was the only route to Wood. Water's own red-floor residual (measured
  // earlier this session, (3,1): g=39.7, b=114.3) is blue-dominant — the
  // opposite relationship — so g vs b cleanly discriminates within this
  // floor too, mirroring the g-vs-r check already used in the blue-floor
  // branch above.
  return g > b ? 2 : 0;                  // red floor -> Wood (green-dominant) or Water (blue-dominant)
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
function classifyBoardCell(img, gx, gy, noSolvableType, skipGlow = false, hurricaneColumns = null) {
  const cx = COLS[gx], cy = ROWS[gy];
  const stats = cellStats(img, cx, cy);
  if (hurricaneColumns && hurricaneColumns.has(gx)) return hurricaneCell(stats);
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
  // Curse badge (2026-07-10, User-stated): a SMALL corner icon, unlike the
  // fire overlay it does NOT obscure the base rune at all — no reclassify
  // needed, just the flag. Independent of every check above (can coexist
  // with thorn/edgeNoClear/noSolvable; not yet observed live combined with
  // frozen/shield/electric, so no interaction guard beyond the flag itself).
  if (hasCurseOverlay(img, cx, cy)) c.curse = true;
  return c;
}

// quick=true skips the 18-frame electric-burst confirmation below (LESSONS
// L53): a full read normally costs one capture, but any electric-glow
// candidate anywhere on the board balloons that to 18 captures (needed for
// accurate electric-type classification). That precision is wasted on a
// "did the board obviously change" staleness check — it only needs to
// notice a GROSS change (wave transition, dialog, defeat screen), and a
// slightly-off electric read there just means a conservative false-positive
// re-solve (safe), not a wrong spin. quick=true trades that precision for
// staying at ~1 capture regardless of board content, so the CONFIRM prompt
// (2026-07-10, User-reported "sometimes it takes quite a while to start
// dragging") is instant instead of blocking on the full burst.
function readBoardFromScreen(quick = false) {
  const img = captureRaw();
  const noSolvableType = noSolvableTypeOverride();
  const hurricaneColumns = detectHurricaneColumns(img);
  const cells = [];
  let anyCandidate = false;
  for (let gy = 0; gy < 5; gy++) {
    const row = [];
    for (let gx = 0; gx < 6; gx++) {
      const c = classifyBoardCell(img, gx, gy, noSolvableType, false, hurricaneColumns);
      if (c.electric) anyCandidate = true;
      row.push(c);
    }
    cells.push(row);
  }
  if (anyCandidate && !quick) {
    // Electric anywhere -> capture a burst. Persistence across frames rejects
    // one-frame neighbor-flare ghosts (P11); the burst also feeds electricBase
    // the temporal minimum it needs to read the base under glare (L16). ~10
    // frames converges the min; the arcs move fast so short spacing is fine.
    // ~18 frames: fewer under-converges the temporal min and pulls Light's
    // residual down toward Fire's (measured: 10 frames misread a Light shock
    // as Fire; 18-20 gives Light g/r ~0.45 vs Fire ~0.11).
    const imgs = [img];
    for (let k = 0; k < 17; k++) imgs.push(captureRaw());
    const hurricaneColumnsPerFrame = imgs.map(detectHurricaneColumns);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 6; gx++) {
        // The opaque column-level hurricane read outranks transient bright
        // pixels that can resemble an electric arc in individual frames.
        if (cells[gy][gx].hurricane) continue;
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
          const c = classifyBoardCell(imgs[bestIdx], gx, gy, noSolvableType, true, hurricaneColumnsPerFrame[bestIdx]);
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
// Paced down+move dispatch shared by executeTouchPath and the
// --after-spin-kill hold variant below — the deadline/yield pacing (L17) is
// identical either way; only what happens after the last point differs
// (release vs. hold-and-kill).
async function dispatchTouchPath(w, screenPath, stepMs) {
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
  return t0;
}

async function executeTouchPath(screenPath, stepMs, screenshotAfterSpin) {
  // Hygiene: a lingering injector from a killed session could still hold or
  // replay touch state — clear the field before every drag (root available).
  try { execSync('adb shell su -c "pkill -f MaaTouch"', { stdio: 'pipe' }); } catch { /* none running */ }
  const p = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await sleep(1500); // MaaTouch boot
  const w = s => p.stdin.write(s + '\n');
  const t0 = await dispatchTouchPath(w, screenPath, stepMs);
  // Capture BEFORE releasing, while still held at the final point — NOT after
  // release (bug found + fixed 2026-07-11, L64, from a SECOND live User
  // report: even capturing immediately after 'u 0' still showed "4 Combo!!"
  // already playing). The game starts resolving/dissolving the instant it
  // sees the release, and that cascade animation runs faster than an adb
  // screencap+pull round-trip (~200-500ms) can race — there is no post-
  // release moment fast enough to catch the board before it starts
  // dissolving. The only way to see the completed, pre-dissolve arrangement
  // is to screenshot WHILE STILL HELD, same principle as --after-spin-kill's
  // "mid-hold" screenshot (which also captures before ever releasing). A
  // short settle sleep first lets the trailing rune stop visually drifting
  // (same 300ms used by executeTouchPathAndKill's mid-hold capture).
  if (screenshotAfterSpin) {
    await sleep(300);
    saveNamedScreenshot('after-spin');
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

/**
 * --rearrange (P50): dispatch SEVERAL SEPARATE drags in one MaaTouch
 * session, reusing dispatchTouchPath per drag. Spawning MaaTouch has a
 * ~1.5s boot cost (executeTouchPath's `await sleep(1500)`) — calling
 * executeTouchPath once per drag would pay that on EVERY drag (a 20-drag
 * rearrangement would burn 30+s in boot overhead alone, working against
 * the whole point of a stage-timer-limited mechanic). Boot ONCE, dispatch
 * every drag's down+move+release to the SAME open stdin, clean up ONCE at
 * the end — same shape as executeTouchPath, just looped.
 *
 * No settle-wait/re-capture between drags (User-confirmed model: no
 * gravity or dissolve happens until the stage timer expires, so there is
 * nothing to observe between drags — only the FINAL board matters).
 *
 * pauseMs (default 150, see --rearrange-pause-ms): gap between one drag's
 * release and the next drag's touch-down, so the game reads it as a NEW
 * gesture rather than a continuation of the last one. This is INDEPENDENT
 * of stepMs/--move-ms — --move-ms only paces points WITHIN a single drag's
 * movement, it never touches this gap. Live-confirmed 2026-07-11 (22-drag
 * rearrangement at --move-ms 60): the default 150ms pause was NOT enough —
 * BOARD_AFTER_ROW* (the simulated end state) diverged from the real
 * post-spin board starting from an early drag, then every later drag
 * (planned against the assumed-correct intermediate board) compounded the
 * error into a totally different final arrangement. Root cause is the gap,
 * not drag speed: raising --rearrange-pause-ms lets --move-ms stay fast.
 */
async function executeMultiDragPath(screenPaths, stepMs, screenshotAfterSpin, pauseMs = 150) {
  try { execSync('adb shell su -c "pkill -f MaaTouch"', { stdio: 'pipe' }); } catch { /* none running */ }
  const p = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await sleep(1500); // MaaTouch boot — ONCE for the whole batch
  const w = s => p.stdin.write(s + '\n');
  let totalMs = 0;
  for (const screenPath of screenPaths) {
    const t0 = await dispatchTouchPath(w, screenPath, stepMs);
    w('u 0'); w('c');
    totalMs += performance.now() - t0;
    await sleep(pauseMs);
  }
  // Capture right after the LAST release, before this function's own 2s
  // grace sleep + forced-release cleanup below — same reasoning as
  // executeTouchPath's fix (those steps are touch-hygiene, unrelated to the
  // game, and run well after the fact if left before the screenshot).
  if (screenshotAfterSpin) saveNamedScreenshot('after-spin');
  await sleep(2000); // grace: only the tail can be in flight
  p.kill();

  // Same unconditional forced-release cleanup as executeTouchPath, run once
  // for the whole batch (a stuck touch after the LAST drag is the only risk
  // once every prior drag already sent its own 'u 0').
  const localScript = path.join(__dirname, 'spin_script.txt');
  fs.writeFileSync(localScript, 'u 0\nc\n');
  execSync(`adb push "${localScript}" /data/local/tmp/tos_spin.txt`, { stdio: 'pipe' });
  await new Promise(resolve => {
    const q = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App < /data/local/tmp/tos_spin.txt'], { stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { q.kill(); resolve(); }, 8000);
    q.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  return totalMs;
}

// ---------- --after-spin-kill: hold-and-revert ----------

function timestampPrefix() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Saves under phone/screenshots/<timestamp>_<label>.png (folder created on
// first use). Kept as its own capture (not reusing capturePng's fixed path)
// so repeated calls within one run/round don't overwrite each other.
function saveNamedScreenshot(label) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const outFile = path.join(SCREENSHOT_DIR, `${timestampPrefix()}_${label}.png`);
  capturePng(outFile);
  console.log('[TOS] SCREENSHOT=' + outFile);
  return outFile;
}

function screenSize() {
  const out = execSync('adb shell wm size', { stdio: 'pipe' }).toString();
  const m = out.match(/(\d+)x(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1080, h: 2340 };
}

function continueTapPoint() {
  const { w, h } = screenSize();
  return { x: Math.round(w * CONTINUE_BUTTON_FRAC.x), y: Math.round(h * CONTINUE_BUTTON_FRAC.y) };
}

/**
 * Force-stop -> restart -> dismiss the "戰鬥尚未結束" resume dialog -> wait
 * for the board to reappear. The dialog's appearance time varies (measured
 * 8-14s live), so instead of a fixed sleep this retaps Continue every ~2.5s
 * — harmless while the loading screen is still black/transitioning (verified
 * live: a tap during that window is a no-op) — until the board recognizes as
 * mostly-known, then hands off to the existing waitForStableBoard() settle
 * wait. Verified live 2026-07-10: the board this returns to is a byte-for-
 * byte match of the board right before the kill, PROVIDED the drag that
 * preceded it was held and never released (see the note at TOS_PKG above).
 */
async function killRestartContinue() {
  console.log('[TOS] AFTER_SPIN_KILL=force-stop');
  try { execSync(`adb shell am force-stop ${TOS_PKG}`, { stdio: 'pipe' }); } catch { /* best-effort */ }
  await sleep(1500);
  console.log('[TOS] AFTER_SPIN_KILL=restart');
  execSync(`adb shell am start -n ${TOS_PKG}/${TOS_ACTIVITY}`, { stdio: 'pipe' });

  const { x: tapX, y: tapY } = continueTapPoint();
  const deadline = Date.now() + 45000;
  let taps = 0;
  while (Date.now() < deadline) {
    await sleep(2500);
    try { execSync(`adb shell input tap ${tapX} ${tapY}`, { stdio: 'pipe' }); } catch { /* best-effort */ }
    taps++;
    try {
      const cells = readBoardFromScreen();
      const known = cells.flat().filter(c => !cellUnknown(c)).length;
      if (known >= 25) break; // board is back (allow a couple mid-animation misreads)
    } catch { /* still on a dialog/loading screen */ }
  }
  console.log(`[TOS] AFTER_SPIN_KILL=continue-tapped taps=${taps} point=${tapX},${tapY}`);
  const cells = await waitForStableBoard();
  console.log('[TOS] AFTER_SPIN_KILL=reverted');
  return { cells, taps };
}

/**
 * --after-spin-kill: dispatch the drag but NEVER send the release ('u 0') —
 * hold at the final point, screenshot for the record, then force-stop the
 * game while still held. Verified live: this is what makes the revert exact
 * (a completed/released drag's revertibility was NOT tested — see the
 * conversation notes; holding-then-killing is the confirmed-safe path).
 */
async function executeTouchPathAndKill(screenPath, stepMs) {
  try { execSync('adb shell su -c "pkill -f MaaTouch"', { stdio: 'pipe' }); } catch { /* none running */ }
  const p = spawn('adb', ['shell', 'CLASSPATH=/data/local/tmp/maatouch app_process / com.shxyke.MaaTouch.App'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await sleep(1500); // MaaTouch boot
  const w = s => p.stdin.write(s + '\n');
  const t0 = await dispatchTouchPath(w, screenPath, stepMs);
  const dragMs = performance.now() - t0;

  await sleep(300); // let the trailing rune visually settle at the held point
  saveNamedScreenshot('mid-hold');

  console.log('[TOS] AFTER_SPIN_KILL=killing-while-held (no release sent)');
  try { execSync(`adb shell am force-stop ${TOS_PKG}`, { stdio: 'pipe' }); } catch { /* best-effort */ }
  try { p.kill(); } catch { /* already gone */ }
  try { execSync('adb shell su -c "pkill -f MaaTouch"', { stdio: 'pipe' }); } catch { /* none running */ }

  const { taps } = await killRestartContinue();
  saveNamedScreenshot('post-continue');
  return { dragMs, taps };
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
      const color = c.hurricane ? '#d8d8d8' : TYPE_CSS[c.type];
      overlays += `<div class="cell${suspect ? ' suspect' : ''}" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;border-color:${color}">` +
        `<span style="background:${color}">${cellLabel(c)}</span>` +
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
<p>Each box = recognized rune or blocked hurricane zone (border color = type, * = thorn). d = color distance
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

function parseCellStr(flag, raw) {
  const parts = String(raw).split(',').map(s => Number(s.trim()));
  if (parts.length !== 2 || !parts.every(Number.isInteger)
      || parts[0] < 0 || parts[0] > 5 || parts[1] < 0 || parts[1] > 4) {
    throw new Error(`${flag} must be "col,row" with col 0-5 and row 0-4 (got "${raw}")`);
  }
  return { x: parts[0], y: parts[1] };
}

// Parse a "col,row" cell argument (x=column 0-5, y=row 0-4) — the same
// convention the board grid and [TOS] PATH use. Returns {x,y} or null.
function argCell(flag) {
  const raw = argValue(flag);
  return raw == null ? null : parseCellStr(flag, raw);
}

// Parse a flag given MULTIPLE times (e.g. --end 3,4 --end 1,2) into an array
// of {x,y} cells — the held rune must land on ANY ONE of them (2026-07-10,
// User-requested multi-end support). Returns null if the flag was never
// given, so callers keep the existing "null = no constraint" convention.
function argCells(flag) {
  const raw = [];
  process.argv.forEach((a, i) => {
    if (a === flag) { if (process.argv[i + 1] != null) raw.push(process.argv[i + 1]); }
    else if (a.startsWith(flag + '=')) raw.push(a.slice(flag.length + 1));
  });
  return raw.length === 0 ? null : raw.map(s => parseCellStr(flag, s));
}

function parseRuneTypeList(flag, { allowAll = false } = {}) {
  const raw = argValue(flag);
  if (!raw) return [];
  if (allowAll && raw.trim().toLowerCase() === 'all') return [0, 1, 2, 3, 4, 5];
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
  const afterSpinKill = process.argv.includes('--after-spin-kill');
  const screenshotAfterSpin = process.argv.includes('--screenshot-after-spin');
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

    if (afterSpinKill) {
      // Deliberately ignores every other flag/solver: this is just a probe
      // for "does the game/board come back cleanly," not a real spin — move
      // ONE cell into any free neighbor, hold, screenshot, kill, restart
      // (see executeTouchPathAndKill). Avoids electric/hurricane cells since
      // touching those can end a drag early or is hard-blocked outright.
      let from = null, to = null;
      outer:
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 6; gx++) {
          if (cells[gy][gx].hurricane || cells[gy][gx].electric) continue;
          const neighbors = [[gx + 1, gy], [gx, gy + 1], [gx - 1, gy], [gx, gy - 1]]
            .filter(([nx, ny]) => nx >= 0 && nx < 6 && ny >= 0 && ny < 5);
          for (const [nx, ny] of neighbors) {
            if (cells[ny][nx].hurricane || cells[ny][nx].electric) continue;
            from = { x: gx, y: gy }; to = { x: nx, y: ny };
            break outer;
          }
        }
      }
      if (!from) { console.log('[TOS] ABORT=after-spin-kill no movable cell found (no touch sent)'); return; }
      console.log(`[TOS] AFTER_SPIN_KILL_MOVE=${from.x},${from.y} -> ${to.x},${to.y}`);
      if (dry) { console.log('[TOS] DRY_RUN=1 (no touch sent)'); return; }
      const stepsPerCell = Number(argValue('--steps-per-cell') ?? STEPS_PER_CELL);
      const moveMsArg = argValue('--move-ms');
      const stepMs = moveMsArg != null ? Number(moveMsArg) / stepsPerCell : Number(argValue('--step-ms') ?? STEP_MS);
      const screenPath = gridPathToScreenPath([from, to], stepsPerCell);
      const { dragMs, taps } = await executeTouchPathAndKill(screenPath, stepMs);
      console.log(`[TOS] SPIN=held-then-killed points=${screenPath.length} moveMs=${(stepMs * stepsPerCell).toFixed(1)} holdMs=${Math.round(dragMs)} continueTaps=${taps}`);
      continue;
    }

    const elecList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.electric) elecList.push(`${gx},${gy}`); }));
    if (elecList.length) console.log('[TOS] ELECTRIC_CELLS=' + elecList.join(' ') + ' (row-major; --shock-bases maps in this order)');
    const goCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.go) goCells.push({ x: gx, y: gy }); }));
    if (goCells.length) console.log('[TOS] GO_CELLS=' + goCells.map(c => `${c.x},${c.y}`).join(' ') + ' (forced drag start unless --start/--drag-from overrides)');
    const hurricaneCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.hurricane) hurricaneCells.push(`${gx},${gy}`); }));
    if (hurricaneCells.length) console.log('[TOS] HURRICANE_CELLS=' + hurricaneCells.join(' ')
      + ' (hard blocked: cannot dissolve, pick up, enter, touch, or pass through)');
    const edgeNoClearCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.edgeNoClear) edgeNoClearCells.push(`${gx},${gy}`); }));
    // {x,y} form for the solver's hazardPositions option (P22, fixed
    // 2026-07-10, L34): matches form NORMALLY (not structurally excluded —
    // see the flagGrid comment below for why), and any board where a wave's
    // dissolve touches one of these positions is rejected as a candidate
    // final answer, in ALL cascade waves, not just the first.
    const hazardPositions = edgeNoClearCells.map(s => { const [x, y] = s.split(',').map(Number); return { x, y }; });
    if (edgeNoClearCells.length) console.log('[TOS] EDGE_NO_CLEAR_CELLS=' + edgeNoClearCells.join(' ') + ' (must never dissolve, any wave — enforced via solver hazardPositions)');
    // Curse cells (P37, corrected P38 — User live-corrected: the curse
    // effect travels WITH the dragged rune, NOT a fixed board position, so
    // it is NOT part of hazardPositions — encoded via CURSE_BASE in
    // board.fromArray below instead, same in-band-value family as shield.
    // This list is recognition-time only (where the badge was SEEN before
    // the drag) — used for the CURSE_CELLS diagnostic and the drag-execution
    // dwell heuristic, not for the solver's hazard mechanism.
    const curseCells = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.curse) curseCells.push(`${gx},${gy}`); }));
    if (curseCells.length) console.log('[TOS] CURSE_CELLS=' + curseCells.join(' ') + ' (must never dissolve, any wave — travels WITH the rune, enforced via solver CURSE_BASE board value, not position; User unsure if locked to one element in future battles)');
    const shieldCellsList = [];
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.shield) shieldCellsList.push(`${gx},${gy}`); }));
    if (shieldCellsList.length) console.log('[TOS] SHIELD_CELLS=' + shieldCellsList.join(' ') + ' (dissolves normally, travels with the rune; solver enforces >=1 shielded rune of each color must survive every wave — not a full freeze, P30)');
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
    cells.forEach((row, gy) => row.forEach((c, gx) => { if (c.edgeNoClear || c.curse || c.noSolvable || c.hurricane) hazardDwellCells.push({ x: gx, y: gy }); }));
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
    // Hurricane cells also use the non-element FROZEN sentinel because their
    // hidden base is unreadable and must not count toward any type totals;
    // positional flags below additionally make them completely immovable.
    // Shielded runes (User-confirmed live 2026-07-10: the shield travels WITH
    // the dragged rune, not the cell) are NOT frozen (bug found + fixed
    // 2026-07-10, P30/L40 — corrected from the original FROZEN modeling,
    // which the User confirmed was too strict: "the shielded rune can be
    // dissolve actually, but we can't dissolve all — if board has zero
    // shield rune, the card cannot attack"). Encoded as SHIELD_BASE + type
    // (a 7th-13th board value, same in-band-value trick as FROZEN so it
    // travels through drag swaps/gravity automatically) — matches and
    // dissolves completely normally; BoardSimulator.resolve()'s
    // shieldViolated flags the ONLY forbidden outcome: a color's shielded
    // count reaching zero. `cells[y][x].type`/label still show the real
    // element (Wood+) for display; only the SOLVER board substitutes the
    // shielded value.
    // Cursed runes (P37, corrected P38 — User live-corrected: "the curse
    // badge will follow the rune unlike fire-hazard mechanic") are the same
    // in-band-value family, own range CURSE_BASE + type (14th-19th board
    // value) so they're distinguishable from shielded runes. Matches and
    // dissolves completely normally; BoardSimulator.resolve()'s
    // curseViolated flags the ONLY forbidden outcome: THIS specific rune
    // actually dissolving, in any wave — unlike shield's per-color count
    // floor, curse is a hard per-instance "never".
    board.fromArray(cells.map(row => row.map(c =>
      (c.frozen || c.hurricane) ? FROZEN : (c.curse ? CURSE_BASE + c.type : (c.shield ? SHIELD_BASE + c.type : c.type)))));

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
      if (c.hurricane) {
        f |= CELL_FLAGS.NO_DISSOLVE | CELL_FLAGS.NO_PICKUP | CELL_FLAGS.NO_SWAP;
      }
      // Shield (P24/P30): NOT modeled with CELL_FLAGS here (positional —
      // stays with the grid cell, not the rune). User confirmed the shield
      // travels WITH the specific rune when dragged, so it needs the same
      // in-band per-rune board-value trick as FROZEN (P16) — but UNLIKE
      // FROZEN, a shielded rune dissolves completely normally; only the
      // whole-board "don't drop a color's shield count to zero" rule is
      // enforced (via SHIELD_BASE, see board.fromArray below).
      // NOT CELL_FLAGS.NO_DISSOLVE (bug found + fixed 2026-07-10, L34): that
      // structurally EXCLUDES the cell from ever joining a run, which the
      // User confirmed live is the WRONG model — the real game lets a run
      // sweep the hazard cell in along with same-type neighbors (a 4-run
      // dissolves all 4, hazard cell included) exactly like normal match-3
      // rules. Enforced instead via the solver's `hazardPositions` option
      // (see below) — matches form normally, and a board where any wave's
      // dissolve touches a hazard cell is rejected outright as a candidate
      // answer, never silently "trimmed" into a smaller safe-looking match.
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
    // --end may be given multiple times (--end 3,4 --end 1,2): the held rune
    // must land on ANY ONE of them, and the solver picks whichever qualifying
    // one scores best (2026-07-10, User-requested).
    const endCells = argCells('--end');
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
      console.log(`[TOS] ABORT=start-unpickable start=${startCell.x},${startCell.y} is hurricane/electric/locked (NO_PICKUP) — the game can't lift it; pick another --start (no touch sent)`);
      return;
    }
    const startCells = startCell ? [startCell] : null;
    if (startCell || endCells) {
      console.log(`[TOS] PIN=start:${startCell ? `${startCell.x},${startCell.y}` : 'any'} end:${endCells ? endCells.map(e => `${e.x},${e.y}`).join('|') : 'any'}`);
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
    // --first-attr-combos N = EXACTLY N first-wave ATTRIBUTE combos (首消N屬:
    // wave-1 combo groups of any NON-Heart type; repeats of one attribute
    // count, e.g. 3 Light groups = 3); N+ = at least N. Heart groups are not
    // counted but not forbidden. "max" is not supported for this flag.
    const rawAttr = argValue('--first-attr-combos');
    if (rawAttr === 'max') {
      console.log('[TOS] ABORT=first-attr-combos max mode is not supported (use an explicit N or N+) (no touch sent)');
      return;
    }
    const exactAttrMode = rawAttr !== null && !String(rawAttr).endsWith('+');
    const minFirstAttr = Number(String(rawAttr ?? 0).replace(/\+$/, ''));
    // --convert TYPE:N — card skill: the first N runes the finger TOUCHES
    // while dragging (not counting the picked-up rune, which never converts
    // and always keeps its own type wherever the drag ends) turn into TYPE
    // as they're touched. TYPE accepts full names/letters/digits, same as
    // every other rune-type flag; N is a count or "max"/"all" for the whole
    // path. --convert wood:5 / --convert w:5 / --convert water:max
    const rawConvert = argValue('--convert');
    let convertType = null, convertCount = 0;
    if (rawConvert !== null) {
      const parts = String(rawConvert).split(':');
      if (parts.length !== 2) throw new Error('--convert must be "TYPE:N" or "TYPE:max" (e.g. --convert wood:5)');
      const [typeTok, countTok] = parts.map(s => s.trim().toLowerCase());
      convertType = /^[0-5]$/.test(typeTok) ? Number(typeTok)
        : TYPE_LETTERS.indexOf(typeTok) !== -1 ? TYPE_LETTERS.indexOf(typeTok)
        : TYPE_NAMES.map(n => n.toLowerCase()).indexOf(typeTok);
      if (convertType === -1) throw new Error(`--convert: unknown rune type "${typeTok}" (use ${TYPE_NAMES.join('/')}, ${TYPE_LETTERS.join('/')}, or 0-5)`);
      convertCount = (countTok === 'max' || countTok === 'all') ? Infinity : Number(countTok);
      if (!(convertCount === Infinity || (Number.isInteger(convertCount) && convertCount > 0))) {
        throw new Error(`--convert: count must be a positive integer or "max"/"all" (got "${countTok}")`);
      }
      // Rearrange mode logs its own CONVERT_TARGET line below (different
      // semantics: applies to the first drag only, not "the whole path").
      if (!process.argv.includes('--rearrange')) {
        console.log(`[TOS] CONVERT_TARGET=${TYPE_NAMES[convertType]} count=${convertCount === Infinity ? 'max' : convertCount} (first N runes touched while dragging, excluding the picked-up rune)`);
      }
    }
    // --want-group TYPE:N — BEST-EFFORT (not mandatory, never aborts): a
    // match group of EXACTLY N cells of TYPE somewhere across EVERY cascade
    // wave (not wave-1-only like --first-combos). TYPE accepts full name/
    // letter/digit, same parser convention as every other rune-type flag.
    const rawWantGroup = argValue('--want-group');
    let wantGroupType = null, wantGroupSize = 0;
    if (rawWantGroup !== null) {
      const parts = String(rawWantGroup).split(':');
      if (parts.length !== 2) throw new Error('--want-group must be "TYPE:N" (e.g. --want-group water:5)');
      const [typeTok, sizeTok] = parts.map(s => s.trim().toLowerCase());
      wantGroupType = /^[0-5]$/.test(typeTok) ? Number(typeTok)
        : TYPE_LETTERS.indexOf(typeTok) !== -1 ? TYPE_LETTERS.indexOf(typeTok)
        : TYPE_NAMES.map(n => n.toLowerCase()).indexOf(typeTok);
      if (wantGroupType === -1) throw new Error(`--want-group: unknown rune type "${typeTok}" (use ${TYPE_NAMES.join('/')}, ${TYPE_LETTERS.join('/')}, or 0-5)`);
      wantGroupSize = Number(sizeTok);
      if (!(Number.isInteger(wantGroupSize) && wantGroupSize > 0)) {
        throw new Error(`--want-group: size must be a positive integer (got "${sizeTok}")`);
      }
      console.log(`[TOS] WANT_GROUP_TARGET=${TYPE_NAMES[wantGroupType]}:${wantGroupSize} (best-effort — any cascade wave, exact size; won't abort if unreachable)`);
    }
    // --rearrange (排珠, P50, User-requested): multiple SEPARATE drags,
    // no dissolve until the stage timer expires, unlimited drag budget, no
    // gravity between releases. Solving becomes "find the best PERMUTATION
    // of the existing runes" (RearrangeSolver), not "find the best drag
    // path" — so single-drag-path concepts (--start/--end pins, --fire-route,
    // --convert's touch-order semantics, --drag-from's single continuous
    // motion) have no meaning here and are explicitly rejected rather than
    // silently ignored.
    const rearrangeMode = process.argv.includes('--rearrange');
    let rearrangeBeamWidth = 0, rearrangeMaxSteps = 0;
    if (rearrangeMode) {
      const incompatible = [];
      if (startCell) incompatible.push('--start');
      if (endCells) incompatible.push('--end');
      if (fireRoute > 0) incompatible.push('--fire-route');
      if (dragFromCol !== null) incompatible.push('--drag-from');
      if (incompatible.length > 0) {
        console.log(`[TOS] ABORT=rearrange-conflict ${incompatible.join(',')} has no meaning in --rearrange mode (multiple separate drags, no single path/start/end) (no touch sent)`);
        return;
      }
      // --convert composes with --rearrange (2026-07-10, User-requested +
      // User-confirmed design): ONLY the FIRST physical drag actually
      // generated converts its touched cells — a multi-drag rearrangement
      // has no single "whole path" for the flag to apply to, and applying
      // it to every drag would mean nothing left to rearrange elsewhere.
      // convertCount may be Infinite (--convert TYPE:max), same as
      // single-drag mode. See decomposeRearrangement's doc comment for why
      // this is safe as a pure execution-time bonus (never fed back into
      // RearrangeSolver's search).
      if (convertType !== null) {
        console.log(`[TOS] CONVERT_TARGET=${TYPE_NAMES[convertType]} count=${convertCount === Infinity ? 'max' : convertCount} (applies to the FIRST drag only, in --rearrange mode)`);
      }
      rearrangeBeamWidth = Number(argValue('--rearrange-beam') ?? 60);
      rearrangeMaxSteps = Number(argValue('--rearrange-steps') ?? 40);
      console.log(`[TOS] REARRANGE_MODE=on (beam=${rearrangeBeamWidth} steps=${rearrangeMaxSteps} per component — multiple separate drags, no dissolve until stage timer expires)`);
    }
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
      // Exclude frozen/hurricane cells: their .type is a display placeholder
      // — on the solver board they are FROZEN and can never dissolve, so
      // they are not part of a clear-all demand (frozen melts in a later
      // round). Shielded cells ARE included (P30): they dissolve normally,
      // same as any other rune of their color — see BoardSimulator.resolve's
      // shieldViolated for the SEPARATE "not all can dissolve" constraint.
      const totals = clearTypes.map(t => ({ t, n: cells.flat().filter(c => c.type === t && !c.frozen && !c.hurricane).length }));
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
    // --first-wave-have TYPES (or "all"): the first wave must dissolve AT
    // LEAST ONE rune of EACH listed type (P32, User-requested) — unlike
    // --clear-all, it doesn't need to clear every rune of the type, just
    // >=1. If a listed type has too few runes on the board to EVER form a
    // legal group this round (< 2 for a 2-match type, else < 3), the joint
    // demand is infeasible for that type this round — same
    // CLEAR_ALL_INFEASIBLE-style prompt: ask to drop it and continue with
    // the rest, or abort. The types that ARE achievable this round get a
    // RESERVE FLOOR (User-specified: "solve max-run combo minus one" — i.e.
    // never drain below its own min-run threshold): they must not be fully
    // consumed this wave, so a future spin (once skyfall replenishes the
    // deficient type) can still satisfy the demand for all of them together.
    // Only applied when a sibling type actually got dropped — a fully
    // achievable list has nothing to reserve for.
    const firstWaveHaveTypes = parseRuneTypeList('--first-wave-have', {allowAll: true});
    const haveNoConflict = firstWaveHaveTypes.filter(t => firstWaveNoTypes.includes(t));
    if (haveNoConflict.length > 0) {
      console.log('[TOS] ABORT=first-wave-have-conflict ' + haveNoConflict.map(t => TYPE_NAMES[t]).join(',')
        + ' cannot be both --first-wave-have and --first-wave-no in wave 1 (no touch sent)');
      return;
    }
    const haveNoSolveConflict = firstWaveHaveTypes.filter(t => noSolvableTypes.includes(t));
    if (haveNoSolveConflict.length > 0) {
      console.log('[TOS] ABORT=no-solvable-conflict ' + haveNoSolveConflict.map(t => TYPE_NAMES[t]).join(',')
        + ' cannot be both --first-wave-have and --no-solvable (no touch sent)');
      return;
    }
    let reserveTypes = [];
    if (firstWaveHaveTypes.length > 0) {
      // Per-type feasibility vs BOTH structural conflicts a "clear >=1 of
      // this type" demand can hit: (a) too few dissolvable runes to form a
      // min-run group at all (cursed runes can NEVER dissolve, so they don't
      // count as usable); (b) the shield floor (P30): the group must leave
      // >=1 shielded rune of the type, so it may use at most shieldCount-1
      // shielded runes — feasible only if plain >= minRun - (shieldCount-1).
      // On a board where ALL runes of a demanded type are shielded (live
      // 2026-07-10), (b) is what fires: the demand is unsatisfiable at any
      // beam width, and without this gate the solver grinds through beam +
      // planner escalation before aborting.
      const haveTotals = firstWaveHaveTypes.map(t => {
        const usableCells = cells.flat().filter(c => c.type === t && !c.frozen && !c.hurricane && !c.curse);
        const shieldN = usableCells.filter(c => c.shield).length;
        return {t, n: usableCells.length, shieldN, plainN: usableCells.length - shieldN};
      });
      console.log('[TOS] FIRST_WAVE_HAVE_TARGET=' + haveTotals.map(o => `${TYPE_NAMES[o.t]}:${o.n}`).join(','));
      const haveDead = haveTotals.map(o => {
        const minRun = isTwoMatch(o.t) ? 2 : 3;
        if (o.n < minRun) return {...o, why: `${o.n} dissolvable (need ${minRun})`};
        if (o.shieldN > 0 && o.shieldN - Math.max(0, minRun - o.plainN) < 1)
          return {...o, why: `shield-conflict (${o.shieldN} shielded, ${o.plainN} plain — any ${minRun}-group drains the shield floor)`};
        return null;
      }).filter(Boolean);
      if (haveDead.length > 0) {
        const haveDeadDesc = haveDead.map(o => `${TYPE_NAMES[o.t]}=${o.why}`).join(',');
        console.log('[TOS] FIRST_WAVE_HAVE_INFEASIBLE=' + haveDeadDesc
          + ' — this type cannot dissolve a group this round without violating a harder constraint');
        const force = process.argv.includes('--force-partial-first-wave-have');
        const proceed = force || await askYesNo(
          `[TOS] Continue and solve for the remaining type(s) only (drop ${haveDeadDesc}, preserve the rest for a future round)? [y/N] `);
        if (!proceed) {
          console.log('[TOS] ABORT=first-wave-have-infeasible ' + haveDeadDesc + ' (no touch sent)');
          return;
        }
        // A dropped sibling means "have ALL of them this round" is already
        // unreachable — so the survivors are NOT also held to a mandatory
        // "clear >=1 this round" demand (that would fight the reserve floor
        // whenever a survivor's total equals exactly its min-run, e.g. 3
        // total Water: "clear >=1" wants >=1 gone, "reserve >=3 remaining"
        // wants 0 gone — a direct contradiction). Reserve floor REPLACES the
        // have-demand for survivors this round, it doesn't add to it.
        const haveDeadSet = new Set(haveDead.map(o => o.t));
        reserveTypes = firstWaveHaveTypes.filter(t => !haveDeadSet.has(t));
        firstWaveHaveTypes.length = 0;
        console.log('[TOS] FIRST_WAVE_HAVE_TYPES=none (infeasible type(s) dropped; no wave-1 demand this round — '
          + (reserveTypes.length ? reserveTypes.map(t => TYPE_NAMES[t]).join(',') : 'remaining type(s)')
          + ' reserved above their own min-run so a future round can still pair them)');
      }
    }
    // Pre-solve feasibility for --first-attr-combos (same principle as the
    // FIRST_WAVE_HAVE gate, P41/L48: model EVERY hard constraint, not just a
    // count floor): per attribute type, dissolvable runes exclude frozen/
    // hurricane/cursed, the shield floor keeps 1 shielded rune per color
    // undissolvable in net terms, and types banned from wave 1 contribute 0.
    if (minFirstAttr > 0) {
      let maxAttr = 0;
      for (const t of [0, 1, 2, 3, 4]) {
        if (noSolvableTypes.includes(t) || firstWaveNoTypes.includes(t)) continue;
        const usableCells = cells.flat().filter(c => c.type === t && !c.frozen && !c.hurricane && !c.curse);
        const shieldN = usableCells.filter(c => c.shield).length;
        const dissolvable = usableCells.length - (shieldN > 0 ? 1 : 0);
        maxAttr += Math.floor(Math.max(0, dissolvable) / (isTwoMatch(t) ? 2 : 3));
      }
      console.log(`[TOS] FIRST_ATTR_COMBOS_TARGET=${exactAttrMode ? '' : '>='}${minFirstAttr} (attribute=non-Heart groups; max constructible on this board=${maxAttr})`);
      if (maxAttr < minFirstAttr) {
        console.log(`[TOS] ABORT=first-attr-combos-infeasible only ${maxAttr} attribute combo(s) constructible this round (no touch sent)`);
        return;
      }
    }
    // --workers N: shard the beam search across worker_threads (phone/
    // parallel.js). Default = cores-1; 1 = exact sequential solve. The beam
    // is PARTITIONED per worker (beamWidth/N each), so results can differ
    // slightly from --workers 1 in either direction — wall time ~1/N.
    // RearrangeSolver itself (plain --rearrange, no --convert) is still
    // sequential-only (P50) — the single-component beam search has no
    // natural item-list to shard the way DoraSolver/TargetPlanner do.
    // --rearrange + --convert DOES shard now (P57): solveRearrangeConvertAware's
    // conversionCandidates loop distributes across a persistent worker pool.
    const workers = Math.max(1, Number(argValue('--workers') ?? 0) || defaultWorkers());
    if (!rearrangeMode || convertType !== null) {
      console.log(`[TOS] WORKERS=${workers}` + (workers > 1 ? ` (${rearrangeMode ? 'conversion candidates sharded across a persistent pool' : `beam sharded ~${Math.ceil(Number(argValue('--beam') ?? 200) / workers)}/worker`}; --workers 1 for exact sequential)` : ''));
    }
    const t0 = Date.now();
    let sol, engine, rearrangeDrags = null;

    if (rearrangeMode) {
      // No path/moves/startX/startY (there is no single drag) — sol carries
      // only the fields the SHARED post-solve gates below actually read
      // (board/score/comboCount/firstCombos/firstAttrCombos/firstRunes/
      // firstClearedByType/chains), plus a synthetic moves/path pair sized
      // to whether ANY drag was planned, so the existing empty-solution
      // guard (`sol.moves.length === 0`) and start/end-pin check (skipped
      // entirely here since rearrangeMode already rejected --start/--end at
      // parse time) keep working completely unmodified.
      const rearrangeOptions = {
        sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null,
        minFirstCombos: minFirstArg, exactFirstCombos: exactMode,
        minFirstAttrCombos: minFirstAttr, exactFirstAttrCombos: exactAttrMode,
        minFirstRunes, exactFirstRunes: exactRunesMode,
        wantGroupType, wantGroupSize,
        twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
        rearrangeBeamWidth, rearrangeMaxSteps,
      };
      if (convertType !== null) {
        // P56 (2026-07-11, User-requested: guarantee perfection — teach the
        // solver to build a target that ALREADY accounts for the forced
        // first-drag conversion, rather than choosing a target first and
        // patching around conversion afterward (P54/P55, proven by
        // exhaustive testing to have a real ceiling — the target itself may
        // structurally have no compatible first drag, so no amount of
        // first-drag cleverness recovers it). solveRearrangeConvertAware
        // tries several candidate first-drag corridors and, for EACH,
        // solves the demand completely FRESH starting from "the board as it
        // would look right after that forced conversion" — so conversion
        // becomes part of target selection, not a disruption to route
        // around. GUARANTEED exactly realizable once found (see its doc
        // comment) — but correctness-first, not yet speed-tuned (User-
        // confirmed: optimize speed once it's confirmed working); each of
        // up to `conversionCandidates` (default 24) tried candidates costs
        // a full solve, so this can take several seconds to tens of
        // seconds depending on the board/demand.
        // --workers (P57, 2026-07-11, User-requested): distributes the
        // conversionCandidates loop across worker_threads via a persistent
        // pool (phone/parallel.js) — a small sequential prefix runs
        // in-process first (cheap insurance for the common case where an
        // early candidate already satisfies the demand), only fanning out
        // to K workers once that prefix is exhausted without success.
        // Measured live: no regression on easy/early-success boards, real
        // ~2-2.8x speedup at workers=4/8 on genuinely hard boards where
        // every candidate must be tried (171.6s -> 85.2s -> 61.6s). See
        // LESSONS.md L61/L62 for the two earlier designs that DIDN'T work
        // and why, before assuming a bigger workers count is automatically
        // better.
        const conversionCandidates = Number(argValue('--rearrange-conversion-candidates') ?? 0) || undefined;
        const convertOptions = {
          ...rearrangeOptions, convertType, convertCount,
          conversionCandidates,
          coverageMaxAttempts: Number(argValue('--rearrange-coverage-attempts') ?? 0) || undefined,
        };
        const convertResult = workers > 1
          ? await solveRearrangeConvertAwareParallel(board, convertOptions, workers)
          : solveRearrangeConvertAware(board, convertOptions);
        rearrangeDrags = convertResult.drags;
        const finalSim = BoardSimulator.resolve(convertResult.board.clone(), { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
        sol = {
          board: convertResult.board, score: finalSim.totalCombos * 4, comboCount: finalSim.totalCombos,
          firstCombos: finalSim.firstCombos, firstAttrCombos: finalSim.firstAttrCombos,
          firstRunes: finalSim.firstRunes, firstClearedByType: finalSim.firstClearedByType,
          chains: finalSim.chains,
          moves: rearrangeDrags.length > 0 ? ['rearranged'] : [],
          path: [{x: rearrangeDrags[0]?.startX ?? 0, y: rearrangeDrags[0]?.startY ?? 0}],
          startX: rearrangeDrags[0]?.startX ?? 0, startY: rearrangeDrags[0]?.startY ?? 0,
        };
        engine = convertResult.engine;
      } else {
        const rs = new RearrangeSolver(board, rearrangeOptions);
        const result = rs.solve();
        // Missed-demand check, mirroring the single-drag DoraSolver
        // escalation trigger (L58): must run against the REAL final board
        // (post-decompose), not an aspirational target.
        const rsClearTotals = t => board.grid.reduce((n, row) => n + row.filter(v => v === t || v === SHIELD_BASE + t || v === CURSE_BASE + t).length, 0);
        const demandMissed = sim =>
          (minFirstArg > 0 && (exactMode ? sim.firstCombos !== minFirstArg : sim.firstCombos < minFirstArg)) ||
          (minFirstAttr > 0 && (exactAttrMode ? sim.firstAttrCombos !== minFirstAttr : sim.firstAttrCombos < minFirstAttr)) ||
          (minFirstRunes > 0 && (exactRunesMode ? sim.firstRunes !== minFirstRunes : sim.firstRunes < minFirstRunes)) ||
          clearTypes.some(t => sim.firstClearedByType[t] < rsClearTotals(t)) ||
          firstWaveHaveTypes.some(t => sim.firstClearedByType[t] === 0);
        const realize = candidateResult => {
          const decomposed = decomposeRearrangement(board, candidateResult.board, candidateResult.movableCells);
          const sim = BoardSimulator.resolve(decomposed.board.clone(), { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
          return {decomposed, sim, missed: demandMissed(sim)};
        };
        let real = realize(result);
        let plannerEngine = null;
        if (real.missed) {
          const planner = new RearrangeCoveragePlanner(board, {
            sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes,
            clearTypes, firstWaveNoTypes, firstWaveHaveTypes, wantGroupType, wantGroupSize,
            minFirstRunes, exactFirstRunes: exactRunesMode,
            coverageMaxAttempts: Number(argValue('--rearrange-coverage-attempts') ?? 0) || undefined,
          });
          const planned = planner.solve();
          if (planned.solution) {
            const plannerReal = realize(planned.solution);
            if (!plannerReal.missed || plannerReal.sim.firstRunes > real.sim.firstRunes) {
              real = plannerReal;
              plannerEngine = `RearrangeCoveragePlanner(attempts=${planned.attempts})`;
            }
            if (plannerReal.missed) {
              console.log(`[TOS] PLANNER=${plannerEngine ? 'improved-but-still-short' : 'no-improvement'} constructed tiling still misses the demand (firstRunes=${plannerReal.sim.firstRunes})`);
            }
          } else {
            console.log(`[TOS] PLANNER=failed reason=${planned.reason} (constructed 1 candidate tiling, ${planned.attempts} backtracking attempts total; NOT a proof of infeasibility — try --rearrange-coverage-attempts for a wider search)`);
          }
        }
        rearrangeDrags = real.decomposed.drags;
        sol = {
          board: real.decomposed.board, score: real.sim.totalCombos * 4, comboCount: real.sim.totalCombos,
          firstCombos: real.sim.firstCombos, firstAttrCombos: real.sim.firstAttrCombos,
          firstRunes: real.sim.firstRunes, firstClearedByType: real.sim.firstClearedByType,
          chains: real.sim.chains,
          moves: rearrangeDrags.length > 0 ? ['rearranged'] : [],
          path: [{x: rearrangeDrags[0]?.startX ?? 0, y: rearrangeDrags[0]?.startY ?? 0}],
          startX: rearrangeDrags[0]?.startX ?? 0, startY: rearrangeDrags[0]?.startY ?? 0,
        };
        engine = plannerEngine ?? `RearrangeSolver(drags=${rearrangeDrags.length},movable=${result.movableCells.length})`;
      }
    } else if (minFirstRunes > 0) {
      sol = await solveDoraParallel(board, {
        beamWidth: Number(argValue('--beam') ?? 200),
        maxPath: Number(argValue('--max-path') ?? 30),
        sealedColumns: sealedCols,
        flags: hasFlags ? flagGrid : null, priorityCells,
        minFirstRunes, exactFirstRunes: exactRunesMode,
        minFirstAttrCombos: minFirstAttr, exactFirstAttrCombos: exactAttrMode,
        convertType, convertCount, wantGroupType, wantGroupSize,
        startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
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
        minFirstAttrCombos: minFirstAttr, exactFirstAttrCombos: exactAttrMode,
        convertType, convertCount, wantGroupType, wantGroupSize,
        startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
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
        minFirstAttrCombos: minFirstAttr, exactFirstAttrCombos: exactAttrMode,
        convertType, convertCount, wantGroupType, wantGroupSize,
        startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
      }, workers);
      engine = 'DoraSolver';
    }

    const missesTarget = () => exactMode ? sol.firstCombos !== minFirstArg : sol.firstCombos < minFirstArg;
    const attrMissesTarget = () => minFirstAttr > 0
      && (exactAttrMode ? sol.firstAttrCombos !== minFirstAttr : sol.firstAttrCombos < minFirstAttr);
    // DoraSolver's beam often can't gather a scattered scarce type into its
    // dissolving group(s), so clear-all MISSes; detect it to trigger the
    // constructive coverage planner (which CAN, unlike a wider beam).
    const clearAllMissed = () => {
      if (clearTypes.length === 0) return false;
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      // Count shielded/cursed cells of type t too (P30/P37: both dissolve
      // normally — shield forbids the per-color count reaching zero, curse
      // forbids the specific rune ever dissolving, but either way they're
      // still "owed" runes of that color for clear-all counting purposes).
      const totalsByType = t => board.grid.reduce((n, row) => n + row.filter(v => v === t || v === SHIELD_BASE + t || v === CURSE_BASE + t).length, 0);
      return clearTypes.some(t => sim.firstClearedByType[t] < totalsByType(t));
    };
    const firstWaveNoMissed = () => {
      if (firstWaveNoTypes.length === 0) return false;
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      return firstWaveNoTypes.some(t => sim.firstClearedByType[t] > 0);
    };
    const firstWaveHaveMissed = () => {
      if (firstWaveHaveTypes.length === 0) return false;
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      return firstWaveHaveTypes.some(t => sim.firstClearedByType[t] === 0) || sim.reserveViolated;
    };

    // Guarantee escalation: if beam search misses the first-combo target OR a
    // clear-all demand, the planner constructs it (or proves it impossible).
    // Not applicable to --rearrange (P50): RearrangeSolver already searches
    // permutations directly, and TargetPlanner's drag-PATH routing doesn't
    // apply to a multi-drag rearrangement — RearrangeSolver's own best-effort
    // result stands as-is (same "no dedicated planner yet" scope decision
    // documented on wantGroupType).
    if (!rearrangeMode && !maxMode && minFirstRunes === 0 && ((minFirstArg > 0 && missesTarget()) || attrMissesTarget() || clearAllMissed() || firstWaveNoMissed() || firstWaveHaveMissed())) {
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
        // Attr-only requests reuse the combo-count construction with Heart
        // excluded from color assignment (TargetPlanner.attrTarget), so the
        // planner needs a combo target of at least the attr demand.
        minFirstCombos: minFirstArg || minFirstAttr, exact: exactMode,
        minFirstAttrCombos: minFirstAttr, exactFirstAttrCombos: exactAttrMode,
        convertType, convertCount, wantGroupType, wantGroupSize,
        beamWidth: plannerBeam, maxPath: plannerMaxPath,
        startCells, endCells, fireRoute, twoMatch, clearTypes, firstWaveNoTypes, firstWaveHaveTypes, reserveTypes, noSolvableTypes, hazardPositions,
      };
      // Clear-all and first-wave-have coverage targets are independent
      // routing problems — shard them across the same worker pool; the
      // combo-target planner path stays sequential (it early-returns on the
      // first routed target).
      const planned = clearTypes.length
        ? await solveClearAllParallel(board, plannerOpts, workers)
        : firstWaveHaveTypes.length
          ? await solveHaveParallel(board, plannerOpts, workers)
          : new TargetPlanner(board, plannerOpts).solve();
      if (planned.solution) {
        sol = planned.solution;
        engine = clearTypes.length ? `TargetPlanner(clear-all,combos=${planned.solution.comboCount})`
          : firstWaveHaveTypes.length ? `TargetPlanner(first-wave-have,combos=${planned.solution.comboCount})`
          : `TargetPlanner(target#${planned.targetsTried})`;
      } else {
        console.log('[TOS] PLANNER=failed reason=' + planned.reason + (planned.reason === 'routing-failed'
          ? ` (targets exist; escalated routing up to beam=${plannerBeam} maxPath=${plannerMaxPath} (${planned.targetsTried} target-attempts total); retry with --beam ${plannerBeam * 2} and/or --max-path ${plannerMaxPath + 30})`
          : ' (demand provably impossible on this board)'));
      }
    }

    if (rearrangeMode) {
      console.log(`[TOS] SOLVE ms=${Date.now() - t0} engine=${engine} drags=${rearrangeDrags.length} first=${sol.firstCombos} firstAttr=${sol.firstAttrCombos} firstRunes=${sol.firstRunes} combos=${sol.comboCount} chains=${sol.chains} weight=${sol.score}`);
      // One [TOS] line per planned drag (R3: single-line KEY=value markers)
      // instead of a single PATH= — a rearrangement is inherently several
      // separate drags, not one path.
      rearrangeDrags.forEach((d, i) => {
        console.log(`[TOS] REARRANGE_DRAG_${i + 1}=` + d.path.map(p => `${p.x},${p.y}`).join(' '));
      });
    } else {
      console.log(`[TOS] SOLVE ms=${Date.now() - t0} engine=${engine} start=${sol.startX},${sol.startY} moves=${sol.moves.length} first=${sol.firstCombos} firstAttr=${sol.firstAttrCombos} firstRunes=${sol.firstRunes} combos=${sol.comboCount} chains=${sol.chains} weight=${sol.score}`);
      console.log('[TOS] PATH=' + sol.path.map(p => `${p.x},${p.y}`).join(' '));
    }

    // Post-drag board (sol.board — the raw arrangement right after the drag
    // completes, BEFORE any dissolve/gravity). Hazard/no-solvable markers are
    // POSITIONAL (stay with the cell, not the rune — P9/P22), so they're
    // read from the ORIGINAL `cells` recognition, not from sol.board itself.
    // Curse (P37, corrected P38) is DIFFERENT — it travels WITH the rune, so
    // its `&` marker below is decoded from the SOLVER board value (like
    // shield's `+`), not from the original cell — showing where the cursed
    // rune actually ends up POST-drag, which may differ from where the badge
    // was originally seen. Lets the User visually cross-check the plan
    // against what they observe in-game before confirming, and self-checks
    // (via the SAME mechanisms the solver itself is gated on, covering
    // EVERY cascade wave, not just the first) that the plan never dissolves
    // a hazard position or a cursed rune — a WARNING here would mean a real
    // algorithm bug, distinct from a drag-execution fidelity gap (see
    // PROJECT-FACTS P22/L34).
    cells.forEach((row, gy) => {
      console.log('[TOS] BOARD_AFTER_ROW' + gy + '=' + row.map((c, gx) => {
        if (c.hurricane) return 'Hurricane';
        const v = sol.board.get(gx, gy);
        const cursed = v >= CURSE_BASE;
        const shielded = !cursed && v >= SHIELD_BASE;
        const baseVal = cursed ? v - CURSE_BASE : (shielded ? v - SHIELD_BASE : v);
        const t = v === FROZEN ? 'Frozen' : (TYPE_NAMES[baseVal] ?? '?');
        return t + (shielded ? '+' : '') + (cursed ? '&' : '') + (c.edgeNoClear ? '$' : '') + (c.noSolvable ? '%' : '');
      }).join(','));
    });
    const afterSim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
    const firstWaveCells = afterSim.groups.slice(0, afterSim.firstCombos).flatMap(g => g.cells);
    console.log('[TOS] FIRST_WAVE_CLEARED=' + firstWaveCells.map(([x, y]) => `${x},${y}`).join(' '));
    if (afterSim.hazardViolated) {
      console.log('[TOS] WARNING=this plan dissolves a fire-hazard position in some wave — this should be impossible; please report with this board+path');
    }
    if (afterSim.shieldViolated) {
      console.log('[TOS] WARNING=this plan drops a color\'s shielded-rune count to zero in some wave — this should be impossible; please report with this board+path');
    }
    if (afterSim.curseViolated) {
      console.log('[TOS] WARNING=this plan dissolves a cursed rune in some wave — this should be impossible; please report with this board+path');
    }
    if (curseCells.length) {
      console.log('[TOS] CURSE_RESULT=' + (afterSim.curseViolated ? 'MISS' : 'ok'));
    }
    if (shieldCellsList.length) {
      const shieldTypesPresent = afterSim.shieldTotal.map((n, t) => ({ t, n })).filter(o => o.n > 0);
      console.log('[TOS] SHIELD_RESULT=' + shieldTypesPresent.map(o => `${TYPE_NAMES[o.t]}:${afterSim.shieldRemaining[o.t]}/${o.n}`).join(',') + (afterSim.shieldViolated ? ' MISS' : ' ok'));
    }
    if (afterSim.reserveViolated) {
      console.log('[TOS] WARNING=this plan drains a --first-wave-have reserve type below its own min-run in some wave — this should be impossible; please report with this board+path');
    }
    if (reserveTypes.length) {
      // remaining = original board count minus everything cleared across all
      // waves; reserve floor is the type's own min-run (2 for 2-match, else 3).
      const reserveDetail = reserveTypes.map(t => {
        const orig = board.grid.reduce((n, row) => n + row.filter(v => v === t || v === SHIELD_BASE + t || v === CURSE_BASE + t).length, 0);
        const remaining = orig - afterSim.totalClearedByType[t];
        return `${TYPE_NAMES[t]}:${remaining}/${isTwoMatch(t) ? 2 : 3}min`;
      });
      console.log('[TOS] RESERVE_RESULT=' + reserveDetail.join(',') + ' ' + (afterSim.reserveViolated ? 'MISS' : 'ok'));
    }

    // General empty-solution guard (P22/L34): unlike the start/end-pin abort
    // below, this fires even with NO pins set. hazardPositions is enforced
    // unconditionally now (not an opt-in demand), so it's possible — though
    // rare — for EVERY reachable arrangement within --max-path to violate it,
    // leaving no valid answer at all (DoraSolver returns the degenerate
    // moves=0 solution). Abort rather than send a no-op/undefined drag.
    if (sol.moves.length === 0 && !startCell && !endCells) {
      if (rearrangeMode) {
        console.log('[TOS] ABORT=no-rearrangement-found — the current arrangement is already the best RearrangeSolver could reach (or nothing to move); try a wider --rearrange-beam/--rearrange-steps (no touch sent)');
      } else {
        console.log('[TOS] ABORT=no-hazard-safe-path'
          + (hazardPositions.length > 0 || shieldCellsList.length > 0 || curseCells.length > 0
            ? ` — every reachable arrangement within --max-path ${Number(argValue('--max-path') ?? 30)} violates a fire-hazard, shield, or curse constraint; try a wider --beam/--max-path`
            : ' — no valid path found')
          + ' (no touch sent)');
      }
      return;
    }

    // Start/end pinning is a hard constraint: if the solver couldn't honor it
    // (end unreachable within --max-path, or nothing to seed), abort rather
    // than spin a path that ignores the pins. Checked before the first-wave
    // aborts so an impossible pin is reported as the root cause.
    if (startCell || endCells) {
      const first = sol.path[0], last = sol.path[sol.path.length - 1];
      const startOk = !startCell || (first.x === startCell.x && first.y === startCell.y);
      const endOk = !endCells || endCells.some(e => last.x === e.x && last.y === e.y);
      if (sol.moves.length === 0 || !startOk || !endOk) {
        console.log(`[TOS] ABORT=start-end required start=${startCell ? `${startCell.x},${startCell.y}` : 'any'} end=${endCells ? endCells.map(e => `${e.x},${e.y}`).join('|') : 'any'} but got start=${first.x},${first.y} end=${last.x},${last.y} moves=${sol.moves.length} — unreachable within --max-path ${Number(argValue('--max-path') ?? 30)} (raise --max-path, or relax --start/--end); no touch sent`);
        return;
      }
    }

    // Clear-all gate: recompute from the post-drag board (engine-independent
    // — planner solutions and max mode pass through here too). "trapped" =
    // required runes the drag LEFT in sealed/no-dissolve cells (scanned from
    // sol.board — the final arrangement), which is why the demand failed
    // there. The DEMAND TOTAL, however, must come from the ORIGINAL
    // recognized board (same as clearTypeTotals/CLEAR_ALL_TARGET/
    // clearAllMissed), NOT sol.board (L52, P48): "drags conserve runes" was
    // true for every prior feature (positions move, types don't) but
    // --convert breaks it — it actively changes rune TYPES mid-drag, so
    // counting the total from sol.board would silently inflate the demand
    // by however many extra runes the conversion created. User-confirmed
    // (2026-07-10): the demand is fixed at what was on the board BEFORE the
    // drag; runes your OWN --convert skill turns into the type are a bonus,
    // not an added requirement (clearing them is fine, just not required).
    if (clearTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      const detail = [], unmet = [];
      for (const t of clearTypes) {
        let total = 0;
        for (const row of board.grid) {
          for (const v of row) {
            if (v === t || v === SHIELD_BASE + t || v === CURSE_BASE + t) total++; // shielded/cursed runes of type t are owed too (P30/P37)
          }
        }
        let trapped = 0;
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 6; x++) {
            const v = sol.board.get(x, y);
            if (v !== t && v !== SHIELD_BASE + t && v !== CURSE_BASE + t) continue;
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
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
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

    if (firstWaveHaveTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      const missing = firstWaveHaveTypes.filter(t => sim.firstClearedByType[t] === 0);
      console.log('[TOS] FIRST_WAVE_HAVE_RESULT=' + firstWaveHaveTypes.map(t => `${TYPE_NAMES[t]}:${sim.firstClearedByType[t]}`).join(',')
        + (missing.length || sim.reserveViolated ? ' MISS' : ' ok'));
      if (missing.length > 0) {
        console.log('[TOS] ABORT=first-wave-have ' + missing.map(t => TYPE_NAMES[t]).join(',')
          + ' not dissolved in wave 1 (no touch sent; try a wider --beam and/or --max-path)');
        return;
      }
      if (sim.reserveViolated) {
        console.log('[TOS] ABORT=first-wave-have-reserve reserve type drained below its own min-run (no touch sent; try a wider --beam and/or --max-path)');
        return;
      }
    }

    if (noSolvableTypes.length > 0) {
      const sim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
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
    if (minFirstAttr > 0) {
      console.log(`[TOS] FIRST_ATTR_COMBOS_RESULT=${sol.firstAttrCombos}/${exactAttrMode ? '' : '>='}${minFirstAttr}` + (attrMissesTarget() ? ' MISS' : ' ok'));
      if (attrMissesTarget()) {
        console.log(`[TOS] ABORT=first-attr-combos firstAttr=${sol.firstAttrCombos} required=${exactAttrMode ? 'exactly ' : '>='}${minFirstAttr} (no touch sent; try a wider --beam and/or --max-path)`);
        return;
      }
    }
    if (wantGroupType !== null) {
      // Best-effort — checked across EVERY cascade wave (not just wave 1),
      // never aborts (User-requested: "best-effort, spin anyway").
      const wgSim = BoardSimulator.resolve(sol.board, { sealedColumns: sealedCols, flags: hasFlags ? flagGrid : null, twoMatch, noSolvableTypes, hazardPositions, reserveTypes: reserveTypes.length ? reserveTypes : null });
      const wgMet = wgSim.groups.some(g => g.type === wantGroupType && g.cells.length === wantGroupSize);
      console.log(`[TOS] WANT_GROUP_RESULT=${TYPE_NAMES[wantGroupType]}:${wantGroupSize}` + (wgMet ? ' ok' : ' MISS (best-effort, spinning anyway — try a wider --beam and/or --max-path)'));
    }

    if (dry) { console.log('[TOS] DRY_RUN=1 (no touch sent)'); return; }
    if (process.argv.includes('--confirm')) {
      await askEnter(rearrangeMode
        ? `[TOS] CONFIRM ${rearrangeDrags.length} drag(s) above, press Enter to spin (Ctrl+C aborts)... `
        : '[TOS] CONFIRM board+path above, press Enter to spin (Ctrl+C aborts)... ');
      // Staleness guard: the game may have moved on (attack animations, wave
      // transition) while waiting at the prompt — spinning a stale plan drags
      // on a board that no longer exists. Re-capture and re-solve on mismatch.
      // --no-stale-check (User-requested 2026-07-12) skips this: useful when
      // the User is confirming manually and knows the board hasn't actually
      // moved, but a false BOARD_CHANGED keeps kicking them back into a
      // fresh solve+confirm loop anyway (e.g. read jitter on a busy/animated
      // board, not a real change).
      if (!boardFile && !process.argv.includes('--no-stale-check')) {
        // quick=true (L53): skip the 18-frame electric-burst confirmation —
        // this check only needs to notice a GROSS change, not classify
        // electric cells precisely. Because of that, an electric cell on
        // either side is compared by electric-ness only (not exact type):
        // the quick single-frame read can't reliably confirm a shock's base
        // element (that needs the burst this mode deliberately skips), so
        // comparing exact labels there would false-positive BOARD_CHANGED
        // on every confirm whenever an electric rune is present.
        const fresh = readBoardFromScreen(true);
        const same = fresh.every((row, gy) => row.every((c, gx) => {
          const orig = cells[gy][gx];
          if (c.electric || orig.electric) return c.electric === orig.electric;
          return cellLabel(c) === cellLabel(orig);
        }));
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
    const dwellCells = [...priorityCells, ...hazardDwellCells];

    if (rearrangeMode) {
      // Several separate drags, one MaaTouch session (executeMultiDragPath
      // avoids paying the ~1.5s boot cost per drag). No --drag-from/dwell
      // considerations apply here (both already rejected at parse time for
      // --drag-from; hazardDwellCells still meaningfully applies per-drag).
      // Default raised 150 -> 350ms (2026-07-11, live-confirmed the old
      // 150ms let fast drags (--move-ms 60, 22-drag run) bleed into each
      // other: the game read consecutive drags as one continuation, so the
      // REAL board diverged from BOARD_AFTER_ROW* starting partway through
      // and every later drag compounded the error. This gap is independent
      // of --move-ms — raising it does not slow down movement WITHIN a
      // drag, only the recognition gap BETWEEN drags. Override with
      // --rearrange-pause-ms if 350 is still not enough (or provably more
      // than needed) on your device.
      const pauseMs = Number(argValue('--rearrange-pause-ms') ?? 350);
      const screenPaths = rearrangeDrags.map(d => gridPathToScreenPath(d.path, stepsPerCell, dwellCells));
      const dragMs = await executeMultiDragPath(screenPaths, stepMs, screenshotAfterSpin, pauseMs);
      console.log(`[TOS] SPIN=done drags=${rearrangeDrags.length} points=${screenPaths.reduce((n, p) => n + p.length, 0)} moveMs=${(stepMs * stepsPerCell).toFixed(1)} dragMs=${Math.round(dragMs)} pauseMs=${pauseMs} (moveMs excludes corner dwells; dragMs sums all drags, excludes inter-drag pauses)`);
    } else {
      // --drag-from: prepend the card-to-board segment so the WHOLE motion
      // (card -> board -> solved path) is one continuous drag, no lift.
      // Extra turn-dwell applies near electric cells (touching is forbidden)
      // AND hazard cells (touching is fine; dwell here is purely to keep the
      // ACTUAL swap sequence matching the verified-safe planned one, per the
      // hazardDwellCells comment above).
      const screenPath = dragFromCol !== null
        ? [...cardDragPrefix(dragFromCol, stepsPerCell), ...gridPathToScreenPath(sol.path, stepsPerCell, dwellCells)]
        : gridPathToScreenPath(sol.path, stepsPerCell, dwellCells);

      const dragMs = await executeTouchPath(screenPath, stepMs, screenshotAfterSpin);
      console.log(`[TOS] SPIN=done points=${screenPath.length} moveMs=${(stepMs * stepsPerCell).toFixed(1)} dragMs=${Math.round(dragMs)} (moveMs excludes corner dwells)`);
    }

    // Effect check: a spin should change the board (matches or at least the
    // drag's swaps). Identical board = input was ignored (dialog, enemy
    // phase, defeat screen) — say so instead of silently moving on. Grouped
    // under --no-final (User-requested 2026-07-10): both this and the settle
    // wait below are POST-spin verification reads, not the spin itself, so
    // one flag skips all of it for a fast exit.
    if (!boardFile && !process.argv.includes('--no-final')) {
      await sleep(1200);
      const after = readBoardFromScreen();
      const unchanged = after.every((row, gy) => row.every((c, gx) => cellLabel(c) === cellLabel(cells[gy][gx])));
      if (unchanged) console.log('[TOS] NO_EFFECT=true (board identical after spin — input blocked? dialog/enemy phase/defeat screen)');
    }
  }

  if (!dry && !checkOnly && !afterSpinKill && !process.argv.includes('--no-final')) {
    console.log('[TOS] WAIT=post-spin settle (cascades/skyfall/attack animations); pass --no-final to skip this report');
    const fin = await waitForStableBoard(30000, !!argValue('--shock-bases'));
    fin.forEach((row, gy) => {
      console.log('[TOS] FINAL_ROW' + gy + '=' + row.map(cellLabel).join(','));
    });
  }
}

main().catch(e => { console.error('[TOS] ERROR=' + e.message); process.exit(1); });
