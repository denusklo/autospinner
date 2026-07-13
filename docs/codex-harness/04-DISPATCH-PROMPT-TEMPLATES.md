# Dispatch Prompt Templates

**Status:** COMPLETE
**Purpose:** Provide directly reusable, bounded work orders that do not require architectural improvisation.
**Intended readers:** Commanders preparing subagent work and reviewers checking dispatch quality.
**Source-of-truth status:** Canonical prompt forms; policy is defined in [02-MODEL-DISPATCH-PROTOCOL.md](02-MODEL-DISPATCH-PROTOCOL.md).
**Related files:** [dispatch protocol](02-MODEL-DISPATCH-PROTOCOL.md), [judgment matrix](03-JUDGMENT-EXTERNALIZATION-MATRIX.md), [custom agents](../../.codex/agents/)

## 1. Shared rules for every template

- Replace every `{{field}}`; do not send unresolved placeholders.
- State `none` when a field is intentionally empty.
- Keep the assignment bounded to `C:\Projects\autospinner`.
- Include `RETRY_BUDGET = 2 materially different attempts per tier`; a low/fast Tier C tool/path/syntax error escalates after one failure.
- Require the exact headings `Status`, `Summary`, `Evidence`, `Commands`, `Files changed`, `Unresolved risks`, and `Recommended next action`; `Summary` has one to ten bullets.
- Under `Commands`, require `Command`, integer `Exit code`, and `Result`; state `none` explicitly where permitted.
- Forbid complete logs, large code dumps, secrets, unsupported completion claims, and recursive delegation.
- A report is not independent acceptance unless it comes from the distinct read-only `fresh-context-reviewer` role.
- Use only the approved role routes: Commander/planning/review Sol `max`, coding Sol `high`, exploration/search Terra `high`, and small mechanical Luna `medium`.

## 2. Template — Research and repository search

```text
ROLE: harness-explorer (gpt-5.6-terra, high; read-only)

PARENT OBJECTIVE: {{parent objective}}
CONTEXT: {{why this search matters and how the result will be used}}
IN-SCOPE PATHS: {{exact files/directories}}
OUT-OF-SCOPE PATHS: {{exact exclusions}}
KNOWN FACTS: {{verified facts with references}}
UNKNOWNS: {{questions this search must resolve}}
REQUIRED TOOLS: {{rg/read-only Git/targeted file reads/etc.}}
FORBIDDEN TOOLS: {{write tools, network tools, broad dumps, etc.}}

ACCEPTANCE CRITERIA:
1. {{observable answer 1}}
2. {{observable answer 2}}
3. Every conclusion cites a path and line or a command and exit code.

VERIFICATION COMMANDS: {{read-only commands}}
RETRY BUDGET: 2 materially different attempts per tier; low/fast Tier C escalates after one tool/path/syntax failure.
EVIDENCE FORMAT: concise table of finding | evidence | confidence.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: any write requirement; secret exposure risk; AP-01, AP-06, AP-07, AP-08, or repository-boundary mismatch.

Do not dump complete files or logs into the parent context. Do not propose a fix unless explicitly asked.
```

## 3. Template — Feature implementation

```text
ROLE: coding-worker (gpt-5.6-sol, high); never harness-worker

PARENT OBJECTIVE: {{parent objective}}
CONTEXT: {{approved user-visible behavior and why it matters}}
IN-SCOPE PATHS: {{owned files}}
OUT-OF-SCOPE PATHS: {{application/harness/other exclusions}}
KNOWN FACTS: {{current execution path, baseline, constraints}}
UNKNOWNS: {{bounded implementation uncertainties}}
REQUIRED TOOLS: {{edit tool and exact verification tools}}
FORBIDDEN TOOLS: {{destructive commands, dependency changes, network, etc.}}

ACCEPTANCE CRITERIA:
1. {{behavioral result}}
2. {{scope/result}}
3. {{regression result}}
4. No file outside the in-scope list changes.

VERIFICATION COMMANDS:
- Baseline: {{command and expected marker}}
- Focused: {{command and expected marker}}
- Regression: {{command and expected marker}}

RETRY BUDGET: 2 materially different attempts per tier; report current retry key and count.
EVIDENCE FORMAT: requirement-to-result table plus concise diff summary.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: acceptance ambiguity; patch budget exceeded; test/guard bypass; new dependency; AP-01 through AP-11 as applicable.

Do not perform architecture changes. Do not paste full code or logs. Do not claim final acceptance; a fresh-context reviewer follows.
```

