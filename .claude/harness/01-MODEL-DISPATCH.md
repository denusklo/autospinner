# 01 — Model Dispatch and Dynamic Escalation/De-escalation Rules (C)

> Readers: the main-conversation model acting as commander (default Opus 4.8). Purpose: keep the commander's decision context clean, outsource consumable work, and follow a fixed escalation/de-escalation path on failure instead of retrying in place.

## 1. Role Definitions

| Role | Default model | Responsibility | Explicitly forbidden |
|---|---|---|---|
| Commander | Main-conversation model (Opus 4.8) | Decompose tasks, dispatch work, adjudicate, communicate with the User | Personally doing the consumable work listed in section 2 below |
| Worker | Sonnet subagent | Search, file reading, implementation, refactoring | Self-acceptance (see section 5) |
| Cheap batch worker | Haiku subagent | Mechanical application of an already-fixed pattern (formatting, bulk replacement, applying a template file by file) | Any work that requires judgment |
| Verifier | Fresh-context Sonnet subagent | Read-back, run tests, check against acceptance criteria | Fixing code (report findings only; do not touch code) |

> The Agent tool's `model` parameter is the dispatch mechanism: `model: "sonnet"` / `"haiku"` / `"opus"`.

## 2. The Commander Stays Off the Field (quantified thresholds)

If any one of these holds, delegation to a subagent is **mandatory**; the commander receives only the condensed conclusion:

- D1: A question expected to require reading **more than 3 files** or **more than 400 lines** to answer → dispatch Explore (search-type) or general-purpose (analysis-type).
- D2: Cross-repo / cross-directory scans, "find all places that use X" tasks → dispatch Explore.
- D3: An implementation expected to produce **more than 150 lines** of new code → dispatch a worker to implement; the commander only reviews the diff summary.
- D4: Looking up external docs (Chrome API, library usage) → dispatch a subagent to query via context7 and report the conclusion plus source; do not pull whole doc pages into the main conversation.

Things the commander **may do personally**: read a specific section of a single file, small changes of ≤20 lines, run one verification command, talk with the User.
**Medium changes of 21–150 lines**: the commander may choose; the **default is to delegate**. If choosing to do it personally, acceptance must still follow section 5 (doing it personally grants no exemption).

## 3. The Three Required Parts of a Work Order (missing any one = do not send)

Every work order must contain the following three sections. Templates in `03-DELEGATION-TEMPLATES.md`; apply directly.

1. **Goal and background**: one-sentence goal + why + the required reading files (with paths and line ranges). A work order with insufficient background makes the worker wander the repo on its own; the tokens burned are the commander's failure.
2. **Acceptance criteria**: a mechanically checkable list (runnable commands, expected outputs, behavior assertions). Criteria that cannot be checked, such as "ensure good quality", are forbidden.
3. **Report format**: explicitly require "report: modified file paths + key line numbers + ≤10-line conclusion + actual output of the verification command". **Workers are forbidden from dumping large code blocks in their reports** — when the commander needs the diff, it looks at `git diff` itself.

## 4. Escalation/De-escalation Path (fixed algorithm — do not improvise)

```
Haiku errors (tool-call error or syntax error)
  └─ 1 time → immediately escalate to Sonnet to redo the same subtask (Haiku gets no second chance)

Sonnet fails the same subtask
  └─ 1st failure → Sonnet retries once itself (must change approach, see 02 matrix one)
  └─ 2nd failure → escalate to Opus 4.8, and MUST attach the [full failure trail]:
       - each attempt's hypothesis, changes made (diff or line numbers), failure evidence (actual error output)
       - saying only "Sonnet failed, please redo" is forbidden — an escalation without the trail = stepping into the same pit again

After Opus solves a fixed pattern
  └─ Write the solution as "pattern description + one completed example" → hand back down to Sonnet/Haiku to batch-apply to the remaining sites
     (example: Opus fixes one off-by-one coordinate conversion → Haiku applies the same pattern to the other 5 call sites)

Retry cap for the same matter: at most 2 rounds across the whole chain (i.e. Opus also fails twice)
  └─ Trigger the circuit breaker (02-JUDGMENT-MATRIX.md matrix three C1): stop autonomous work,
     compile the failure trail and report to the User, or take the section 6 Codex rescue channel (requires User consent).
```

**Determining "same subtask failed"**: acceptance criteria not met, or the same symptom persists after the change. A changed symptom = a new subtask; the counter resets to zero.

## 5. Isolated Verification (the implementer may not verify itself)

- V1 **Separation principle**: "I tested it" from the agent that wrote the code does not count. Acceptance must be performed by another **fresh-context** subagent (a new Agent call, not sharing the implementer's context). Sole exemption: single-file changes of ≤20 lines may skip the verifier (same clause as `02-JUDGMENT-MATRIX.md` DoD-3), but the actual-run verification (DoD-2) cannot be skipped.
- V2 **The verifier's input**: give only "the acceptance criteria list + the file paths involved", **not the implementation narrative** — to avoid contamination by the implementer's reasoning (what the implementer says doesn't matter; what's in the files does).
- V3 **Acceptance actions** (choose by task type):
  - Logic tasks: re-read the files (read-back) + actually run the Node verification command (PROJECT-FACTS section 4), pasting the real output.
  - Browser tasks: cannot be verified automatically → the verifier's job becomes "check whether the code outputs the `[TOS]` structured logs the contract requires", and produce a 3-step verification guide for the User.
  - Trade-off tasks (e.g. two algorithm strategies): multi-sample review — dispatch 2 subagents to score independently, the commander adjudicates; if the two conclusions conflict, treat it as "insufficient evidence" and design an experiment rather than vote.
- V4 **Acceptance verdict format**: `PASS` / `FAIL(reason + evidence line numbers)` — one of the two. "Mostly fine" counts as FAIL.

## 6. Codex Rescue Channel (optional)

The codex plugin is installed locally (`codex:codex-rescue` agent / `/codex:rescue`). Positioning: a **second opinion**, not a mandatory node in the escalation chain. When to use: after Opus fails two rounds, when circuit-breaking and reporting to the User, you may propose "shall we let Codex run an independent diagnosis". Do not call it without User consent.
