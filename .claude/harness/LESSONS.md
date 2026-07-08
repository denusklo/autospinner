# LESSONS — Pitfall Records (append-only)

> Write format and compaction rules in `04-KNOWLEDGE-PROTOCOL.md` sections 2 and 4. When an error feels familiar, scan this file's titles first.
> L1–L5 are seed entries backfilled on 2026-07-07 from the 2025-11 development history (~/.claude/history.jsonl); dates are approximate.

## L1 2025-11 Picked the wrong canvas: the page has both BarCanvas and DragCanvas
- Symptom: cannot read the board / all read pixels are wrong
- Root cause: the page has two canvases and the wrong one was picked at first; the correct target is DragCanvas
- Lesson: next time on a canvas-based page, enumerate all canvases (id, size) before choosing; do not assume there is only one
- Evidence: content.js:49-91 now matches DragCanvas first, falling back to largest area
- Affected files: PROJECT-FACTS F3

## L2 2025-11 Guessing the Light rune's color signature was wrong; live measurement was right
- Symptom: Light runes persistently misread as other types
- Root cause: the model inferred "yellow is probably (255,255,0)"; the measured cell-center pixel is (136,85,0)
- Lesson: next time for color/pixel/coordinate constants, always demand measured values (have the User run a sampling log); writing "common-sense values" into code is forbidden
- Evidence: content.js:182 `Light, r:136, g:85, b:0` annotated as live-measured calibration
- Affected files: PROJECT-FACTS F4

## L3 2025-11 Dragging too fast drops the rune early
- Symptom: path planned 0,0→2,0 but the rune actually dropped halfway; the User asked back "maybe you are moving too fast?"
- Root cause: mousemove point spacing too large / frequency wrong; the simulator judged a release
- Lesson: next time with synthetic-event-driven UI, treat "event interval and step distance" as first-class parameters, observable via logs; do not hard-code and forget
- Evidence: content.js:413-441 is now 16ms point-by-point mousemove
- Affected files: PROJECT-FACTS F6/F7

## L4 2025-11 Global-variable archaeology failed; ended up with canvas pixel reading
- Symptom: `window.board / boardData / gameBoard...` all missing; multiple rounds of attempts fruitless
- Root cause: the simulator does not expose board globals (probably inside a closure)
- Lesson: next time "guessing page-internal variable names" goes one round without result, switch immediately to external observation (pixels/DOM); do not keep expanding the guess list
- Evidence: content.js:246-259 keeps Method 1 as fallback; the main path is now readBoardStateFromCanvas
- Affected files: none

## L5 2025-11 The human-pasted-log blind loop is the biggest token black hole (meta-lesson)
- Symptom: many rounds of "User pastes 100+ console lines → model guesses → changes → paste again"; the same symptom iterated 3+ rounds
- Root cause: the model cannot see the browser and had no structured reporting contract, effectively using the User as a low-frequency, high-noise sensor
- Lesson: next time for any browser-side change, first establish the `[TOS] KEY=value` single-line log contract (CLAUDE.md R3), and prefer moving extractable logic into algorithm.js for Node verification
- Evidence: 00-DIAGNOSIS.md section 2 (history.jsonl sampling)
- Affected files: none (already institutionalized as R2/R3)

## L6 2026-07-07 Post-execution logger compared incomparable scoring scales
- Symptom: User saw "Expected score: 42, Actual score: 250, Difference: 208" and could not tell whether the run succeeded. It had in fact executed perfectly (verified by Node replay of the logged path: 27/30 cells matched; the 3 mismatches were dimmed Dark runes misread as Fire during the clear animation).
- Root cause: logFinalBoardState still used the legacy MatchFinder score (points scale) while the solver reports DoraSolver weight (different unit); it also used the double-counting legacy combo counter, so "Light x4 + Light x3" were the same four runes counted twice.
- Lesson: next time two scoring systems coexist, never print them in the same comparison — compare boards cell-by-cell (planned vs read), not scores. When a metric changes, grep for every consumer of the old metric in the same commit.
- Evidence: content.js logFinalBoardState (now rewritten to emit [TOS] RESULT with execErrors vs animArtifacts); user log 2026-07-07.
- Affected files: PROJECT-FACTS F4 updated (confirmed Dark/Fire r=153 misread pair).