## 4. Template — Code refactoring

```text
ROLE: coding-worker (gpt-5.6-sol, high); never harness-worker

PARENT OBJECTIVE: {{parent objective}}
CONTEXT: {{why the refactor is needed and behavior that must not change}}
IN-SCOPE PATHS: {{exact files/symbols}}
OUT-OF-SCOPE PATHS: {{excluded behavior and files}}
KNOWN FACTS: {{baseline behavior and proven pattern}}
UNKNOWNS: {{remaining mechanical questions}}
REQUIRED TOOLS: {{search/edit/test tools}}
FORBIDDEN TOOLS: {{feature additions, dependency changes, broad formatters, etc.}}

ACCEPTANCE CRITERIA:
1. Public/observable behavior remains identical under {{checks}}.
2. {{duplication/structure objective}} is achieved.
3. Diff stays within {{file and line budget}}.
4. No opportunistic cleanup.

VERIFICATION COMMANDS:
- Before edit: {{baseline command}}
- After edit: {{same comparison command}}
- Regression: {{canonical command}}

RETRY BUDGET: 2 materially different attempts per tier.
EVIDENCE FORMAT: before/after behavior matrix, diff stat, and changed symbols.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: behavior changes; fourth unrelated file; >200 changed application lines without approved budget; AP-01, AP-05, or AP-09.

Do not dump full files or logs. Do not let the refactor become a feature.
```

## 5. Template — Code review

```text
ROLE: fresh-context-reviewer (gpt-5.6-sol, max; read-only)

PARENT OBJECTIVE: {{what change is being reviewed}}
CONTEXT: {{acceptance criteria and risk level; exclude implementer rationale}}
IN-SCOPE PATHS: {{diff/files/commit range}}
OUT-OF-SCOPE PATHS: {{excluded areas}}
KNOWN FACTS: {{baseline and authoritative requirements}}
UNKNOWNS: {{specific risks to resolve}}
REQUIRED TOOLS: {{read-only Git, search, parsers, tests}}
FORBIDDEN TOOLS: {{all edits, destructive commands, implementation defense before findings}}

ACCEPTANCE CRITERIA:
1. Check correctness, scope, security, regressions, tests, and documentation.
2. Re-run {{commands}} independently.
3. Rank every finding Critical/High/Medium/Low with evidence.
4. State whether a literal lower-capability model could execute the instructions.

VERIFICATION COMMANDS: {{exact independent commands}}
RETRY BUDGET: 2 materially different diagnostic attempts per tier; no repair edits.
EVIDENCE FORMAT: severity | evidence | impact | required correction.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: a write is required; evidence is unavailable; circuit breaker CB-03, CB-04, CB-08, or CB-10 applies.

Do not modify files. Do not dump complete logs or code. Report findings before seeing the implementer's response.
```

## 6. Template — Fresh-context acceptance

```text
ROLE: fresh-context-reviewer (gpt-5.6-sol, max; mandatory, read-only)

PARENT OBJECTIVE: {{approved task}}
CONTEXT: Judge only disk state, objective, and acceptance criteria. Do not trust the parent summary.
IN-SCOPE PATHS: {{all changed files plus required source-of-truth files}}
OUT-OF-SCOPE PATHS: {{unrelated User work}}
KNOWN FACTS: {{initial status/baseline only}}
UNKNOWNS: {{whether each completion row passes}}
REQUIRED TOOLS: read-only file reads, git diff/status, {{verification commands}}
FORBIDDEN TOOLS: edits, writes, destructive Git, implementation defense before initial findings

ACCEPTANCE CRITERIA:
1. Evaluate TC-01 through TC-10.
2. Check paths, precedence, retry counts, undefined terms, and literal executability.
3. For batches >=10, inspect at least 3 representative samples plus aggregate validation.
4. Return zero unresolved Critical/High findings for PASS.

VERIFICATION COMMANDS: {{exact commands}}
RETRY BUDGET: 2 materially different diagnostic attempts per tier.
EVIDENCE FORMAT: completion-row table plus severity-ranked findings.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: missing objective; missing disk access; required external infrastructure unavailable.

Do not modify files. A second pass in the implementer's context is not fresh-context acceptance.
```

## 7. Template — Failure escalation

