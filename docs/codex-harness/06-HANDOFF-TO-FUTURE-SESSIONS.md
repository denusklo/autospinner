# Handoff to Future Sessions

**Status:** COMPLETE
**Purpose:** Preserve critical operating risks, degradation signals, recovery procedures, and immediate-use instructions.
**Intended readers:** Future Commanders, repository owners, and harness reviewers.
**Source-of-truth status:** Canonical continuity and degradation-risk register; current verification state is in [08-VERIFICATION-REPORT.md](08-VERIFICATION-REPORT.md).
**Related files:** [harness index](00-README.md), [dispatch](02-MODEL-DISPATCH-PROTOCOL.md), [knowledge protocol](05-KNOWLEDGE-ITERATION-PROTOCOL.md)

## 1. Current handoff state

- Repository root: `C:\Projects\autospinner`.
- Primary shell/runtime: native Windows PowerShell 5.1 and Node 20.
- Branch at audit start: `master`.
- The worktree already contained User modifications to application and legacy harness files. Preserve them.
- Root `AGENTS.override.md` was absent. Do not add a permanent override.
- Project `.codex` config/hooks created in a running session require a new trusted Codex session and hook-hash review before actual loading is `VERIFIED`.
- No application source is part of this harness change.

## 2. Three critical issues the User did not explicitly request

### 2.1 CI and test determinism are weaker than the completion policy

**Evidence:** `node verify.js` is the only canonical pure-logic regression command. There is no repository CI workflow, package manifest, tracked device-independent recognition corpus, or automated browser E2E. `verify.js` does not exercise actual asynchronous worker sharding, and phone/browser acceptance depends on external state.

**Reliability impact:** A local model can truthfully pass syntax and solver checks while live Chrome, ADB recognition, or worker behavior remains unverified. A completion hook cannot manufacture unavailable behavioral evidence.

**Recommended future work:** As a separate User-approved application/testing task, create deterministic tracked fixtures, independently exercise worker sharding, and add CI for syntax plus pure-logic regression. Keep live device/browser checks explicitly separate.

**Until then:** Mark live behavior `PARTIALLY VERIFIED` or `BLOCKED` when its infrastructure is unavailable. Never promote syntax success to behavioral proof.

### 2.2 Windows environment parity and generated-file ownership can silently change evidence

**Evidence:** The checkout is native Windows; Git reports dubious ownership unless read-only commands use per-command `safe.directory`; global `core.autocrlf=true` exists without a repository `.gitattributes`; Git Bash is documented to mangle Android `/sdcard/...` arguments; phone checks overwrite ignored artifacts such as `phone/check.html`, screenshots, and `screen.raw`.

**Reliability impact:** A worker can use a syntactically valid but wrong shell, generate evidence that does not appear in `git status`, or create line-ending churn. Hidden generated files can make later checks appear current when they are stale.

**Recommended future work:** Add a User-approved line-ending policy and deterministic generated-artifact metadata. Continue using PowerShell for ADB. Each report must timestamp generated evidence and state whether a command writes ignored files.

**Until then:** Use `git -c safe.directory=C:/Projects/autospinner ...` for read-only Git inspection; do not apply a global safe-directory change. Treat ignored artifacts as stateful, not source.

### 2.3 Global MCP/plugin/notifier trust exceeds repository need

**Evidence:** Global Codex config enables multiple plugins, `node_repl`, `codegraph`, and a turn-completion notifier. Project legacy guidance says codegraph is unindexed and must not be used. No project MCP allowlist or verified project-level disable existed at audit start. Global values were not copied into this repository.

**Reliability impact:** A lower-capability agent may invoke an irrelevant external surface, send more context than needed, or assume a configured server is authorized and working. Project hooks cannot fully intercept every tool path.

**Proposed global changes — not applied:**

1. Disable `codegraph` globally if it is unused everywhere, or pin its launcher to an audited absolute path and restrict tools.
2. Review enabled plugins/connectors and their approval modes periodically; disable those with no current owner.
3. Review the global notifier as a prompt/cwd/last-message data boundary.
4. Add the official OpenAI Developer Docs MCP only through a separately approved global change if it is wanted; do not silently install it from this repository.

**Until then:** Custom harness roles must not use MCP/apps/plugins unless the dispatch package names the server, purpose, data boundary, and approval behavior.

## 3. Long-term degradation register

