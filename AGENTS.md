# Autospinner Codex Router

**Status:** COMPLETE
**Purpose:** Permanent repository instruction entry point for Codex.
**Intended readers:** Every Codex agent operating in this repository.
**Source-of-truth status:** Root Codex workflow authority; current code and verified runtime evidence own application behavior.
**Harness index:** [docs/codex-harness/00-README.md](docs/codex-harness/00-README.md)
**Shared repository policy:** [docs/shared-harness/REPOSITORY-POLICY.md](docs/shared-harness/REPOSITORY-POLICY.md) owns cross-runtime invariants used by Codex and Claude Code. Marker: `SHARED_POLICY_AUTHORITY=docs/shared-harness/REPOSITORY-POLICY.md`

## 1. Precedence and conflicts

After system/developer policy and current explicit User instructions, the shared repository policy controls cross-runtime invariants; the closest loaded `AGENTS.md` controls Codex-specific rules; linked Codex-native documents and the task dispatch package follow. Root `AGENTS.override.md` must normally be absent; a temporary override requires an explicit purpose, scope, replaced rules, owner, and expiration.

`CLAUDE.md` and `.claude/harness/` contain the Claude adapter plus application facts/history. Search them for targeted application facts when relevant; never load their large facts/lessons files wholesale. The shared repository policy controls safety, retry, review, commit, evidence, and knowledge-routing invariants. This file and `docs/codex-harness/` own Codex-specific models, tools, hooks, agents, and procedures.

## 2. Hard repository boundary

- Repository root is exactly `C:\Projects\autospinner`.
- Modify files only inside that root.
- Read-only inspection of approved global Codex configuration is allowed when necessary; never copy secret values.
- Redact tokens, passwords, private keys, cookies, credentials, and complete sensitive environment values as `[REDACTED]`.
- Do not modify global Codex/Git configuration, another repository, or application source during a harness-only task.
- Temporary OS files must be removed before delivery.
- Native Windows PowerShell is the primary shell. Use WSL/Git Bash only when current evidence requires it.

Before any write, run:

```powershell
$root = (Resolve-Path -LiteralPath .).Path
if ($root -cne 'C:\Projects\autospinner') { throw "Wrong repository root: $root" }
git -c safe.directory=C:/Projects/autospinner branch --show-current
git -c safe.directory=C:/Projects/autospinner status --short
```

Plain Git may fail because repository ownership differs from the current SID. Use the per-command `safe.directory` form for inspection; do not change the global Git allowlist.

## 3. Start every task

1. Verify root/branch/status and separate pre-existing User changes.
2. Read the shared repository policy, classify the task, and load only the smallest relevant native/application source.
3. Trace/reproduce current behavior and search [lessons/PITFALLS.md](docs/codex-harness/lessons/PITFALLS.md).
4. Define in/out scope, acceptance, commands, and line/file budget.
5. Dispatch only when section 6 thresholds apply.

Do not infer that a dirty file is yours. Never reset, clean, stash, restore, move, or overwrite unrelated work.

## 4. Task classification

| Class | First action | Editing authority |
|---|---|---|
| Answer/explain | Inspect current code/path and answer with evidence | No writes unless requested |
| Diagnose | Reproduce/trace and report cause | No fix unless requested or clearly included |
| Application change | Establish baseline and acceptance; inspect current implementation | Named application paths only |
| Recognition/board-state | Run recognition first; report observed board for User validation | No solver change before validated semantics |
| Harness maintenance | Use `$harness-maintenance`; classify K1/K2/K3 | Harness paths only |
| Review/acceptance | Use fresh read-only context and disk state | No writes |

For recognition, the fast evidence command is stateful and writes ignored artifacts:

```powershell
node .\phone\autospin.js --check
```

Report what was recognized and let the User validate ambiguous game semantics before changing solver logic.

## 5. Read routing

