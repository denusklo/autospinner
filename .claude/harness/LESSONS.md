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
