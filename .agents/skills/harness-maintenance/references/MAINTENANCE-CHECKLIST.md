# Harness Maintenance Checklist

**Status:** COMPLETE
**Purpose:** Provide operation-specific checklists loaded only after the parent skill selects one maintenance task.
**Intended readers:** Agents using the `harness-maintenance` skill and independent reviewers.
**Source-of-truth status:** Supporting procedure; [SKILL.md](../SKILL.md) owns routing and the [knowledge protocol](../../../../docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md) owns policy.
**Related files:** [harness index](../../../../docs/codex-harness/00-README.md), [pitfalls](../../../../docs/codex-harness/lessons/PITFALLS.md)

Read only the section selected by the parent skill, plus section 7 for reporting.

## 1. Validate consistency

### Inputs

- Exact repository root and initial branch/status.
- Whether this is a construction session or a normal maintenance run.
- Expected changed paths and pre-existing dirty paths.

### Steps

1. Run syntax checks for every hook script.
2. Run `node .codex\hooks\validate-harness.js --self-test`.
3. Run `node .codex\hooks\test-hooks.js`.
4. Run `node .codex\hooks\validate-harness.js`.
5. Parse `.codex/hooks.json` independently with Node.
6. Ask the installed Codex CLI to list features/config only when read-only and permitted; record version and exit.
7. Inspect every validator failure by path; do not bulk-edit from a count alone.
8. Classify the failure K1, K2, or K3.
9. Apply only K1/K2 corrections supported by current evidence.
10. Re-run all failed checks plus the complete validator.
11. Read back every corrected file.
12. Dispatch `fresh-context-reviewer`.

### Pass criteria

- Hook self-tests and fixtures exit 0.
- Full validator exits 0 with no `FAIL` line.
- JSON/TOML/skill checks pass.
- No root override masks `AGENTS.md`.
- No unresolved Critical/High review finding remains.

### Stop conditions

- A failure requires safety weakening, scope expansion, evidence deletion, or application-source changes.
- A parser cannot distinguish valid current syntax from an unsupported construct.
- Two materially different repairs fail at the same tier.

## 2. Add a pitfall

### Inputs

- Observable symptom and task type.
- Direct evidence for root cause, or explicit `PROVISIONAL` status.
- Failed approach, correct approach, prevention, and verification.

### Steps

1. Search IDs, symptom terms, root-cause terms, and prevention mechanisms in `PITFALLS.md`.
2. Update an existing record when it owns the same root cause; do not create a symptom-only duplicate.
3. Select `CH-YYYYMMDD-NNN` using local date and next sequence.
4. Add all 14 fields in the exact protocol order.
5. Use `CONFIRMED` only when symptom/root cause and prevention are directly verified.
6. Use `PROVISIONAL` when any causal or prevention evidence is incomplete.
7. Keep every line under 500 characters and avoid raw logs/code/secrets.
8. Set a concrete expiration/review condition.
9. Run the full validator.
10. Read the record back in place and verify no detached field was appended elsewhere.
11. Obtain independent review of label, evidence, duplication, and generalization.

### Pass criteria

- ID is unique and immutable.
- All fields exist once.
- Evidence is current and repository-relevant.
- Status matches confidence.
- No policy was changed by the record alone.

## 3. Compact lesson records

### Trigger

Proceed only when at least one documented threshold is met: warning/mandatory size, maximum line length, three records with one root cause, or a six-month stale review.

### Steps

1. Create the required sibling timestamped backup.
2. Inventory every ID, status, related path, inbound reference, and root cause.
3. Save pre-compaction line/byte/max-line metrics.
4. Cluster by root cause, not merely similar wording.
5. Select one concise canonical record per proven cluster.
6. Mark retained older records `SUPERSEDED` and link the canonical ID.
7. Preserve original IDs, dates, evidence provenance, and scope.
8. Create `lessons/archive/YYYY.md` only when real verbose evidence moves there.
9. Run validator and link/ID checks.
10. Compare metrics; compaction must reduce bytes/effective context, not only line count.
11. Dispatch a read-only reviewer with both backup and compacted file.
12. Sample at least three clusters and verify no evidence/policy loss.

### Pass criteria

- Every original ID remains or is represented in the archive.
- No status is promoted without new evidence.
- No retry/safety/circuit-breaker semantics change.
- Links pass and bytes decrease.
- Backup remains untouched.

### Stop conditions

- Historical evidence would need deletion.
- A legacy `.claude` file would need consolidation.
- The reviewer cannot map old IDs to current records.

## 4. Refresh stale paths or commands

### Steps

1. Locate the source reference and current owner symbol/path.
2. Verify current Git state; do not assume a moved path is committed User intent.
3. For a command, run it safely and record exact exit/output marker.
4. For a path/link, resolve it from the referring file.
5. Prefer stable symbol/section references over volatile line counts.
6. Never hard-code a test total when the output supplies a stable pass marker.
7. Correct only references proven stale.
8. Run the full validator and relevant command again.
9. Read back and dispatch independent review.

### Pass criteria

- Old reference is demonstrably wrong.
- New reference exists and owns the stated behavior.
- Corrected command was actually run or is marked externally blocked.
- No policy meaning changes.

## 5. Run the harness review checklist

### Dispatch package

Give `fresh-context-reviewer`:

- Parent objective and definition of done.
- Initial Git status and named pre-existing dirty files.
- All harness paths to re-read.
- Required validator/hook/syntax commands.
- Explicit read-only/no-defense-before-findings instruction.

### Required review lanes

1. Instruction hierarchy and root override.
2. Repository boundary and cross-shell path behavior.
3. Retry count, circuit breakers, completion evidence, and independent identity.
4. JSON/TOML/agent/skill fields, approved model/reasoning pin accuracy, and inheritance only where the active routing policy permits it.
5. Hook allowed/blocked behavior and bypass policy.
6. Links, IDs, file budgets, placeholders, and circular references.
7. Source/global/out-of-repository change detection.
8. Secret-pattern scan and report redaction.
9. Literal lower-capability simulation.
10. TC-01 through TC-10.

### Disposition

- Correct every valid Critical/High finding and re-review.
- Correct Medium or record owner/reason/review condition for acceptance.
- Resolve factual disputes with one reproduction, not a vote.
- Record reviewer identity, commands, findings before correction, corrections, and final verdict in document 07.

## 6. Prepare a model-name migration plan

### Steps

1. Inspect the installed Codex model surface or current official documentation.
2. Record only available identifiers; do not infer Terra or future aliases from prose.
3. Map candidates to Tier A/B/C responsibilities and reasoning needs.
4. Confirm whether agent files can continue inheriting the parent model; prefer inheritance.
5. Identify any concrete pin and why it is necessary.
6. Define one representative dispatch per affected role.
7. Compare scope compliance, tool/path error rate, evidence quality, latency, and cost.
8. Keep `agents.max_depth = 1` and thread cap unchanged.
9. Request User approval if authority, safety, review independence, permissions, or cost policy changes.
10. Change one pin at a time, validate TOML, run the role test, and preserve the prior result.

### Output only unless approved

Return current mapping, proposed mapping, evidence, risks, rollout/rollback, and verification. Do not edit a model pin merely because a newer name exists.

## 7. Reporting and handoff

Use the exact completion headings in `AGENTS.md`:

- Status.
- Files changed and purpose.
- Backups.
- Commands, exit codes, and observed results.
- Requirement/check mapping.
- Independent reviewer identity, verdict, and severity counts.
- Limitations, owner, and next check.

If context quality degrades, finish/read back the current file, update the handoff and reports, stop new workstreams, and mark remaining operations incomplete.
