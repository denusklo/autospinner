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
