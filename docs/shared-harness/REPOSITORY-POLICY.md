# Shared Repository Agent Policy

**Status:** COMPLETE
**Purpose:** Define the repository-wide workflow invariants that Codex and Claude Code must apply identically.
**Intended readers:** Every coding agent, Commander, worker, reviewer, and harness maintainer in this repository.
**Source-of-truth status:** Sole authority for cross-runtime safety, retry, review, commit, evidence, and knowledge-routing invariants. Native adapters may add stricter runtime-specific rules but may not weaken or contradict this file.
**Native entry points:** [Codex `AGENTS.md`](../../AGENTS.md), [Claude `CLAUDE.md`](../../CLAUDE.md)
**Detailed adapters:** [Codex dispatch](../codex-harness/02-MODEL-DISPATCH-PROTOCOL.md), [Claude dispatch](../../.claude/harness/01-MODEL-DISPATCH.md)

## 1. Machine-checkable constants

These tokens are literal and are validated by `validate-shared-harness.js`:

- `SHARED_POLICY_VERSION=1`
- `SHARED_REPOSITORY_ROOT=C:\Projects\autospinner`
- `SHARED_RETRY_BUDGET=2_PER_CAPABILITY_TIER`
- `SHARED_RETRY_RESET=NO_RESET_FOR_SAME_PATCH_CHAIN`
- `SHARED_REVIEW=FRESH_READ_ONLY_FOR_ANY_WRITE`
- `SHARED_COMMIT_AUTHORITY=EXPLICIT_USER_ONLY`
- `SHARED_FACTS_LOADING=TARGETED_ONLY`
- `SHARED_PARALLEL_WRITES=PROHIBITED_BY_DEFAULT`

Changing any token is a policy change requiring explicit User approval, timestamped backups of every existing file modified, deterministic validation, and fresh-context review.

## 2. Authority and precedence

Apply instructions in this order:

1. System/developer policy.
2. Current explicit User instructions.
3. This shared policy for cross-runtime invariants.
4. The runtime's native repository entry point for runtime-specific rules: `AGENTS.md` for Codex or `CLAUDE.md` for Claude Code.
5. Runtime-specific adapter documents and configuration.
6. The bounded task work order.

Current code, executed tests, and verified runtime observations own application behavior. Stored facts, lessons, line numbers, model names, and historical reports never outrank current evidence.

When a native adapter conflicts with this policy, follow this policy, stop any conflicting action, cite both clauses, and repair the adapter only through the approved harness-change process.

## 3. Repository boundary and safety

- The repository root is exactly `C:\Projects\autospinner`.
- Modify files only inside that root. Read-only inspection of approved global agent configuration is allowed when necessary; do not copy secret values.
- Redact tokens, passwords, private keys, cookies, credentials, and complete sensitive environment values as `[REDACTED]`.
- Record branch and status before any write. Pre-existing User work must be named and preserved.
- Never reset, clean, stash, restore, move, overwrite, or reinterpret unrelated User work.
- Destructive Git, recursive deletion, production/deployment actions, credential changes, dependency changes, security weakening, and out-of-repository writes require the applicable User circuit breaker.
- Harness-only work must not modify application source, tests, generated phone/browser evidence, dependencies, production state, or global configuration.
- Before modifying an existing harness file, create one untouched sibling backup named `<filename>.bak.<YYYYMMDD-HHMMSS>`. New files need no backup during their creation session.
- Do not commit unless the User explicitly requests a commit. Approval to edit policy does not grant commit authority.

## 4. Shared task lifecycle

Before editing:

1. Verify exact root, branch, status, and pre-existing changes.
2. Classify the task: answer, diagnose, application change, recognition, harness maintenance, or review.
3. Search relevant pitfalls and read only the smallest owning facts/policy sections.
4. Obtain a reproduction, execution trace, or unambiguous source-backed correction.
5. Name owning files/symbols, in-scope and out-of-scope paths, observable acceptance criteria, command/file budget, and exact baseline/focused/regression commands.
6. Record the retry key and attempt count when continuing a failure; resolve any active circuit breaker before writing.

After editing:

1. Run the narrowest behavior-owning check and required regression.
2. Reopen every changed file and check truncation, placeholders, wrong paths, and unintended scope.
3. Run native and shared harness validators when harness policy or configuration changed.
4. Dispatch a distinct fresh-context read-only reviewer.
5. Correct all valid Critical/High findings and re-review.
6. Deliver files, commands, integer exits, observed results, reviewer verdict/counts, and limitations.

## 5. Commander, delegation, and runtime adapters

The main conversation agent is Commander and owns requirements, architecture, scope, acceptance, conflict resolution, and final delivery.

Delegate when any threshold applies:

- Four or more read-heavy files whose raw contents are not all needed for one decision.
- Expected output above 200 lines or 20 KiB.
- Three or more independent repeated checks.
- Mechanical batching or required independent acceptance.

Shared dispatch invariants:

- `agents.max_depth = 1`; workers must not delegate recursively.
- Use at most three concurrent agent threads, and fewer unless lanes are independent.
- Reports contain at most ten summary bullets; no full logs, complete files, large code dumps, or secrets.
- Parallel writes are prohibited unless ownership is non-overlapping, interfaces are frozen, verification is separate, and the Commander performs integration.
- The implementation agent cannot perform final acceptance.

Capability tiers describe responsibility. Each runtime adapter owns concrete model identifiers, agent invocation syntax, tool/MCP names, shell syntax, hooks, and permissions. A model or tool name from one runtime must not be copied into the other runtime's adapter as shared policy.