```text
ROLE: {{stronger Tier C | Tier B | Tier A}}

PARENT OBJECTIVE: {{original bounded goal}}
CONTEXT: The prior tier exhausted {{attempt count}} for retry key {{goal/check/symptom}}.
IN-SCOPE PATHS: {{paths}}
OUT-OF-SCOPE PATHS: {{paths}}
KNOWN FACTS: {{facts and evidence already ruled out}}
UNKNOWNS: {{remaining hypotheses}}
REQUIRED TOOLS: {{different tool/smaller reproduction/authoritative source}}
FORBIDDEN TOOLS: identical failed command without new evidence; writes until diagnosis is updated

FAILURE TRACE:
- Goal: {{goal}}
- Attempts: {{attempts}}
- Commands and exit codes: {{commands}}
- Exact errors: {{errors}}
- Files touched: {{files or none}}
- Current hypotheses: {{hypotheses}}
- Evidence ruled out: {{evidence}}
- Session-owned changes present: {{changes}}

ACCEPTANCE CRITERIA: {{what observation resolves the retry key}}
VERIFICATION COMMANDS: {{new commands}}
RETRY BUDGET: {{remaining attempts at this tier; maximum 2}}
EVIDENCE FORMAT: hypothesis | experiment | result | disposition.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: tier budget exhausted; User circuit breaker; destructive or out-of-repo action.

Do not repeat the same attempt under a different explanation. Do not dump complete logs.
```

## 8. Template — Mechanical batch application after a proven pattern

```text
ROLE: harness-worker (gpt-5.6-luna, medium) or another explicitly approved small-mechanical role

PARENT OBJECTIVE: {{batch objective}}
CONTEXT: Tier A/B proved pattern {{pattern}} on {{proof sample and evidence}}.
IN-SCOPE PATHS: {{explicit non-overlapping batch}}
OUT-OF-SCOPE PATHS: {{all other files}}
KNOWN FACTS: {{frozen transformation and invariants}}
UNKNOWNS: {{none, or stop and escalate}}
REQUIRED TOOLS: {{mechanical edit/search/check tools}}
FORBIDDEN TOOLS: pattern redesign, architecture decisions, new dependencies, parallel overlapping writes

ACCEPTANCE CRITERIA:
1. Apply only {{exact transformation}}.
2. Preserve {{invariants}}.
3. Check every item when batch <10; otherwise check >=3 representative samples and the aggregate validator.
4. No unmatched or partially transformed item remains.

VERIFICATION COMMANDS: {{aggregate and sample commands}}
RETRY BUDGET: 2 materially different attempts per tier; one low/fast tool/path/syntax failure escalates.
EVIDENCE FORMAT: count expected | count changed | samples | aggregate result.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: any item does not match the proven pattern; shared file conflict; scope/line budget exceeded.

Do not improvise a new pattern. Do not paste the transformed files or complete logs.
```

## 9. Worked example — Research/search

```text
ROLE: harness-explorer (gpt-5.6-terra, high)
PARENT OBJECTIVE: Document the real artifact path for phone recognition checks.
CONTEXT: Future workers must know which command creates which ignored evidence before changing recognition.
IN-SCOPE PATHS: phone/autospin.js, .gitignore, CLAUDE.md, .claude/harness/06-RECOGNITION-PROTOCOL.md
OUT-OF-SCOPE PATHS: algorithm.js, verify.js, all writes, live ADB execution
KNOWN FACTS: The repository is native Windows/PowerShell; phone/check.html is ignored.
UNKNOWNS: Which functions implement --check, which artifacts are written, and which logs prove recognition.
REQUIRED TOOLS: rg, targeted Get-Content, git check-ignore
FORBIDDEN TOOLS: apply_patch, ADB, network, full-file dumps
ACCEPTANCE CRITERIA: Cite the CLI branch, every artifact-writing call, ignore rule, and exact safe command syntax.
VERIFICATION COMMANDS: rg -n -- "--check|check.html|writeFile" phone/autospin.js; git -c safe.directory=C:/Projects/autospinner check-ignore -v phone/check.html
RETRY BUDGET: 2 materially different attempts; escalate after one low-tier syntax/path error.
EVIDENCE FORMAT: finding | path:line | confidence.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: any write or need for live device state.
Do not dump files or logs. Do not propose recognition changes.
```

## 10. Worked example — Feature implementation