## L7 2026-07-07 PowerShell `>` corrupts binary stdout from native commands (adb screencap)
- Symptom: `adb exec-out screencap -p > file.png` produced a 5,223,576-byte file for what is a ~2.7MB PNG (≈2x size); PNG unreadable.
- Root cause: Windows PowerShell 5.1 redirection decodes native stdout as text and re-encodes as UTF-16LE, doubling/mangling every byte. Not adb's fault.
- Lesson: next time binary data must cross adb, never use PowerShell `>`; write to a device file then `adb pull` (or spawn adb from Node with stdout piped to a file).
- Evidence: corrupted pull 5223576 bytes vs `adb pull` clean 2745303 bytes, session 2026-07-07.
- Affected files: PROJECT-FACTS P4 records the safe capture path.

## L8 2026-07-07 Extrapolated color signature silently misread Light+thorn as Fire+thorn (repeat of L2's root cause)
- Symptom: `--rounds 2` round 2 timed out "board did not settle"; dry run showed (5,0) read as Fire* while the screen showed a gold Light+thorn rune, and (2,2) UNKNOWN d=78 (a new "enhanced" white-sparkle Water variant).
- Root cause: two thorn signatures were EXTRAPOLATED (base×0.55) instead of measured; actual Light+thorn (118,98,52) landed nearer Fire+thorn (129,61,53) than the guess (107,79,6). A wrong signature fails silently; only a missing one triggers the refuse-to-spin guard.
- Lesson: next time a color variant has not been observed live, leave it OUT of SIGNATURES so the unknown-guard fires and prints the measured rgb/dark% — never ship a guessed constant (same rule as L2, now for the phone channel).
- Evidence: [TOS] UNKNOWN_CELLS=(2,2)d=78rgb=118,193,239; board-sample.js row0 col5=(118,98,52)d37, session 2026-07-07.
- Affected files: PROJECT-FACTS P5 updated (measured Light+thorn + enhanced Water; missing-variant policy).

## L9 2026-07-07 Fixing timer precision broke the drag — the old slack was load-bearing
- Symptom: after replacing sleep-per-point (Windows overshoot → real ~35ms/point) with deadline scheduling (exact 16ms/point), the real game dropped the held rune after 3-4 of 23-29 planned moves (counter deltas 500→497, 497→493). The identical nominal parameters had always worked before.
- Root cause: the game drops the rune on large per-event jumps (36px at fast cadence). The sloppy timers accidentally kept the effective speed at ~150-190ms/move, inside the game's tolerance; precise 80ms/move at 36px steps is outside it. Same 80ms/move with 18px steps (10 points/cell) executed a full 24-move first=5 path and cleared the stage.
- Lesson: next time timing/precision infrastructure improves, re-verify every empirically-tuned threshold that was calibrated under the old behavior (P7 counter check per speed change); and when a drag speed fails, try finer interpolation before slowing down — the threshold is per-event distance, not path speed.
- Evidence: [TOS] SPIN msPerMove=50/80 + counter screenshots 500→497→493; fine-step run cleared the stage, session 2026-07-07.
- Affected files: PROJECT-FACTS P8 rewritten (speed/step-distance table).

