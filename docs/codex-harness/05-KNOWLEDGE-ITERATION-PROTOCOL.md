# Knowledge Iteration Protocol

**Status:** COMPLETE
**Purpose:** Define safe autonomous maintenance, approval-required policy changes, lesson records, and compaction.
**Intended readers:** Commanders, harness maintainers, reviewers, and future sessions.
**Source-of-truth status:** Canonical policy for changing the Codex harness and its lesson store.
**Related files:** [AGENTS.md](../../AGENTS.md), [harness-maintenance skill](../../.agents/skills/harness-maintenance/SKILL.md), [lessons index](lessons/README.md), [pitfalls](lessons/PITFALLS.md)

## 1. Scope and precedence

This protocol governs:

- `AGENTS.md`
- `.codex/`
- `.agents/skills/harness-maintenance/`
- `docs/codex-harness/`

The existing `CLAUDE.md` and `.claude/harness/` remain legacy Claude/application-operational sources. They contain pre-existing User changes and frozen semantics. Do not consolidate, compact, delete, or reinterpret them under this protocol without explicit User approval and a sibling timestamped backup.

No maintenance action may modify application source. No session may commit changes unless the User explicitly asks for a commit.

## 2. Change classes

Classify the proposed update before editing.

### K1 — Autonomous mechanical correction

Allowed when evidence is current and the policy meaning does not change:

- Correct a broken internal link or missing path reference.
- Correct an incorrect command after the corrected command has run successfully.
- Update a stale line reference after re-reading the current file.
- Fix spelling, formatting, or an ambiguous sentence without changing obligations.
- Improve an example while preserving its rule, threshold, and authority.
- Add a newly confirmed test or syntax command to the verification matrix.
- Add a proven deterministic recovery step that does not expand permissions.

### K2 — Autonomous evidence update

Allowed only in `docs/codex-harness/lessons/` or an explicitly identified evidence section:

- Append a `CONFIRMED` pitfall backed by current commands/files.
- Append a clearly labeled `PROVISIONAL` observation that cannot drive policy.
- Mark a record `OBSOLETE` or `SUPERSEDED` while retaining its history and replacement link.
- Compact duplicate records without deleting evidence.
- Refresh verified path inventories and status counts.

### K3 — User-approved policy change

Required whenever authority, safety, scope, retry behavior, or mandatory verification changes. See section 4.

## 3. Conditions on autonomous updates

An autonomous K1/K2 update is allowed only when all conditions pass:

1. The active repository root is exactly `C:\Projects\autospinner`.
2. Initial Git status is recorded and overlapping User work is preserved.
3. The evidence comes from the current repository or a current authoritative source.
4. No safety control, threshold, required review, or permission is weakened.
5. The edit is within the paths in section 1 and touches no application source.
6. Any existing file receives one untouched sibling backup named `.bak.<YYYYMMDD-HHMMSS>` before its first session edit.
7. The changed file is read back and the harness validator passes.
8. A distinct read-only reviewer accepts the change.

If any condition fails, classify the update K3 or mark it `BLOCKED`.

## 4. User approval required

Do not autonomously perform any of the following:

- Change the repository scope or approved write boundary.
- Weaken, disable, bypass, or remove a safety hook.
- Disable or reduce required verification or independent review.
- Change destructive-command policy or its blocked patterns.
- Add, remove, or broadly upgrade production dependencies.
- Enable a new networked MCP server, app, connector, or plugin.
- Change credential access, environment-secret inheritance, or authentication.
- Increase `agents.max_depth` or recursive subagent capability.
- Increase agent fan-out beyond the documented thread cap.
- Allow parallel write agents without explicit non-overlapping ownership.
- Change model-dispatch authority, retry budgets, or escalation destinations.
- Delete historical evidence or backups.
- Remove or weaken a User circuit breaker.
- Change application architecture under the label of harness maintenance.
- Replace or consolidate `CLAUDE.md` or `.claude/harness/` semantics.
- Add a weak-model-invocable hook bypass.

Present a K3 proposal as:

```text
Current rule:
Proposed rule:
Evidence and motivating pitfall IDs:
Safety/authority impact:
Alternatives:
Migration and rollback:
Verification plan:
```

Do not apply it until the User explicitly approves the proposal.

## 5. Pitfall record format

Store Codex workflow lessons in `docs/codex-harness/lessons/PITFALLS.md`. Use one heading per record and this exact field order:

```markdown
## CH-YYYYMMDD-NNN — Short title

- Status: CONFIRMED | PROVISIONAL | OBSOLETE | SUPERSEDED
- Date: YYYY-MM-DD
- Task type: research | implementation | refactor | review | harness maintenance | operations
- Symptom: observable failure, not interpretation
- Root cause: evidence-backed cause; use unknown for PROVISIONAL
- Failed approach: exact attempt and why it failed
- Evidence: path:line, command + exit code, or reproduction
- Correct approach: action that resolved or safely bounded the issue
- Prevention mechanism: rule, test, hook, skill, or template
- Verification: exact check and result
- Generalization scope: where this lesson does and does not apply
- Confidence: high | medium | low, with reason
- Related files: repository-relative paths
- Expiration or review condition: date, version change, path change, or triggering evidence
```