| Decision | Canonical source |
|---|---|
| Cross-runtime safety, retry, review, commit, evidence, or knowledge invariant | `docs/shared-harness/REPOSITORY-POLICY.md` |
| Harness failure modes/control mapping | `docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md` |
| Tier, dispatch, retry, escalation, independent acceptance | `docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md` |
| Stop/abandon, completion, or User question | `docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md` |
| Subagent work order | `docs/codex-harness/04-DISPATCH-PROMPT-TEMPLATES.md` |
| Autonomous vs approval-required harness changes | `docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md` |
| Startup, degradation, global recommendations | `docs/codex-harness/06-HANDOFF-TO-FUTURE-SESSIONS.md` |
| Independent findings | `docs/codex-harness/07-ADVERSARIAL-REVIEW.md` |
| Final checks/backups/limitations | `docs/codex-harness/08-VERIFICATION-REPORT.md` |
| Application file map and targeted facts | `CLAUDE.md`, then relevant `.claude/harness/PROJECT-FACTS.md` section |
| Recognition workflow | `.claude/harness/06-RECOGNITION-PROTOCOL.md`, reconciled with current code/User semantics |

## 6. Commander and delegation

The main conversation agent is Commander and owns scope, architecture, acceptance, conflict resolution, and final delivery. Commander and planning run on `gpt-5.6-sol` at `max`; role-specific files pin the remaining approved routes below, and no model or reasoning effort may be silently substituted.

Delegate when work requires four or more read-heavy files, output over 200 lines/20 KiB, three or more independent repeated checks, mechanical batching, or final independent acceptance.

| Role | Use when | Access | Model | Effort |
|---|---|---|---|---|
| `coding-worker` | Bounded application implementation or refactoring | Workspace write; named application files only | `gpt-5.6-sol` | `high` |
| `harness-explorer` | Repository/config mapping and evidence collection | Read-only | `gpt-5.6-terra` | `high` |
| `harness-worker` | Small prescribed harness or mechanical action after policy/criteria are fixed | Workspace write; harness files only | `gpt-5.6-luna` | `medium` |
| `fresh-context-reviewer` | Independent final acceptance and adversarial review | Read-only | `gpt-5.6-sol` | `max` |

- `agents.max_depth = 1`; subagents must not delegate.
- `agents.max_threads = 3`; use fewer unless lanes are independent.
- Parallel writes are prohibited unless files are explicitly non-overlapping, interfaces are frozen, and ownership/verification is separate.
- The implementation agent cannot be the final reviewer. A self-review or second pass in the same context does not qualify.
- Every dispatch uses the three-part package and <=10-bullet report in the dispatch protocol.

## 7. Evidence required before editing

Do not edit until all applicable items exist:

- Current root/branch/status and pre-existing-change inventory.
- Reproduction, execution-path trace, or unambiguous source-backed documentation correction.
- Owning files/symbols and in/out scope.
- Observable acceptance criteria.
- Baseline and exact focused/regression commands.
- Retry key and current attempt count when continuing a failure.
- User decision for any active circuit breaker.

Stop when an AP criterion in the judgment matrix triggers.

## 8. Retry and escalation

- `RETRY_BUDGET = 2 materially different repair attempts per capability tier`.
- A low/fast Tier C agent escalates after its first tool, command, path, or syntax failure.
- Never repeat an identical failing command without new evidence.
- A valid retry changes evidence, hypothesis, tool, reproduction size, or environment assumption.
- Tier C/B escalates to Tier A after two failed materially different attempts.
- Tier A stops and asks the User after two failed materially different attempts.
- A new regression in the same patch chain does not reset the counter.
- Escalation includes goal, retry key, attempts, commands/errors, files touched, hypotheses, evidence ruled out, and session-owned changes.
- Once Tier A proves a pattern, encode it and delegate mechanical application back to Tier C.

## 9. Verification contract

Run the narrowest relevant check and the required regression. Syntax is not behavioral proof.

```powershell
node --check algorithm.js
node verify.js
node --check phone\autospin.js
node docs\shared-harness\validate-shared-harness.js
node .codex\hooks\validate-harness.js
node .codex\hooks\test-hooks.js
git -c safe.directory=C:/Projects/autospinner diff --check
```