| ID | Degradation mode | Early warning signal | Preventive control | Detection frequency | Repair procedure | Owner | Evidence of recovery |
|---|---|---|---|---|---|---|---|
| DG-01 | `AGENTS.md` becomes a miscellaneous handbook | >220 lines/16 KiB warning; explanations or incident history appear | Router-only content and validator budgets | Every harness change | Move detail to one canonical linked document; keep commands/decisions only | Harness maintainer | Validator under limits; links pass; reviewer confirms no lost rule |
| DG-02 | Lessons become repetitive or contradictory | Three entries share a root cause; duplicate IDs/status conflicts | Structured records and compaction triggers | Every append; monthly review | Back up, cluster by root cause, mark superseded, archive detail | Harness maintainer + reviewer | All IDs preserved; bytes reduced; duplicate scan passes |
| DG-03 | Temporary override becomes permanent | Root `AGENTS.override.md` exists or outlives its stated expiry | Validator fails on persistent root override | Every validation/session start | Back up; remove or renew only with User-approved scope/expiry | Commander/User | Root router loads; override absent or documented and current |
| DG-04 | Hooks are disabled after inconvenience | `[features].hooks=false`, missing hook file, trust not reviewed, blocked test skipped | Config check, hook tests, no weak-model bypass | Every harness verification | Diagnose false positive; fix without weakening; User approves any policy reduction | User + harness maintainer | Allowed/blocked fixtures pass; new session reports trusted hooks |
| DG-05 | Worker self-verifies | Same agent identity writes and gives final verdict | Distinct read-only reviewer requirement and completion guard | Every changed task | Discard self-acceptance; dispatch fresh-context reviewer from objective/disk | Commander | Reviewer identity and independent commands recorded |
| DG-06 | Model names become unavailable | Agent launch reports unknown model; stale name in TOML/docs | Capability tiers; agent files omit model pins | On Codex/model update; quarterly | Verify current availability, map tier, change one pin only if necessary, test dispatch | Commander/User for authority changes | TOML valid; representative dispatch meets role contract |
| DG-07 | Agents receive broader permissions | Read-only agent inherits workspace write or unnecessary MCP | Explicit sandbox mode and dispatch forbidden tools | Every agent-definition change | Restore read-only; narrow tools; investigate inheritance; re-review | Harness maintainer | Agent config parse; attempted write is denied/blocked |
| DG-08 | MCP remains after purpose disappears | Server has no recent owner/use or zero callable tools | Six-month trust review and named-purpose rule | Quarterly | Disable/restrict globally through User-approved change; document owner | User/Codex administrator | Config inventory shows removal/restriction; required workflow still passes |
| DG-09 | Exceptions weaken policy | Repeated “just this time” language; threshold changed without pitfall IDs | K3 proposal format and User approval | Every policy diff | Restore prior rule from backup; assess affected tasks; record confirmed corruption pitfall | User + reviewer | Diff contains approved rationale; validator/re-review pass |
| DG-10 | Completion reports become unsupported prose | Missing files/commands/exits/reviewer/limitations fields | Completion-evidence Stop hook and TC-01..TC-10 | Every completion claim | Continue turn; collect missing evidence; downgrade status if unavailable | Commander | Completion guard allows sample; report has all required fields |
| DG-11 | Documentation paths drift | Broken links, missing referenced files, stale line-only claims | Link/path validator and path-based sources | Every harness change | Correct verified paths; avoid fragile line references where symbols suffice | Harness maintainer | Link validator exit 0; reviewer samples paths |
| DG-12 | Retry limits are ignored | Identical command repeated; no retry key; counter resets on regression | Canonical retry constant and failure trace | Every failure/escalation | Stop loop; reconstruct trace; escalate at current count | Commander | Trace shows attempts/material changes and tier disposition |
| DG-13 | Fresh review becomes ceremonial | Reviewer receives implementation rationale first or runs no commands | Fresh-context template and read-only role | Every review | Re-dispatch with raw objective/files; require independent commands/findings first | Commander | Review report lists disk reads, commands, severity, verdict |
| DG-14 | Test commands become stale | Command missing, count hard-coded incorrectly, parser/runtime changes | Verify commands rather than counts; current command checks | Every runtime change; monthly | Run installed help/current command; update mechanically with evidence | Harness maintainer | Exact command exit/result current; docs no stale count |
| DG-15 | Backups accumulate without ownership | Multiple old `.bak.*` files with no inventory or decision | Quarterly backup inventory; no automatic deletion | Quarterly | Verify Git/replacement, present retention list, delete only with User approval | User | Approved inventory/disposition recorded; retained backups resolve |

## 4. Additional degradation risks

### Dirty default branch

Current work was observed directly on dirty `master`. Future application tasks should record status before edits and isolate risky work when the User's changes overlap. Do not stash, reset, clean, or move existing work without approval.

### Instruction precedence drift

Codex uses `AGENTS.md`; Claude uses `CLAUDE.md`. Do not copy both handbooks into both entry points. For Codex, the root router owns workflow policy and may link targeted application facts. If a legacy rule conflicts, cite it and follow the active higher-priority Codex/User instruction rather than silently editing the legacy file.

### Cost/context growth

Subagents reduce main-context pollution only when reports are bounded. Three agents each dumping logs cost more than one Commander pass. Enforce ten-bullet reports, targeted reads, depth one, and thread cap three.

### Observability gaps

When a live symptom cannot be reproduced locally, add structured diagnostic evidence or request one narrow User-run command. Do not compensate with more speculative implementation.

## 5. New-session startup checklist

1. Start Codex in `C:\Projects\autospinner`.
2. Ask it to report loaded global/root/nested instruction sources and project trust.
3. Review/trust the repository hook hash through the normal Codex hook UI; never bypass hook trust.
4. Run `node .codex/hooks/validate-harness.js`.
5. Run `node .codex/hooks/test-hooks.js`.
6. Record `git -c safe.directory=C:/Projects/autospinner status --short` and branch.
7. Give one bounded task and require the three-part dispatch package.
8. Use an explorer before edits when ownership is unclear.
9. Use a worker only after acceptance criteria and verification commands are explicit.
10. Use `fresh-context-reviewer` before a completion claim.
11. Inspect the evidence block and record only confirmed new pitfalls.

## 6. Handoff limitations

- Actual project config and hook loading cannot be proven from files created mid-session; verify in a new trusted session.
- Hook interception is defense in depth, not a complete security boundary.
- Model availability beyond the locally observed active model was not confirmed.
- External browser, ADB, CI, connector authorization, and production behavior remain environment-dependent.
- Human judgment remains required for ambiguous requirements, product taste, brand voice, and conflicting stakeholder priorities.

## 7. Ownership

- **Commander:** task scope, dispatch, acceptance, and final status.
- **Harness maintainer:** mechanical policy/evidence upkeep within [05-KNOWLEDGE-ITERATION-PROTOCOL.md](05-KNOWLEDGE-ITERATION-PROTOCOL.md).
- **Fresh-context reviewer:** independent read-only acceptance.
- **User:** policy authority, global configuration, destructive actions, trust exceptions, and subjective/product decisions.