IDs are immutable and unique. Use the local date and the next three-digit sequence for that date. Never renumber during compaction.

## 6. Evidence labels

- `CONFIRMED`: Direct current evidence establishes both symptom and root cause; prevention has been verified.
- `PROVISIONAL`: A bounded hypothesis or incomplete external observation. It must not create or change permanent policy.
- `OBSOLETE`: The environment or implementation changed so the record no longer applies. Keep the record and reason.
- `SUPERSEDED`: A newer record explains or replaces it. Link the successor ID in the old record.

Do not turn repetition in model prose into confirmation. Independent occurrences must come from distinct tasks, boards, versions, or dates as appropriate.

## 7. Lesson workflow

1. Search existing IDs, symptoms, and root causes before adding a record.
2. If evidence is incomplete, use `PROVISIONAL` or do not record it.
3. Append the complete record; never append detached fields later.
4. Add or update a prevention mechanism only when verified.
5. Run `node .codex/hooks/validate-harness.js`.
6. Read the record back in place.
7. Dispatch a read-only reviewer for label, duplication, and generalization scope.
8. Record the review result; do not commit unless the User asks.

## 8. Quantitative simplification triggers

Run a compaction review when any threshold is reached:

| Surface | Warning threshold | Mandatory review threshold | Required response |
|---|---:|---:|---|
| `AGENTS.md` | 220 lines or 16 KiB | 300 lines or 24 KiB | Move explanations/examples to linked docs; never raise the limit to avoid work |
| `PITFALLS.md` | 300 lines or 36 KiB | 400 lines or 48 KiB | Group by root cause, preserve IDs, archive superseded detail |
| Any pitfall line | 350 characters | 500 characters | Split fields into readable continuation bullets |
| `SKILL.md` | 150 lines or 12 KiB | 250 lines or 20 KiB | Move detail to one-level references |
| Any canonical policy file | 300 lines or 24 KiB | 450 lines or 32 KiB | Split by responsibility and retain one source of truth |

Also trigger review when:

- Three or more entries describe the same root cause.
- A rule has not triggered for six months.
- A path, command, Codex version, or model identifier changes.
- Two files define the same retry count, completion gate, or authority in different words.
- A temporary `AGENTS.override.md` exists beyond its stated expiration.

### Promotion thresholds

- Promote a lesson pattern to a permanent rule only after three independently confirmed occurrences and User approval when policy changes.
- Convert a repeated workflow into a skill after three successful uses with the same inputs, steps, outputs, and verification.
- Convert a rule into a physical hook only when deterministic detection is possible and false-positive/bypass behavior is documented.

## 9. Compaction procedure

Compaction never silently deletes history.

1. Back up the existing file using the required sibling timestamp format.
2. Inventory IDs, statuses, related files, and inbound references.
3. Propose clusters by shared root cause; do not merge merely similar symptoms.
4. Keep a concise canonical record and mark older records `SUPERSEDED` with its ID.
5. Move verbose superseded evidence to `docs/codex-harness/lessons/archive/YYYY.md` only when an archive is actually needed.
6. Preserve dates, original IDs, evidence provenance, and replacement links.
7. Run link, duplicate-ID, byte/line, and format checks.
8. Have `fresh-context-reviewer` compare the backup and compacted version read-only.
9. Correct all Critical/High findings; accept Medium only with written reason and review condition.
10. Do not delete the backup or create a commit without explicit User approval.

## 10. Independent compaction review

The reviewer must verify:

- Every pre-compaction ID still exists or is represented in the archive.
- No `PROVISIONAL` record became `CONFIRMED` without new evidence.
- No safety rule, retry threshold, or circuit breaker changed implicitly.
- All inbound links resolve.
- The compacted file is smaller in both bytes and effective context, not only physical lines.
- At least three representative merged clusters retain their original evidence and scope.

## 11. Backups and retention

- Create one original pre-session backup for each existing file changed in a session.
- Never overwrite, edit, or automatically delete a backup.
- New session-created files do not require backups during their creation session.
- Review accumulated backups quarterly.
- Removal requires explicit User approval after Git history and the replacement artifact are verified.

## 12. Legacy coexistence and conflicts

For Codex operation, `AGENTS.md` and `docs/codex-harness/` define orchestration, safety, retry, and completion policy. `CLAUDE.md` and `.claude/harness/` may still supply application facts when explicitly routed, but Claude-specific model/tool names and conflicting workflow policy do not override the Codex sources.

When a conflict is found:

1. Preserve both texts.
2. Cite exact lines and the active instruction hierarchy.
3. Follow the higher-priority current User/system/Codex policy.
4. Record a `PROVISIONAL` pitfall only if recurrence is plausible.
5. Ask the User before changing frozen legacy semantics.

## 13. Protocol verification

This protocol is satisfied when the validator reports no duplicate IDs, broken links, oversized entry points, invalid config, or root override masking; changed files have backups when required; a read-only reviewer accepts the update; and the final report distinguishes autonomous corrections from User-approved policy changes.
