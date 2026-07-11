# 03 — Standardized Delegation Prompt Templates (E)

> Usage: when the commander calls the Agent tool, copy the matching template, fill in the `{{...}}` blanks, and send it as the prompt.
> `[optional]` sections may be deleted whole; all other sections **must never be omitted**. The templates already embed the "three required parts of a work order" from rules 01, section 3.

> Shared authority: [`docs/shared-harness/REPOSITORY-POLICY.md`](../../docs/shared-harness/REPOSITORY-POLICY.md) owns cross-runtime scope, retry, review, evidence, and reporting invariants. These templates supply Claude-specific model and Agent syntax.

## Shared Rules

- Model selection: search/implementation/refactoring/review → `model: "sonnet"`; mechanical batch work with an already-fixed pattern → `model: "haiku"`; escalated redo → `model: "opus"` (failure trail must be attached).
- Every work order **must** end with a "Report format" section. A worker report exceeding 30 lines or containing large code blocks = an unacceptable report; the commander should demand a re-summary, not accept it as-is.
- Paths in work orders must always be absolute (`C:\Projects\autospinner\...`).

---

## T1 Search/Research (use Explore agent or general-purpose + sonnet)

```
[Goal] Answer this question: {{one-sentence question}}
[Background] {{why we need to look this up; known leads}}
[Scope] Search only {{directory/file list}}; expected relevant keywords: {{keyword1, keyword2}}
[Forbidden] Do not modify any files. Do not read {{irrelevant directories, e.g. .git, icon*.png}}.
[Acceptance criteria]
- The question has a direct answer, or an explicit "not found; ruled out locations X, Y, Z"
- Every conclusion carries a file path:line number
[Report format] (total length ≤15 lines)
- Answer: {{...}}
- Evidence: file:line list, one sentence of explanation each
- Open items: {{...or "none"}}
```

## T2 Feature Implementation (sonnet)

```
[Goal] {{one-sentence feature description}}
[Background] Read C:\Projects\autospinner\CLAUDE.md, then search and read only the targeted C:\Projects\autospinner\.claude\harness\PROJECT-FACTS.md section that owns this task.
Files and targeted facts sections relevant to this task: {{file:line-range and facts-section list; the commander must think this through first}}
[Known constraints] {{e.g.: manifest.json loads algorithm.js before content.js; no external dependencies may be introduced}}
[Implementation requirements]
- Modify only {{allowed list}}; do not touch any other file
- If browser behavior is involved: must output [TOS] KEY=value structured logs (CLAUDE.md R3)
[Acceptance criteria] (mechanically checkable)
1. The output of {{command}} contains {{expected}}
2. {{behavior assertion, e.g.: the existing combo counts of boards #1-#10 are unchanged}}
3. git diff contains only files in the allowed list above
[Report format] (total length ≤15 lines; pasting large code blocks is forbidden)
- Changes: file:line-range list, one sentence each
- Verification output: {{actual command output verbatim — this is the only permitted "verbatim paste"}}
- Outstanding items/risks: {{...or "none"}}
```

## T3 Code Refactoring (sonnet; batch application of an already-fixed pattern may drop to haiku)

```
[Goal] {{refactoring content}}, behavior must be completely unchanged
[Background] {{why refactor}}. Baseline behavior snapshot: first run {{baseline command, e.g.: node verify.js}} and record the output.
[Scope] {{files allowed to be modified}}
[Acceptance criteria]
1. After refactoring, the output of {{baseline command}} is identical to before (character for character)
2. No new TODOs / commented-out dead code
3. {{structural assertion, e.g.: rgbToRuneType has only one return path left}}
[Report format] (≤12 lines)
- Whether baseline output before/after refactoring is identical: identical (attach both outputs) / not identical (that is a FAIL; explain the difference)
- Changes: file:line-range list
```

## T4 Code Review (sonnet; use two independent reviewers for important changes)

```
[Goal] Review {{diff scope, e.g.: git diff HEAD or file:line-range}}
[Background] This change claims to {{purpose}}. The acceptance criteria are {{acceptance criteria from the original work order}}.
[Review focus] (in order; spend the time on the first two)
1. Correctness: boundaries (board edges x∈[0,6) y∈[0,5)), coordinate system (grid[y][x], y before x), off-by-one
2. Whether it truly satisfies the acceptance criteria, or only appears to
3. Collateral damage: did it touch logic it should not have
[Forbidden] Do not suggest style/naming changes unless they cause a real misreading risk.
[Report format] One line per finding: `[BLOCKER|MINOR] file:line one-sentence problem + one-sentence suggestion`; final line summarizes `Verdict: APPROVE or REQUEST_CHANGES`. If no findings, report `Verdict: APPROVE (checked: {{what was checked}})`.
```

## T5 Fresh-Context Acceptance (sonnet; the executor of rules 01, section 5)

```
[Identity] You are the verifier. You did not participate in the implementation — this is deliberate. Do not ask anyone for implementation background.
[Goal] Independently determine whether the following acceptance criteria hold:
{{list every acceptance criterion from the original work order}}
[Actions]
1. read-back: personally re-read {{files involved}}; trust no retelling
2. actual run: execute {{verification command}}; go by the output you see yourself
3. [optional] If browser behavior is involved: check whether the code outputs the [TOS] logs the contract requires, and produce a ≤3-step manual verification guide for the User
[Report format] Per criterion: `Criterion N: PASS(evidence) or FAIL(evidence + line numbers)`; finally `Overall verdict: PASS or FAIL`. "Mostly fine" = FAIL.
```