Every work order includes goal/background, exact scope/exclusions, acceptance criteria, commands, retry state, stop conditions, and a bounded reporting format.

## 6. Retry and escalation

The retry key is `(bounded goal, failing acceptance check, observed symptom)`.

- `RETRY_BUDGET = 2 materially different repair attempts per capability tier`.
- A low/fast worker making one tool, command, path, or syntax error stops its repair loop and escalates upward.
- Never repeat an identical failing command without new evidence.
- A retry is valid only with a new hypothesis, new evidence, corrected assumption, different tool, smaller reproduction, or materially different design.
- A changed error message, symptom wording, or new regression in the same patch chain does not reset the counter.
- Reset only after the original patch chain is reverted or abandoned and a genuinely new bounded goal/check begins, or after the User approves a new design.
- Tier C/B escalates after two materially different failures. Tier A stops and asks the User after two materially different failures.
- Escalation carries the goal, retry key, tier/count, attempts, commands/exits, exact errors, files touched, hypotheses, evidence ruled out, session-owned changes, and recommended next experiment.
- Once the strongest tier proves a repeatable pattern, encode the pattern and delegate only mechanical application downward.

Runtime adapters own the exact escalation model. Codex currently binds Tier A in its dispatch protocol; Claude Code owns its own verified available model mapping.

## 7. Completion and independent review

Every file or external-state change requires acceptance by a distinct fresh-context, read-only reviewer. There is no line-count, file-count, or "small change" exemption. A second pass or persona in the implementation context is self-review and does not qualify.

A change is complete only when:

- All changed paths and operations remain in scope.
- Every acceptance criterion maps to observed evidence.
- Modified executable/config formats pass available syntax or parser checks.
- The narrow behavior-owning test and required regression pass.
- Durable commands/rules/facts affected by the change are updated.
- Every changed file is read back.
- Critical and High findings are zero after re-review.
- Delivery contains the complete evidence and limitation record.

Expected output, a test guide, syntax success, or "tests not run" is not observed behavioral proof. Unavailable live infrastructure produces `PARTIALLY VERIFIED` with an exact limitation or `BLOCKED`, never unconditional completion.

## 8. User circuit breakers

Stop and ask one narrow question when any condition applies:

- Two valid interpretations materially change behavior or data.
- An irreversible, destructive, production, credential, or privileged operation is required.
- Completion would overwrite or reinterpret pre-existing User work.
- A required write leaves the repository boundary.
- Requested behavior conflicts with safety or authority.
- Installed help and authoritative current documentation cannot confirm a material API/model/option.
- Repository state contradicts the requested target.
- Required device, browser, CI, service, or credential infrastructure is unavailable.
- Tier A exhausts its retry budget.
- Business intent, product taste, aesthetics, brand voice, or unstated stakeholder preference determines the result.

Before asking, inspect all locally obtainable evidence. Present concrete options and trade-offs; never fabricate preference or intent.

## 9. Knowledge ownership

- Current code and verified runtime observations own application behavior.
- `.claude/harness/PROJECT-FACTS.md` stores verified application facts. Search first and read only the owning section.
- `.claude/harness/06-RECOGNITION-PROTOCOL.md` stores recognition workflow, reconciled with current code and User-confirmed semantics.
- `.claude/harness/LESSONS.md` remains historical application/Claude evidence. Do not load it wholesale.
- `docs/codex-harness/lessons/PITFALLS.md` stores cross-runtime/Codex workflow pitfalls in structured confirmed/provisional form.
- Runtime-specific tool incidents may remain in their adapter's evidence store only when clearly scoped.
- Never duplicate one invariant in two stores with different authority or wording. Native mirrors must be validator-checked against this policy.
- Preserve obsolete/superseded history; do not silently delete it.

## 10. Native adapter ownership

| Surface | Owner | May contain |
|---|---|---|
| `AGENTS.md`, `.codex/**`, `.agents/skills/**`, `docs/codex-harness/**` | Codex adapter | Codex tools, models, hooks, agents, skills, templates, and detailed Codex procedures |
| `CLAUDE.md`, `.claude/settings*.json`, `.claude/harness/01` through `05` | Claude adapter | Claude models, Agent API, permissions, tools, templates, and detailed Claude procedures |
| Application code/tests/docs and targeted facts/recognition sources | Shared application layer | Current behavior, test evidence, application facts, recognition semantics |
| This file and `validate-shared-harness.js` | Shared control layer | Cross-runtime invariants and deterministic drift detection |

Native entry points must link this policy and explicitly give it authority over cross-runtime invariants. Runtime adapters may be stricter but never weaker.

## 11. Shared validation and change authority

Run from the repository root:

```powershell
node docs\shared-harness\validate-shared-harness.js --self-test
node docs\shared-harness\validate-shared-harness.js
```

Then run the active runtime's native harness checks and a path-scoped `git diff --check`. A full-worktree failure caused solely by named pre-existing User work must be reported with the exact path and alternative evidence.

Shared policy, retry, review, commit, safety, repository-boundary, knowledge-ownership, or adapter-authority changes require explicit User approval. Mechanical link/path corrections may follow the native maintenance protocol when semantics do not change.

## 12. Capability limits

Decomposition, stronger models, hooks, and isolated review cannot determine ambiguous business requirements, subjective aesthetics, product taste, brand voice, unstated stakeholder preferences, or conflicting objectives without an owner. Present two or three concrete options, state observable trade-offs, recommend only with evidence, ask one narrow question, and do not continue irreversible work while unresolved.
