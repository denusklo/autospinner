# 02 — Externalized Judgment Matrix (D)

> Purpose: turn "experienced intuition" into checklists a weak model can compare against by eye. Each entry = check question + perfect positive example + typical negative example.
> When to use: when stuck, when about to declare completion, when tempted to keep retrying — come here and check against the table first, then act.

> Shared authority: [`docs/shared-harness/REPOSITORY-POLICY.md`](../../docs/shared-harness/REPOSITORY-POLICY.md) owns cross-runtime completion, review, retry, and circuit-breaker invariants. This file supplies Claude-specific examples and may be stricter but never weaker.

## Matrix One: Change-Path Signals (stop and switch paths instead of retrying in place)

### R1-1 Second change to the same function with no new evidence
- **Question**: Is the function I'm changing this time the same one I changed in the last failed attempt? Do I have new evidence I didn't have last time?
- **Verdict**: same function + no new evidence → wrong direction. Action: stop changing logic; first insert diagnostic logs to obtain new evidence.
- **Perfect positive example**: Drag drops the rune. 1st attempt: slow down the mousemove interval → still drops. Before the 2nd attempt, add `[TOS] DRAG_STEP={step,x,y,t}` to the drag loop in `content.js`, ask the User to run once, and discover the event coordinates are correct but the actual event interval is 0ms (setInterval being compressed) → the root cause is the timer, not the speed.
- **Typical negative example**: 1st attempt raises the interval from 50ms to 100ms — no effect; 2nd attempt 200ms; 3rd attempt 500ms — all three guess at parameters of the same hypothesis without ever verifying the hypothesis itself.

### R1-2 The fix needs more and more special cases
- **Question**: Does my fix delete the wrong assumption, or add the Nth if-branch to protect the wrong assumption?
- **Verdict**: one fix introduces ≥2 special-case branches to protect the original logic → the original assumption may be entirely wrong. Action: go back one level and restate the problem.
- **Perfect positive example**: Color recognition misreads. Instead of adding one RGB-tolerance set each for "dark theme" and "combo dimming", switch to "sample 3×3 pixels, take the median, then compare" — one mechanism replaces three patches.
- **Typical negative example**: In `rgbToRuneType`, adding one `if (r>130 && r<142 && ...)` per misread type; the fourth special case starts contradicting the first.

### R1-3 Cannot state a verification signal
- **Question**: After this change, can I write "if fixed, we will observe X; if not fixed, we will observe Y"? Are X and Y concrete command outputs or log lines?
- **Verdict**: cannot write it → you are guessing, not fixing. Action: design an observable signal first (Node test or `[TOS]` log), then touch the code.
- **Perfect positive example**: "After modifying `MatchFinder`, run `node verify.js`; board #3's combo count should change from 2 to 4, and the output for the other 9 boards stays unchanged."
- **Typical negative example**: "I adjusted the scoring weights; this should find better paths." ("Better" is unobservable — this is the taste trap of 00-DIAGNOSIS section 6; run an A/B comparison.)

### R1-4 Starting to blame the platform instead of your own code
- **Question**: Am I about to write "it might be a Chrome / simulator / timing issue"? Do I have direct evidence for that conclusion?
- **Verdict**: blaming the environment without direct evidence → 90% of the time the direction is wrong. Action: first write a 10-line minimal reproduction script proving the environment issue exists; if you can't prove it, go back to checking your own code.
- **Perfect positive example**: Suspecting MouseEvents are not delivered → first ask the User to run a minimal snippet that sends only 3 events and logs `[TOS] EVENT_ACK`, confirm the events actually fire, rule out the environment, then go back to checking the coordinate math.
- **Typical negative example**: "The simulator may be intercepting synthetic events; let's switch injection methods" — then 100 lines get rewritten and the original bug remains (it was actually a miscalculated clientX).

## Matrix Two: Definition of Done (DoD) — all boxes checked before saying "done"

Every checkmark must carry an **evidence pointer** (command output, file:line, or the User's exact words). A checkmark without evidence = not checked.

- [ ] **DoD-1 Acceptance criteria checked one by one**: every acceptance criterion in the work order has PASS evidence.
- [ ] **DoD-2 Verification was "actually run"**: the Node command output is actually pasted, not described (see CLAUDE.md R2). A browser guide plus expected `[TOS]` output is explicitly `PARTIALLY VERIFIED`, not observed live behavior.
- [ ] **DoD-3 Isolated acceptance passed**: a distinct fresh-context, read-only verifier reported PASS from disk state (rules 01, section 5). There is no line-count or file-count exemption.
- [ ] **DoD-4 No collateral damage**: `git diff` contains only changes related to this task; when changing `algorithm.js`, the untouched solvers' outputs on the test boards are identical to before the change.
- [ ] **DoD-5 Knowledge written back**: new application facts → targeted PROJECT-FACTS.md sections; application/Claude history → LESSONS.md; cross-runtime workflow pitfalls → `docs/codex-harness/lessons/PITFALLS.md` (CLAUDE.md R5).
- **Perfect positive example**: "DoD-2 evidence: `node verify.js` output `10/10 boards OK, combos: [4,3,5,...]` (pasted above). DoD-4 evidence: diff is only algorithm.js:210-241."
- **Typical negative example**: "Changes completed and tests passed; code quality is good." (Zero evidence pointers — none of the five checkmarks count.)

## Matrix Three: Circuit-Breaker Conditions (stop autonomous work, ask the User)

If any one triggers → stop and ask using the fixed format: **"current state in one sentence / blocker in one sentence / 2-3 concrete options (each with its cost) / my recommendation"**.

- **C1 Retries exhausted**: the escalation chain is complete and the strongest Claude tier failed two materially different attempts for the same retry key. → Circuit-break with the full failure trail attached.
- **C2 Requirement ambiguity with major divergence**: the same requirement sentence has ≥2 readings, and the rework cost of going the wrong way > the cost of asking.
  - Perfect positive example: "'Make it spin faster' could mean (a) shorten the drag animation time (b) shorten the solver computation time (c) reduce the number of movement steps. The three change different files — please choose."
  - Typical negative example: Guessing (a) and finishing it, when the User wanted (b). (When the ambiguity is small, reversible, and obvious from context, do not ask — over-asking is also a failure.)
- **C3 Irreversible or out-of-bounds operations**: deleting files, `git push`, publishing externally, touching any file outside the repo (including global settings). → Always ask first.
- **C4 Real senses required**: the task's acceptance fundamentally requires "seeing the browser screen" and no `[TOS]` log can proxy for it. → Produce a test guide and hand it to the User; do not pretend to be able to verify.
- **C5 Taste/business decisions**: "does it look good", "is it worth doing" questions. → Per 00-DIAGNOSIS section 6: give options with costs; do not decide for the User.

## Standard Response at the Taste Limit (weak models must memorize this)

When facing an unquantifiable "better": **step one** — translate the adjective into 1-2 measurable proxy metrics; **if it translates** → build an A/B comparison table and let the numbers speak; **if it doesn't translate** → this is exactly the C5 circuit-breaker point; give the User options. The forbidden third path: pick one by feel and write "optimized".
