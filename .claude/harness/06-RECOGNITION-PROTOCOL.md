# 06 — Visual Recognition Calibration Protocol (H)

> Readers: whoever handles a User report of a new visual pattern on the board (a new overlay, marker, or status effect not yet in SIGNATURES/EDGE_HAZARD_SIGNATURES/etc). Purpose: turn "there's a new hazard" into a working, verified recognition + solver-wiring change without the multi-hour ad-hoc back-and-forth it took the first few times (see LESSONS L27-L33). This is a checklist, not a rulebook — skip a step only if it's genuinely inapplicable, not because it's slow.

## 0. Trigger

The User reports a board pattern that isn't recognized, is misread, or needs a new solving constraint — e.g. "there's a new overlay", "this rune type isn't being read correctly", "we should not dissolve X". Anything that starts with "take a screenshot and look" belongs here.

## 1. Capture and inspect (before writing any code)

1. Screenshot via **PowerShell**, not the Bash tool — `adb shell screencap -p /sdcard/x.png` + `adb pull` (LESSONS L23: Git Bash mangles `/sdcard/...` paths).
2. Look at the full board first for context, then crop/zoom the specific cell(s) in question. Use Python/PIL for precision:
   - Crop a generous margin, upscale 2-3x with `Image.NEAREST` (preserves pixel edges).
   - For pinpointing exact coordinates, overlay a labeled grid (every 10-20px) before reading pixel positions off the image — do not eyeball raw screenshot coordinates, they're wrong by 10-50px routinely.
3. Read the Read tool's image back — confirm what you're actually looking at before measuring anything.

## 2. Clarify semantics with the User BEFORE writing recognition code

A visual pattern is not self-explanatory. Ask (or infer from context and confirm) all of:

| Question | Why it matters | Determines |
|---|---|---|
| Is this POSITIONAL (specific cells) or TYPE-GLOBAL (one element, board-wide)? | Wrong model = wrong solver wiring entirely | `CELL_FLAGS`/`sealedColumns` (positional, P9) vs `noSolvableTypes`/`firstWaveNoTypes` (type-global) |
| Is the forbidden outcome a HARD BLOCK (physically impossible) or a CONSEQUENCE (physically possible, but bad if it happens)? | Both may need the same solver constraint, but confirms you're modeling the right game rule, not just guessing | Doesn't change the code much, but changes what you tell the User the fix does |
| Can the cell be TOUCHED / DRAGGED THROUGH, or is touching itself forbidden? | These need DIFFERENT fixes at the drag-execution layer (dwell-to-avoid vs dwell-to-settle) — confusing them wastes a whole fix cycle (L33) | Whether `gridPathToScreenPath` needs the cell in its avoid-list vs its settle-list (currently unified, but the REASONING must be right) |
| Can it appear ANYWHERE, or only in fixed positions? | A pattern that "always" appears in one spot may later appear anywhere (L30 — fire hazard was thought edge-only, wasn't) | Whether detection can be gated to specific columns/cells or must scan the whole board |
| Is it a STAGE-WIDE CONSTANT (one value for the whole battle) or does it vary per-cell? | A constant is better resolved by ASKING the User (who can read boss skill text) than by pixel-guessing per cell (L29) | Whether to build a full per-cell classifier or just an explicit CLI-overridable default |

Do not proceed to calibration until you have real answers, even approximate ones — wrong assumptions here cost more time than asking.

## 3. Ground truth, never guessed

- Never label a calibration sample from visual impression alone if the User can confirm it — ask for specific cell coordinates and their true values (same convention as board coords: `col,row` 0-indexed).
- If your own pixel-distance math and your visual impression disagree, that's a signal to ask, not to pick one (L29's Heart/Water case: numbers said one thing, the crop looked like another — both untrustworthy alone).
- Treat "I inferred this from icon shape" as WEAKER than an explicit User confirmation — mark it as such in code comments (see existing Wood/Water card-badge comments as the pattern).

## 4. Measure at multiple sampling regions before picking one

Don't assume the whole-cell average is the right sampling region. Test several and compare against ground truth:

- Whole-cell average (existing `cellStats`, half=55).
- A narrow centered patch (half=20-35) — useful when an overlay leaves a visible gap showing pure base color (worked for the fire overlay, P22).
- Corners only (`cellCornerStats`-style, dx/dy > threshold) — useful when the overlay is centered and corners show less-obscured base color.
- If NONE of these separate two candidate types cleanly at ANY tested size (L31's Heart/Water case), that's a real sensor limit — say so, don't keep tuning thresholds hoping one more will work.

## 5. Check brightness-invariance before trusting a threshold

Capture the SAME known board state at least twice, ideally minutes apart (lighting/animation phase drifts naturally). Compare:

- Raw RGB distance to your candidate signatures.
- Chromaticity distance (`chroma(rgb)` = each channel / sum) — same principle as `electricBase`'s glare-floor subtraction (P11/L16).

If raw RGB gives inconsistent nearest-matches across the two captures but chromaticity is stable, use chromaticity (L28). If NEITHER is stable, the overlay likely has no clean "peek-through" region — don't force a whole-cell-average approach on it (see step 4).

## 6. Threshold discipline

- A threshold sitting within ~10% of your measured true-positive cluster is a knife-edge that WILL flip-flop across captures (L31 — `darkPct>0.28` vs a measured 0.272-0.303 cluster). Scan the WHOLE board (all 30 cells, not just the ones you expect to match) to find the true-positive cluster AND the closest false-positive candidate before picking a number — leave real margin on both sides.
- Match display precision to the value's actual scale. A chromaticity distance (~0.01-0.1) printed with `.toFixed(0)` always shows "0" — indistinguishable from a genuinely suppressed/confident zero, and will send you chasing the wrong bug (L31). Use a per-scale formatter (see `distStr`).
- Reuse the project's unknown-guard convention: refuse and print the measured value rather than silently misclassify (L8). A refusal that blocks settling is recoverable (retune, recalibrate); a silent wrong classification is not.

## 7. Audit for overlap and duplicate classification paths

- Can this new overlay co-occur on the same cell as an EXISTING one (edge-hazard + no-solvable-ring, L30)? Test explicitly — don't assume mutual exclusivity. If they can coexist, decide an explicit priority order (usually: whichever classification is more reliable/structural wins) and make sure the loser doesn't clobber the winner.
- Grep for EVERY place a cell gets classified, not just the primary recognition loop. This project has at least one secondary reclassification pass (the electric-burst confirmation loop in `readBoardFromScreen`) that duplicated classification logic and silently drifted out of sync as new overlay layers were added to the primary loop only (L32). When adding a new layer, either update every classification path or — better — refactor shared logic into one function first (`classifyBoardCell`).

## 8. Wire into the solver correctly

- Positional, cell-specific "never dissolve here": `CELL_FLAGS.NO_DISSOLVE` (reuses existing sealed-column machinery, P9). Confirm live via `CELL_FLAGS_ROWS` in the log.
- Type-global, board-wide "never dissolve this element": `noSolvableTypes` (or `firstWaveNoTypes` for first-wave-only). Confirm live via the `NO_SOLVABLE_RESULT=` gate.
- If the User states or implies the affected cells/types could be given directly (stage-wide constant), add a CLI override (`--no-solvable-type=X` is the existing pattern) rather than relying purely on auto-detection.

## 9. Drag-execution fidelity (only if "must not X" could be violated by imprecise dragging)

- A solver plan being provably correct (independently verified via `BoardSimulator.resolve`) does not guarantee the PHYSICAL drag reproduces it exactly — the held rune trails the finger and can cut corners at speed (P11). If a live-observed failure contradicts a verified-safe plan, suspect execution fidelity before suspecting the algorithm (L33).
- Decide precisely what the corner-cut risk actually is for THIS hazard:
  - Touching itself is forbidden (like electric cells) → the cell needs to be in the AVOID list.
  - Touching is fine, but an off-plan swap risks an accidental bad outcome → the cell still benefits from extra dwell (settle before turning), for a DIFFERENT reason. Get this distinction right with the User before writing the fix (L33 — the first framing attempt here was wrong and caught only by asking).

## 10. Verify end-to-end, live

1. `node -c phone/autospin.js` (syntax).
2. `node verify.js` (regression — only strictly required if `algorithm.js` changed, but harmless/cheap to always run).
3. Reconstruct the exact board + path from a real log through `BoardSimulator.resolve` directly (see the verify_hazard.js pattern used in L33) to independently confirm the new constraint holds, rather than trusting the CLI's own self-report.
4. Live `--check` and/or `--dry` run against the real device, at least twice, to confirm classification is STABLE (not just correct once).
5. If a drag-execution fix was involved, reconstruct the dwell logic standalone against the real path to confirm the fix actually fires where expected.

## 11. Document immediately (R5 — do not batch to end of session)

- New/updated fact → `PROJECT-FACTS.md`, next available `P{{n}}`, with live verification evidence in the `|` field.
- Any pitfall hit along the way (wrong assumption costing ≥2 rounds, a confusing debug trace, a corrected mid-fix framing) → `LESSONS.md`, next `L{{n}}`, per `04-KNOWLEDGE-PROTOCOL.md` section 2's five-field format.
- If a PROJECT-FACTS entry from an earlier pattern turns out to need updating (e.g. "recognition-only, not yet wired" becomes stale once wiring lands), update it in place rather than leaving stale text next to new text.

## 12. Debugging pitfall reminder

If a live trace looks FLATLY IMPOSSIBLE (a value set true, then immediately read as false/absent, with no code path in between that could change it) — suspect the LOGGING MECHANISM first (mixed `console.log`/`console.error` streams interleave unpredictably when piped through filters), not the target code. Switch to a single ordered sink (`fs.appendFileSync` to one file) before spending time on race-condition or caching theories (L32).
