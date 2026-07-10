# Model Dispatch Protocol

**Status:** COMPLETE
**Purpose:** Define capability tiers, Commander ownership, dispatch packages, retry budgets, and independent acceptance.
**Intended readers:** Commanders, dispatching agents, subagents, and reviewers.
**Source-of-truth status:** Canonical Codex delegation and escalation policy for this repository.
**Related files:** [diagnosis](01-HARNESS-LEAK-DIAGNOSIS.md), [judgment matrix](03-JUDGMENT-EXTERNALIZATION-MATRIX.md), [templates](04-DISPATCH-PROMPT-TEMPLATES.md), [agent definitions](../../.codex/agents/)

## 1. Non-negotiable constants

Use these exact values unless the User approves a policy change:

- `RETRY_BUDGET = 2 materially different repair attempts per capability tier`.
- A low/fast Tier C agent gets only one failed tool, command, path, or syntax attempt before the subtask is reassigned upward.
- `agents.max_depth = 1`; subagents must not spawn subagents.
- `agents.max_threads = 3`; the Commander selects fewer when work is not independent.
- A report contains at most ten summary bullets and no complete log or large code dump.
- An implementation agent is never its own final acceptance agent.
- Parallel writes are prohibited by default.

The retry key is `(bounded goal, failing acceptance check, observed symptom)`. A regression caused by the same patch chain does not reset the counter merely because its wording differs.

## 2. Capability tiers

Tier names describe responsibility, not a permanently pinned model. Model examples are illustrative and must be checked against current availability before configuration.

### Tier A — Architect

Typical configuration: GPT-5.6 Sol or a supported equivalent at High, Max, or the strongest justified reasoning level.

Owns:

- Requirements interpretation and acceptance criteria.
- Architecture, security boundaries, and irreversible-risk decisions.
- Conflict resolution between repository evidence and requested behavior.
- Escalated debugging after lower-tier attempts fail.
- Final synthesis and delivery.
- Proposals for new permanent harness policy.

Must not:

- Copy long logs into the main context.
- Perform repetitive repository-wide scans that a bounded explorer can summarize.
- Continue batch edits after a pattern is proven and safely delegable.
- Delegate final responsibility.

### Tier B — Specialist

Typical configuration: a strong reasoning model at Medium or High with narrow instructions.

Owns bounded work such as:

- Focused execution-path investigation.
- Complex correctness, security, or test-strategy review.
- Framework- or environment-specific analysis.
- Fresh-context acceptance.
- Difficult reproduction or hypothesis discrimination.

Tier B may propose a design inside its assigned boundary. The Commander accepts or rejects it.

### Tier C — Worker or Explorer

Typical configuration: a cost-efficient model, such as GPT-5.6 Terra when available, or an equivalent at Low or Medium reasoning. Terra availability is not assumed by this repository.

Owns bounded work such as:

- Repository mapping and targeted search.
- Read-heavy evidence collection.
- Mechanical implementation after a pattern is approved.
- Repetitive non-overlapping transformations.
- Running prescribed checks.
- Structured evidence reports.

Tier C must not decide architecture, expand scope, weaken a gate, or interpret ambiguous product intent.

## 3. Commander contract

The main conversation agent is the Commander. It owns decisions, task boundaries, acceptance criteria, dispatch selection, conflict resolution, and final delivery.

### Delegate when at least one threshold is met

- The task requires reading four or more files whose raw contents are not all needed for one decision.
- Expected command or log output exceeds 200 lines or 20 KiB.
- Three or more independent items can be checked using the same schema.
- The task is repetitive, mechanically partitionable, or suitable for a fresh-context check.
- Independent verification is required after any file change.

### Keep work with the Commander when

- One architectural decision depends on tightly coupled evidence from at most three files.
- Dispatch overhead would exceed the bounded work.
- User intent, safety ownership, or conflict resolution is the central problem.
- The next action requires a User circuit breaker.

### Fan-out limits

- Use one subagent when one bounded role is sufficient.
- Use two in parallel only for genuinely independent read-heavy lanes.
- Use three only when all three scopes and outputs are non-overlapping.
- Never dispatch an agent merely to restate another agent's summary.
- Never permit recursive delegation.

### Write ownership

Only one agent writes a given file. Parallel write-heavy agents are prohibited unless all of the following are explicit in the dispatch packages:

1. File ownership is non-overlapping.
2. Shared interfaces are frozen before dispatch.
3. Each agent has its own verification command.
4. The Commander performs integration and one final independent review.

If any condition is missing, serialize the writes.

## 4. Required three-part dispatch package

Do not dispatch until all three parts are present.

### Part 1 — Goal and background

Include:

- Exact bounded task and why it matters.
- In-scope paths and out-of-scope paths.
- Known facts and relevant prior findings.
- Environment and repository-boundary constraints.
- Whether the role is read-only or may write named files.

### Part 2 — Acceptance criteria

Include:

- Observable pass conditions.
- Exact commands to run.
- Required evidence and representative samples.
- Forbidden changes and tools.
- Retry budget and current retry count.
- Stop conditions and completion definition.