## L10 2026-07-07 L9's step-distance hypothesis was wrong — the real culprit was adb transport bursts (fix: pace on the device)
- Symptom: fine 18px steps @ 80ms/move (L9's fix) also dropped the rune (5/28 moves, counter 500→495); worse, undelivered touch events from killed runs replayed later as phantom moves (next counter delta 27 for a 15-move path).
- Root cause: PC-side pacing (sleep AND deadline-scheduled) is meaningless because stdin-over-adb/USB coalesces writes into bursts; the game sees stalls + clustered jumps. Event timing must be enforced where events are injected.
- Lesson: next time timing matters across a transport, embed the timing IN the payload (minitouch `w <ms>` waits, whole script sent upfront) instead of pacing the sender; and after killing a touch-injection process, assume leftover events may still fire — re-verify the counter baseline before the next measurement.
- Evidence: device-paced runs counter-exact 29/29 @80ms and 27/27 @50ms (468→439→412) vs PC-paced 5/28; session 2026-07-07.
- Affected files: PROJECT-FACTS P8 rewritten (device-paced dispatch is now the hard rule).

## L11 2026-07-07 MaaTouch has no `w` wait — the "device-paced timing" of L10 never existed (and the kill-timer caused stuck touches)
- Symptom: rune occasionally stayed held after a finished spin. Investigation: a script of `w 100`x20 (2s nominal) finished in ~0ms; `w 2000` between down/up executed instantly (process exit 264ms).
- Root cause: MaaTouch v1.1.0 ignores `w` — every "paced" script actually injected contiguously at driver speed (the game accepts this; that's why counters matched exactly). The stuck touch was the p.kill() timer racing MaaTouch's boot: killing the adb session discards unconsumed script including the final `u 0`. Also: stdin EOF kills the remote mid-script (102ms for a 2s script), so streaming+closing is equally unsafe.
- Lesson: next time timing/protocol behavior is assumed, MEASURE it before building on it (a wait that doesn't wait is silent); for run-to-completion semantics over adb, redirect stdin from a device FILE and treat process self-exit as the completion proof — never a kill timer, never stdin EOF.
- Evidence: maat-w-test.js exit 264ms code=137; EOF test exit 102ms; L9/L10's "speed limit" narrative retired.
- Affected files: PROJECT-FACTS P8 rewritten again; phone/autospin.js executeTouchPath rewritten (file-redirect + self-exit + rescue-release).

## L12 2026-07-07 Truncated drags were ELECTRIC-RUNE interrupts, not touch timing — and flickering rune states need multi-frame recognition
- Symptom: in 星斗珠盤·火, every drag registered only 0-4 of 12-29 planned moves across three different dispatch designs (instant, PC-paced, file-scripted), spawning two wrong theories (L9 speed limits, frame sampling). Meanwhile a 2-move spin registered ZERO.
- Root cause: the stage's electric runes interrupt the spin when touched or passed through, and their flickering white-cyan glow classified as "Water"/"enhanced Water", hiding them from recognition. Every truncation point mapped exactly onto a misread electric cell — including the 0-move run which STARTED on one. Additionally, single-frame hue voting misidentified the base element ~40% of frames (arcs cover all sub-patches in some frames).
- Lesson: next time drags truncate at consistent counts, map the truncation cells against the recognized board BEFORE touching dispatch code — an interrupting rune state is one misread away; and for any animated/flickering rune state, pool recognition evidence across multiple frames instead of trusting one capture.
- Evidence: truncation analysis (paths hit "Water" at exactly moves 4/3/0); flicker probe (wood cells read pure blue in 2 of 5 frames); post-fix live spin 29/29 moves + first-wave electric clear + 161M damage, 2026-07-07.
- Affected files: PROJECT-FACTS P11 added; P8's pacing rationale corrected in code comments.

## L13 2026-07-07 Arc-flare bleed created GHOST electric detections one cell off — the drag then hit the real, unmarked shock
- Symptom: User watched the hand grab/pass shock runes although every planned path avoided all recognized electric cells. Consecutive runs "saw" the shock at (3,1), then (4,1), then (4,2) — interpreted first as the shock moving (it never moves except gravity/touch — User stated).
- Root cause: electric arcs flare BEYOND the cell border; a single-frame whiteness test sometimes fires on the neighbor while the true shock's own center reads dim that frame. Recognition then marked the neighbor, left the real shock unmarked, and the solver routed straight through it. 8-frame probe: real shocks are white ~8/8 frames; ghosts are 1-frame transients.
- Lesson: next time a rune STATE is detected from glow/animation, require PERSISTENCE across frames (white in >=2 of 3), not presence in one — union alone imports ghosts, single-frame alone mislocates. And when "the obstacle moved" contradicts the game's rules, suspect the detector before inventing new mechanics.
- Evidence: multi-shock-probe.js — 8/8 frames electric={(4,2),(1,3),(2,3)}, (3,1)=(30,178,39) pure Wood every frame; user runs 1-2 had paths crossing the unmarked (4,2) 3x/2x, 2026-07-07.
- Affected files: PROJECT-FACTS P11 updated (persistence rule, relaxed thresholds g>215/b>205).

## L14 2026-07-08 Dark-type shocks (magenta arcs) invisible to the green-based whiteness rule — needed element-agnostic detection
- Symptom: dark shock runes at (4,0)/(4,2) read as Heart; board was heart-heavy and the plan built on a wrong board (user caught it before Enter).
- Root cause: electric detection required high GREEN (assumed cyan arcs). Dark shocks glow MAGENTA-white (r+b high, green swings 135-207), failing the g>215 test. Element-specific rule doesn't generalize across shock base colors.
- Lesson: next time detecting an animated overlay across variants, key on the INVARIANT (electric = ≥2 channels near-white + frame flicker >25, since arcs of any hue light ≥2 channels and all normal/enhanced runes are frame-stable ≤15) rather than one color family. The flicker test also cleanly rejects the enhanced-Dark near-miss (225,77,237) that passes the ≥2-channel candidate rule.
- Evidence: dark-shock-probe.js — (4,0)/(4,2) swing (221,135,254)↔(243,207,254), frame delta 50-59; all other cells delta 0-15; darkbase-probe darkest patches (50,20,82)(79,37,148) → purple family. Post-fix dry run: both read Dark^, path avoids both, 2026-07-08.
- Affected files: PROJECT-FACTS P11 rewritten (element-agnostic candidate + flicker confirmation + purple-family base rule).

## L15 2026-07-08 Light-type shock bases are pixel-unreadable (glare); use frame-CONSISTENCY to refuse, plus a manual override
- Symptom: 3 Light shocks read as Water/Dark/Fire across successive captures (all wrong; all are Light). Adding a yellow-detection rule made it confidently wrong instead of refusing.
- Root cause: a Light shock's white-cyan-yellow glare is so bright the darkest sub-patches still saturate; the residual base tint flips family frame-to-frame. No single-capture color rule can separate "wood shock" from "light shock that looks woodish this frame."
- Lesson: when a signal is intrinsically unstable, the reliable discriminator is CONSISTENCY not a better threshold — classify each frame independently and refuse (-1) unless frames agree (verified-stable Wood/Water/Dark agree every frame; Light/Fire flip). Pair auto-detect with a manual override for the unreadable cases rather than chasing a perfect heuristic (R4: stopped after the yellow-rule strike). Also: overrides applied AFTER waitForStableBoard must be tolerated BY it (allowUnknownShocks) or live mode dead-ends on the refuse.
- Evidence: light-shock-probe two runs gave blue-dominant then yellow-dominant for the same cell; --shock-bases l live spin counter 338→316 (exact 22 moves), 2026-07-08.
- Affected files: phone/autospin.js (per-frame electricBase + --shock-bases + waitForStableBoard allowUnknownShocks); PROJECT-FACTS P11.

## L16 2026-07-08 TEMPORAL MINIMUM cracks the "unreadable" bright shock — arcs are additive, so min-over-frames reveals the base
- Symptom: L15 concluded Light shock bases were intrinsically unreadable (refuse + manual override). User pushed: "can we extract the signature? take as many screenshots as you want."
- Root cause of earlier failure: single/few-frame reads see base+arc (additive glare) which flips the apparent hue. The base is invariant; the glare is what varies.
- Lesson: for an ADDITIVE transient overlay (glow, glare, specular flicker), take the per-pixel TEMPORAL MINIMUM across many frames — it strips the overlay and leaves the base, where a few frames' average or consistency-vote cannot. Then subtract the lowest channel to remove any residual white floor and read the pure hue. This turned all 6 shock bases from "refuse" into reliable auto-detection. Frame count matters: min must converge (10 too few → Light residual g/r sinks toward Fire; ~18-20 stable).
- Evidence: temporal-min bases separated all 6 elements cleanly (Wood(22,121,16)…Light(102,61,1)…); Light shocks residual g/r~0.45 vs Fire 0.11; live auto both shocks Light^ weight 91, 2026-07-08.
- Affected files: phone/autospin.js electricBase rewritten (temporal min + hue tree), 18-frame burst; PROJECT-FACTS P11.

## L17 2026-07-08 "Too fast drops the rune" was a stdin-flush bug, not a game speed limit — busy-wait starved libuv so events shipped as one burst
- Symptom: --move-ms 200 (20ms/pt) "untraceable" drop; 210 (21ms/pt) worked. Looked like a sharp game threshold at ~205ms/move.
- Root cause: executeTouchPath busy-waited to each deadline. When per-point lead <= 20ms (i.e. fast speeds) the `if(lead>20) sleep` branch was skipped, so the loop NEVER awaited — libuv never flushed the stdin pipe, Node batched every write, and adb delivered them to the device as a 0.4ms burst (measured via dumpsys RecentQueue). The game saw one instant jump and dropped the rune. At 21ms the sleep branch fired, yielding/flushing per point (device spacing 19ms).
- Lesson: a CPU busy-wait in an async pipeline silently blocks I/O flushing — if you must spin to a deadline, YIELD each spin (`await new Promise(setImmediate)`) so pending writes drain. Verify transport timing at the DESTINATION (dumpsys event ages), not just the sender's write timestamps — they diverged completely (PC 20ms, device 0.4ms).
- Evidence: timing-inspect.js — stepMs=20 device spacing 0.4ms (bug) → 17.9ms (after setImmediate yield); PC-side spacing 20.0ms in both.
- Affected files: phone/autospin.js executeTouchPath busy-wait now yields via setImmediate; PROJECT-FACTS P8.

## L18 2026-07-08 Enhanced (white-sparkle) Heart misread as an electric rune, blocking --start on it
- Symptom: `--start=2,1` aborted "start-unpickable" — (2,1), a normal Heart, was recognized as `Heart^` (electric), which sets NO_PICKUP. User confirmed it is a plain Heart.
- Root cause: TWO bugs stacked. (1) The electric confirmation `candFrames>=2 && (maxDelta>25 || meanMin>90)` fired on `meanMin>90` even with no flicker (maxDelta=7). An enhanced Heart measured (244,172,210): a glow candidate (r,b over threshold) with all channels high — the `meanMin>90` fallback wrongly assumed "no enhanced rune lifts all channels". (2) After removing that flag, the not-electric fallback called `classify()`, whose own `isElectricGlow` early-return hands back the type:0 placeholder → the Heart then misread as **Water**.
- Lesson: flicker (maxDelta) is the ONLY reliable electric discriminator — never infer electric from brightness/meanMin (enhanced runes are bright too). And a helper that returns a placeholder type behind a guard must expose a way to bypass that guard (classify(stats, skipGlow)) or the placeholder leaks wherever the guard is re-checked. Verify recognition fixes on the LIVE board with a burst probe (probe-electric.js pattern), not by reasoning about thresholds.
- Evidence: probe on live board — (2,1) mean=(244,172,210) maxDelta=7 candFrames=18/18; real Hearts (229,92,168) maxDelta≤3; after fix BOARD_ROW1 reads ...,Heart,... and --start=2,1 --end=4,4 solves start=2,1 end=4,4.
- Affected files: phone/autospin.js classify(skipGlow) + electric decision (flicker-only); PROJECT-FACTS P5/P11.
- ⚠️ UNVERIFIED after fix: real electric-rune detection (no shock on the test board). Flicker-only matches P11's measured ~60/frame swing, but confirm on a real shock stage next time one is loaded.

## L19 2026-07-08 "Bigger beam → fewer combos" was a measurement artifact, not a bug
- Symptom: `--clear-all heart` + both start/end pins returned only 1 combo. A beam sweep looked pathological — 200→5, 800→6, 1600→1 combos ("wider beam does worse", which should be impossible) — screamed bug. Chased it with a scoring change (clearAllMetBonus) that changed nothing.
- Root cause: DoraSolver returns `pick = bestQualified ?? best`. When nothing satisfies the hard demand (clear-all + both pins), it falls back to `best`, which IGNORES the demand. The small-beam "5/6 combo" results were UNMET fallbacks autospin would then ABORT — not valid solutions. Comparing raw comboCount without checking constraint satisfaction compared real clear-all solutions against fallbacks. Measured correctly (firstClearedByType>=total): monotonic — beam 1600→1, 8000→3, 16000→4, all clearing all hearts. No bug; a tight constraint just needs a wide beam.
- Lesson: when A/B-ing solver outputs, ALWAYS report constraint-satisfaction next to the objective — a `bestQualified ?? best` fallback silently violates the demand and out-scores real solutions on the raw metric. One wasted (reverted) code change came from trusting comboCount alone. Confirm the metric measures what you think before theorizing a bug (02 matrix R1-3).
- Evidence: scratchpad clean-evidence.js — beam800 "6c" flagged clearsAllHearts=false (FALLBACK); beam1600/8000/16000 = 1/3/4c all clearsAllHearts=true (1.9s/24s/48s).
- Affected files: none (clearAllMetBonus experiment reverted; algorithm unchanged) — behavioral note only.

## L20 2026-07-08 clear-all MISS is a beam-width problem, NOT a planner problem — and the abort hint was backwards
- Symptom: `--clear-all dark` + `--end 5,0` MISSed (3/4 darks) at beam 3200→5000 and maxPath 200→400 (one run took 168s). The abort message advised "try --beam 800 --max-path 40" — smaller, which never helps.
- Root cause: clearing all 4 scattered darks needs them gathered into one dissolving line; that clear-all-satisfying state only enters the beam above a width threshold. Below it, DoraSolver returns the fallback `best` (9 combos, 3/4 — aborts). Beam 8000 crosses the threshold: 4/4 cleared AND 8 combos, maxPath 60, ~27s. A long maxPath (400) does NOT help clear-all and costs ~10x time.
- Tried and REVERTED (two-strikes): (1) clearAllMetBonus feasibility-gate rescoring — neutral. (2) Extending TargetPlanner to CONSTRUCT clear-all coverage targets (straight dark-lines + extra triples) then route them — routeToTarget can't fully realize a multi-cell coverage target AND land on the end pin (routing-failed on 24/24 targets, 175s). The construct-then-route approach hits a routing ceiling with pins; not viable without a denser router.
- Lesson: for a clear-all MISS, raise --beam (8000, then 16000) and keep --max-path ~60 — do not reach for the planner or a longer path. When DoraSolver "misses a hard demand", first check whether a wider beam simply crosses the threshold before building new machinery (cheaper and it worked here). Always give correct escalation advice in abort messages — the wrong hint cost real user time.
- Evidence: scratchpad clearall-what-works.js / maxpath-test.js — end 5,0: beam 5000/maxPath 400 → 3/4 (168s); beam 8000/maxPath 60 → 4/4 + 8 combos (27s). Planner end-pin: routing-failed 24 targets, 175s.
- Affected files: phone/autospin.js clear-all abort hint corrected (→ wider beam, keep maxPath 60); algorithm.js unchanged (both experiments reverted).

## L21 2026-07-08 clear-all CLUMPS runes into one big group (1 combo) — split them with --first-combos N+
- Symptom: `--clear-all dark` (6 darks) cleared all 6 but as ONE 6-rune group = 1 combo, "wasting" a combo (two 3-groups would be 2 combos / more damage). A wider beam (8000, 16000) did NOT split them.
- Root cause: the clear-all steering rewards required runes cleared AND adjacent same-color pairs (pairPotential), so it actively CLUMPS the darks together (more adjacency = higher score); the scoring only mildly prefers 2 groups (+2 weight vs the 6-group's size bonus), not enough to overcome the clumping bias, and the split arrangement is more constrained so the beam doesn't stumble onto it.
- Lesson: to make clear-all produce MULTIPLE combos from the required color, add `--first-combos N+` — it rewards first-wave combo COUNT, which is the "prefer more groups" signal clear-all lacks. Measured: `--clear-all dark --first-combos 5+` split a [6] blob into [3,3] and raised total combos 6→8 (and was faster). This is a flag combination, not a code fix — reach for it before touching solver scoring.
- Evidence: scratchpad dark-firstcombos.js — clear-all only: total6 first3 darks[6]; +first-combos 5+: total8 first6 darks[3,3]; CLI --board dry-run reproduced (8 combos, Dark 6/6 ok, end 5,3).
- Affected files: phone/autospin.js --clear-all help text (usage tip added); no logic change.

## Why the constructive clear-all planner extension was abandoned (answer to a recurring question)
The idea: have TargetPlanner CONSTRUCT a target board (every required rune placed into specific cells forming dissolving lines, plus extra combo groups) then route a drag to it. It fails because routeToTarget only accepts a path that realizes ALL target cells simultaneously AND leaves the held rune exactly on the end pin — for a 6+-cell coverage target that state almost never occurs within the move budget (routing-failed on 24/24 targets, 175s). DoraSolver has no such trouble because it maximizes combos incrementally and accepts ANY arrangement that clears the required runes — so the beam search (wide --beam) + --first-combos steering is the working path, not a constructive planner.
