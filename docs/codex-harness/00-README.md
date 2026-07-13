# Codex Harness Index

**Status:** COMPLETE
**Purpose:** Route readers to the smallest relevant harness source without loading the full system.
**Intended readers:** All Codex agents and repository maintainers.
**Source-of-truth status:** Navigation only; linked files own their stated policy.
**Related files:** [AGENTS.md](../../AGENTS.md), [legacy Claude router](../../CLAUDE.md)

## 1. Immediate use

From `C:\Projects\autospinner`:

```powershell
git -c safe.directory=C:/Projects/autospinner status --short
git -c safe.directory=C:/Projects/autospinner branch --show-current
node docs/shared-harness/validate-shared-harness.js
node .codex/hooks/validate-harness.js
node .codex/hooks/test-hooks.js
```

Then classify the task and read only the row that applies.

| Need | Read | Use |
|---|---|---|
| Cross-runtime safety, retry, review, commit, evidence, or knowledge invariant | [shared repository policy](../shared-harness/REPOSITORY-POLICY.md) | Sole shared authority for Codex and Claude Code |
| Why the harness exists or which control maps to a leak | [01-HARNESS-LEAK-DIAGNOSIS.md](01-HARNESS-LEAK-DIAGNOSIS.md) | Architecture decisions and control traceability |
| Delegate, select a tier, retry, escalate, or de-escalate | [02-MODEL-DISPATCH-PROTOCOL.md](02-MODEL-DISPATCH-PROTOCOL.md) | Canonical dispatch authority |
| Decide whether to stop, deliver, or ask the User | [03-JUDGMENT-EXTERNALIZATION-MATRIX.md](03-JUDGMENT-EXTERNALIZATION-MATRIX.md) | AP, TC, and CB criteria |
| Prepare a bounded subagent package | [04-DISPATCH-PROMPT-TEMPLATES.md](04-DISPATCH-PROMPT-TEMPLATES.md) | Seven reusable templates and four examples |
| Maintain policy, paths, commands, or lessons | [05-KNOWLEDGE-ITERATION-PROTOCOL.md](05-KNOWLEDGE-ITERATION-PROTOCOL.md) | Autonomous vs User-approved changes |
| Start a future session or assess degradation | [06-HANDOFF-TO-FUTURE-SESSIONS.md](06-HANDOFF-TO-FUTURE-SESSIONS.md) | Risk register and startup checklist |
| Inspect independent review findings | [07-ADVERSARIAL-REVIEW.md](07-ADVERSARIAL-REVIEW.md) | Reviewer evidence and correction history |
| Inspect final checks, files, backups, and limitations | [08-VERIFICATION-REPORT.md](08-VERIFICATION-REPORT.md) | Final acceptance record |
| Find or add a Codex workflow lesson | [lessons/README.md](lessons/README.md) | Lesson routing and compaction |

## 2. Native control surfaces

| Surface | Responsibility | Authority |
|---|---|---|
| `docs/shared-harness/` | Shared policy and deterministic Codex/Claude drift validation | Cross-runtime invariants |
| `AGENTS.md` | Concise root task router and non-negotiable lifecycle | Permanent repository instruction entry point |
| `.codex/config.toml` | Commander/planning model route, sandbox, hook feature, agent depth/thread cap | Trusted-project runtime defaults |
| `.codex/hooks.json` | Hook event wiring only | Canonical project hook representation |
| `.codex/hooks/` | Boundary/destructive guard, completion gate, validator, tests | Deterministic defense in depth |
| `.codex/agents/coding-worker.toml` | Bounded application implementation/refactoring on Sol `high` | Coding specialist role |
| `.codex/agents/harness-explorer.toml` | Read-only evidence mapping on Terra `high` | Exploration/search role |
| `.codex/agents/harness-worker.toml` | Small harness/mechanical writes on Luna `medium` | Mechanical worker role |
| `.codex/agents/fresh-context-reviewer.toml` | Read-only independent acceptance on Sol `max` | Reviewer role |
| `.agents/skills/harness-maintenance/` | Repeated bounded maintenance workflow | Procedure; policy remains in document 05 |

Hooks are defined only in `.codex/hooks.json`, never duplicated inline in project config.

## 3. Instruction hierarchy

Apply instructions in this order:

1. System/developer policy.
2. Current explicit User instructions.
3. Shared repository policy for cross-runtime invariants.
4. Root `AGENTS.md` and any closer directory instruction for Codex-specific rules.
5. Canonical Codex documents linked by `AGENTS.md` for runtime-specific decisions.
6. Task-specific dispatch package.
7. Claude adapter/application sources only for targeted facts or Claude-specific details that do not conflict with the shared policy.

Root `AGENTS.override.md` is intentionally absent. If one appears, the validator fails until its temporary purpose, scope, replaced rules, and expiration are documented or it is retired with backup.

## 4. Task lifecycle

```text
verify root/status
  -> classify task and risk
  -> gather current evidence
  -> define scope + acceptance + commands
  -> dispatch only when thresholds apply
  -> edit within ownership
  -> run focused + regression checks
  -> read back changed files
  -> fresh-context read-only review
  -> correct findings and re-review
  -> emit completion evidence + limitations
```

Stop at any AP signal or CB circuit breaker in the judgment matrix.

## 5. Verification by change type

| Change | Minimum local check | Additional evidence |
|---|---|---|
| `algorithm.js` | `node --check algorithm.js` then `node verify.js` | Exact exit code and `ALL CHECKS PASSED`; independent review |
| Other JavaScript | `node --check <changed-file>` | Change-specific behavior check; do not substitute syntax for behavior |
| JSON | Parse with Node or the harness validator | Loaded behavior remains separate |
| TOML/custom agent | Constrained harness TOML parser plus `codex features list` semantic config load | New-session/representative agent check; Python `tomllib` is optional where available |
| Markdown | Harness link/path/size/duplicate checks | Read-back and reviewer sampling |
| Hook script/config | `node .codex/hooks/test-hooks.js` and validator | Allowed and blocked samples; new-session trust/loading remains separate |

Live browser/ADB behavior requires live evidence. If infrastructure is unavailable, record the exact blocker and use `PARTIALLY VERIFIED` or `BLOCKED`.

## 6. Evidence statuses

- `VERIFIED`: required current check ran and passed.
- `PARTIALLY VERIFIED`: some required behavior remains unobserved; list the gap.
- `UNVERIFIED`: no adequate current check exists.
- `BLOCKED`: a mandatory check cannot proceed.
- `NOT APPLICABLE`: the canonical matrix explicitly permits it with a reason.

## 7. Current deployment state

| Deliverable | State |
|---|---|
| Diagnosis, dispatch, judgment, templates, knowledge, handoff, lesson routing | `COMPLETE` |
| Shared Codex/Claude policy and drift validator | `DEPLOYED`; current acceptance comes from the validators plus a fresh review, not from this index |
| Root router, project config, agents, hooks, maintenance skill | `COMPLETE`; deterministic control tests pass |
| Adversarial review report | Baseline report retained; every later harness migration requires its own fresh review and correction record |
| Final verification report | `COMPLETE`; `PASS WITH DOCUMENTED LIMITATIONS` |
| Actual project config/hook loading in a new trusted session | `PARTIALLY VERIFIED`; static config accepted, live reload/trust pending |

## 8. Runtime coexistence

Do not delete or silently rewrite `CLAUDE.md` or `.claude/harness/`. They are the Claude adapter and hold application-specific facts/history. The shared repository policy owns cross-runtime invariants; Codex documents own Codex models/tools/hooks, and Claude documents own Claude models/tools/permissions.

When application facts are needed, search the relevant term first and read only the owning section. Do not load all of `PROJECT-FACTS.md` and `LESSONS.md` into either Commander context.

## 9. Tomorrow's first bounded task

1. Open Codex at the repository root.
2. Ask it to report loaded instruction sources, project trust, and hook trust.
3. Run the two harness checks in section 1.
4. Give one bounded objective with in/out scope.
5. Require the Commander to produce the three-part dispatch package.
6. Use `harness-explorer` only when ownership is unclear or reading thresholds apply.
7. Use a worker only after acceptance criteria and commands are fixed.
8. Use `fresh-context-reviewer` before completion.
9. Inspect files, commands, exit codes, review status, and limitations.
10. Record a pitfall only if direct evidence confirms a reusable workflow failure.

## 10. Known limits

This harness reduces deterministic workflow failures; it does not guarantee correct judgment for ambiguous requirements, aesthetics, product taste, brand voice, unstated preferences, or conflicting objectives. Use the capability-limit response in the judgment matrix.