### Part 3 — Reporting format

Require these exact top-level headings:

- `Status: PASS | PARTIAL | BLOCKED | FAIL`
- `Summary:` with one to ten bullets
- `Evidence:` with file paths/line numbers and test/check results
- `Commands:` with `Command`, integer `Exit code`, and `Result`
- `Files changed:`, or `none`
- `Unresolved risks:`, including an explicit `none`
- `Recommended next action:`

The Stop guard uses this schema for a positive subagent `PASS`. It uses the separate Commander schema in AGENTS.md section 13 for repository-level completion.

Forbid full logs, large code blocks, secrets, and unsupported completion claims. Use the reusable packages in [04-DISPATCH-PROMPT-TEMPLATES.md](04-DISPATCH-PROMPT-TEMPLATES.md).

## 5. Escalation algorithm

Apply this sequence literally.

1. Record the retry key, current tier, attempt number, command/tool, and exact error.
2. If a low/fast Tier C agent makes one tool, command, path, or syntax error, stop that agent's repair loop. Reassign to a stronger Tier C configuration or Tier B.
3. Never run the identical failing command again without at least one material change.
4. A retry is valid only when it adds new evidence, changes the hypothesis, uses a different tool, creates a smaller reproduction, or corrects an environment assumption.
5. Tier C or Tier B may make at most two materially different repair attempts for the retry key. After the second failure, escalate to Tier A.
6. Tier A may make at most two materially different repair attempts for the retry key. If both fail, stop autonomous repair and use the User circuit breaker.
7. Do not reset the counter because a retry introduced a different regression. Count the regression against the same patch chain until the original change is reverted or a new design is approved.
8. Revert only session-owned changes when needed. Never discard or overwrite pre-existing User work.

### Failure trace required at escalation

Pass this concise trace to the next tier:

```text
Goal:
Retry key:
Tier and attempt count:
Attempts:
Commands/tools and exit codes:
Exact errors:
Files touched:
Current hypotheses:
Evidence ruled out:
Session-owned changes still present:
Recommended next experiment:
```

Omitting the trace is not a fresh escalation; it is context loss.

## 6. Abandon, recover, and de-escalate

Use the quantified signals in [03-JUDGMENT-EXTERNALIZATION-MATRIX.md](03-JUDGMENT-EXTERNALIZATION-MATRIX.md).

When the current path is abandoned:

1. Stop further edits.
2. Preserve evidence and the retry trace.
3. Revert only session-owned changes if they obstruct a smaller reproduction.
4. Select a materially different design or escalate.
5. Ask the User only when a listed circuit-breaker condition applies.

Once Tier A proves a repeatable pattern:

1. Encode it in a test, hook, validator, skill, template, or `CONFIRMED` pitfall.
2. Define the exact mechanical application and verification command.
3. Delegate the repetitive application back to Tier C.
4. Require fresh-context acceptance of representative samples and the aggregate check.

## 7. Isolated verification

The implementation agent must not be the final acceptance agent. A self-review, second pass in the same context, or an implementer-spawned persona does not qualify.

The Commander dispatches `.codex/agents/fresh-context-reviewer.toml` after implementation. The reviewer must:

- Start from the parent objective and acceptance criteria, not the implementer's rationale.
- Re-read changed files and relevant source-of-truth files from disk.
- Inspect the actual diff.
- Run verification commands independently.
- Check at least three representative samples for a batch of ten or more changes; otherwise check every changed item.
- Report findings before seeing any implementation defense.
- Remain read-only.

### Disagreement resolution

1. The Commander maps each finding to evidence and severity.
2. A valid Critical or High finding blocks delivery and is corrected.
3. A disputed factual finding gets one independent reproduction, not a vote.
4. If reproduction resolves it, the observed result wins.
5. If two interpretations remain materially different and no authority resolves them, ask one narrow User question.
6. Medium findings are fixed or accepted in writing with owner, reason, and review condition.

## 8. Model-name migration

Custom agent files omit concrete model names so they inherit an available parent model. Reasoning effort and sandbox role remain explicit.

When model availability changes:

1. Verify available model identifiers from the installed Codex surface or official current documentation.
2. Map each candidate to Tier A, B, or C capability; do not migrate by price or name alone.
3. Change one agent definition at a time only if a concrete pin is necessary.
4. Run TOML validation and one representative dispatch.
5. Preserve the old result and compare scope compliance, error rate, evidence quality, latency, and cost.
6. Require User approval if dispatch authority, safety, review independence, or recursive depth would change.

## 9. Protocol verification

This protocol passes only when:

- Every agent dispatch contains the three required parts.
- Retry traces show no identical retry without material change.
- No retry key exceeds the tier budget.
- Agent depth is one and thread cap is three.
- A distinct read-only reviewer performs final acceptance.
- The final report records disagreements and their evidence-based resolution.

Unresolved environment note: project agent defaults and hooks created during a running Codex session require a new trusted session before their actual loading can be marked `VERIFIED`.