- Any `algorithm.js` change requires `node verify.js` and actual exit/output evidence.
- Other JavaScript changes require `node --check <file>` plus behavior-owning evidence.
- Hook changes require allowed and blocked fixture tests.
- Config/agent/skill/Markdown changes require harness validation, read-back, and fresh review; shared policy or native adapter changes additionally require `node docs\shared-harness\validate-shared-harness.js --self-test` and `node docs\shared-harness\validate-shared-harness.js`.
- Live browser/ADB claims require live evidence; unavailable infrastructure must be recorded as a blocker and limitation.
- “Tests not run” is not passing without exact command, blocker, alternative evidence, residual risk, owner, and next check.

Delivery requires TC-01 through TC-10 from the judgment matrix. No unresolved Critical/High finding is allowed.

## 10. User input is mandatory

Stop and ask one narrow question when:

- Two valid interpretations or an uninferable business/aesthetic/product preference materially change behavior.
- A destructive/production operation, credential, or privileged access is required.
- Existing User work would be overwritten or required scope leaves this repository.
- Security/authority conflicts with the request, no authoritative source exists, or repository state contradicts the target.
- Acceptance infrastructure is unavailable or Tier A exhausts its retry budget.

Do not interrupt for facts obtainable from local read-only inspection or reversible choices already governed by repository evidence.

## 11. Harness change authority

Autonomous, with current evidence, backup, validation, and independent review:

- Add a confirmed/provisional pitfall in the required format.
- Correct a broken internal link, verified command, stale line reference, typo, or non-policy ambiguity.
- Add a proven deterministic recovery/check.
- Compact duplicate lessons while preserving IDs/evidence and policy.

Explicit User approval required:

- Change repository scope, safety hooks, destructive policy, required verification, retry authority, or circuit breakers.
- Add/remove production dependencies or enable a networked MCP/app/plugin.
- Change credential access, recursive depth, thread authority, or parallel-write policy.
- Delete evidence/backups, consolidate frozen legacy semantics, or change application architecture as “maintenance.”

Back up every existing file before its first session modification as `<filename>.bak.<YYYYMMDD-HHMMSS>`. Never edit or overwrite the backup. New session-created files need no backup during their creation session.

## 12. Forbidden actions

- Writes outside `C:\Projects\autospinner` or to global Codex configuration.
- Secrets in reports, logs, fixtures, or durable documents.
- `git reset --hard`, `git clean`, destructive checkout/restore, force push, or deleting User work.
- Production deploy/drop/migration, credential modification, broad dependency upgrade, or hook/test disabling without explicit User approval.
- Application-source changes during harness-only work.
- Commits unless the User explicitly requests one.
- Recursive delegation, overlapping parallel writes, identical retries, or unsupported completion claims.
- Treating a model summary, syntax check, or expected output as observed behavior.

## 13. Completion report format

Use these exact headings when files or external state changed:

```text
Status: COMPLETE | PASS WITH DOCUMENTED LIMITATIONS | BLOCKED
Files changed:
- <path and purpose>
Verification:
- Command: <exact command>
  Exit code: <integer>
  Result: <concise observed result>
Independent review:
- Reviewer: <distinct identity>
  Verdict: PASS | FAIL
  Findings: Critical <n>, High <n>, Medium <n>, Low <n>
Limitations:
- <unverified behavior, blocker, owner, next check; or none>
```

The final answer must be self-contained and distinguish verified facts, partial verification, blocked checks, pre-existing changes, and session changes.

## 14. Context circuit breaker

If repeated reads, lost path tracking, contradictory decisions, repeated commands, large unprocessed output, or uncertainty about written files appears: stop new workstreams, write current state to the diagnosis/handoff, finish the current file, run read-only review/verification, and mark unfinished work honestly.

## 15. Capability limits

Decomposition and review improve reliability but cannot guarantee judgment for ambiguous business requirements, aesthetics, product taste, brand voice, unstated stakeholder preferences, or conflicting objectives without an owner. Present two or three concrete options/trade-offs, recommend only with evidence, ask one narrow question, and do not continue irreversible work.