```text
ROLE: coding-worker (gpt-5.6-sol, high; not harness-worker)
PARENT OBJECTIVE: Add an already-approved deterministic --board input path to the phone dry-run CLI.
CONTEXT: Acceptance needs a device-independent fixture path; input syntax and behavior were approved by the Commander/User.
IN-SCOPE PATHS: phone/autospin.js, verify.js, README.md
OUT-OF-SCOPE PATHS: algorithm.js, .claude/harness, .codex, dependencies
KNOWN FACTS: Vanilla Node 20; no package manager; --dry must not touch the device after a board is supplied.
UNKNOWNS: Exact existing argument-parser insertion point only.
REQUIRED TOOLS: rg, apply_patch, node --check, node verify.js
FORBIDDEN TOOLS: npm install, ADB, network, broad refactor
ACCEPTANCE CRITERIA: Valid 30-cell input parses; invalid input exits nonzero; supplied-board --dry makes no ADB call; regression passes; only three paths change.
VERIFICATION COMMANDS: node --check phone/autospin.js; {{approved valid/invalid CLI fixture commands}}; node verify.js
RETRY BUDGET: 2 materially different attempts per tier.
EVIDENCE FORMAT: requirement | command | exit | result; concise diff stat.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: parser ownership is ambiguous; ADB is invoked; fourth file needed; any test bypass.
Do not make architecture changes or claim final acceptance.
```

## 11. Worked example — Refactoring

```text
ROLE: coding-worker (gpt-5.6-sol, high)
PARENT OBJECTIVE: Extract a proven repeated [TOS] marker formatter without changing output.
CONTEXT: Three call sites use the same already-reviewed format; byte-for-byte log compatibility is mandatory.
IN-SCOPE PATHS: phone/autospin.js
OUT-OF-SCOPE PATHS: algorithm.js, content.js, harness files, marker names/values
KNOWN FACTS: Baseline marker samples are captured; no dependency is needed.
UNKNOWNS: none; stop if a fourth format variant appears.
REQUIRED TOOLS: rg, apply_patch, node --check, exact marker comparison fixture
FORBIDDEN TOOLS: formatter, renaming markers, changing behavior, ADB
ACCEPTANCE CRITERIA: Three sites use one helper; baseline and after output are byte-identical; <=60 changed lines; one file only.
VERIFICATION COMMANDS: {{baseline fixture}}; node --check phone/autospin.js; {{same fixture and diff}}
RETRY BUDGET: 2 materially different attempts per tier.
EVIDENCE FORMAT: before hash | after hash | changed symbols | diff stat.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: output differs, a fourth format is semantically different, budget exceeded.
Do not add features or dump the file/log.
```

## 12. Worked example — Review

```text
ROLE: fresh-context-reviewer (gpt-5.6-sol, max)
PARENT OBJECTIVE: Accept or reject a change to algorithm.js and its verify.js checks.
CONTEXT: Judge the User-approved behavior, solver correctness, and regression evidence from disk; ignore implementation rationale initially.
IN-SCOPE PATHS: algorithm.js, verify.js, current diff, relevant PROJECT-FACTS section
OUT-OF-SCOPE PATHS: unrelated dirty phone files; all edits
KNOWN FACTS: node verify.js is canonical for algorithm.js; pre-existing dirty paths are listed in the dispatch.
UNKNOWNS: Whether the tests fail before the fix, pass after it, and cover the claimed boundary.
REQUIRED TOOLS: git diff, rg, targeted reads, node --check, node verify.js
FORBIDDEN TOOLS: apply_patch, restore/reset/clean, implementation defense before findings
ACCEPTANCE CRITERIA: TC-01..TC-10 evaluated; independent commands run; no Critical/High remains; findings include path/line and impact.
VERIFICATION COMMANDS: node --check algorithm.js; node --check verify.js; node verify.js; git -c safe.directory=C:/Projects/autospinner diff --check
RETRY BUDGET: 2 diagnostic attempts per tier; no repair edits.
EVIDENCE FORMAT: severity | evidence | impact | correction; completion-row table.
OUTPUT FORMAT: Exact section-1 headings: Status; Summary (1-10 bullets); Evidence; Commands (Command, integer Exit code, Result); Files changed; Unresolved risks; Recommended next action. Put task-specific findings, reviewer identity, verdicts, and limitations under Evidence or Unresolved risks.
STOP CONDITIONS: required baseline missing, source overlap cannot be distinguished, external state required.
Do not modify files or paste full diffs/logs.
```

## 13. Template verification

Before use, confirm every field is replaced, retry count is present, write scope is explicit, verification commands are copyable in the declared shell, and the output cap is present. Missing any one makes the package `BLOCKED`.
