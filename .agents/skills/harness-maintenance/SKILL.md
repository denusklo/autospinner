---
name: harness-maintenance
description: Validate and maintain the Codex harness in C:\Projects\autospinner. Use when adding a confirmed/provisional workflow pitfall, checking consistency, compacting lessons, refreshing verified paths or commands, running the harness review checklist, or preparing a model-name migration plan. Do not use for application source changes, feature work, safety-policy weakening, credential changes, networked MCP enablement, repository-scope changes, or bypassing independent review.
---

# Harness Maintenance

**Status:** COMPLETE
**Purpose:** Execute repeatable, bounded Codex harness maintenance.
**Intended readers:** Codex agents invoked for repository harness maintenance.
**Source-of-truth status:** Procedure only; policy remains in [05-KNOWLEDGE-ITERATION-PROTOCOL.md](../../../docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md).
**Detailed checklists:** [MAINTENANCE-CHECKLIST.md](references/MAINTENANCE-CHECKLIST.md)

## Inputs

Require:

- Parent objective and selected maintenance operation.
- Exact in-scope and out-of-scope paths.
- Current root, branch, and initial Git status.
- Evidence supporting every proposed correction or lesson.
- Acceptance criteria and exact verification commands.
- Current retry key/count when continuing a failure.
- Explicit User approval for any K3 change.

Return `BLOCKED` instead of inventing a missing input.

## Allowed files

Edit only files explicitly assigned under:

- `AGENTS.md`
- `.codex/**`
- `.agents/skills/harness-maintenance/**`
- `docs/codex-harness/**`

Create one sibling `.bak.<YYYYMMDD-HHMMSS>` before the first session modification of any pre-existing file. Do not back up a file first created in the same session.

## Forbidden files and actions

Do not modify:

- Application source, tests, manifests, or generated phone/browser artifacts.
- `CLAUDE.md`, `.claude/**`, `.git/**`, global Codex files, or another repository.
- Credentials, environment secrets, dependencies, production state, or Git history.

Do not weaken/disable hooks, verification, review, retry limits, circuit breakers, or the repository boundary. Do not add a networked MCP/app/plugin, change agent recursion/fan-out authority, delete evidence/backups, commit, or create a bypass.

## Select one operation

Read only the matching checklist section in the detailed reference.

1. **Validate consistency:** Run validator/self-tests, inspect every failure, and make no edit unless evidence establishes a K1/K2 correction.
2. **Add a pitfall:** Search existing records; use all required fields; label unproven root cause/prevention `PROVISIONAL`.
3. **Compact lessons:** Trigger only at documented thresholds; preserve IDs/evidence; create an archive only when real content moves.
4. **Refresh paths or commands:** Re-run the command or re-read the current symbol before correcting it; do not hard-code volatile check totals.
5. **Run harness review:** Dispatch the distinct read-only `fresh-context-reviewer`; do not self-accept.
6. **Plan a model-name migration:** Verify availability, map capability tiers, and produce a plan. Do not change dispatch authority or pin a model without the required approval and test.

Do not combine operations when separate acceptance/review would be clearer.

## Workflow

1. Verify the exact root `C:\Projects\autospinner`.
2. Record branch/status and distinguish pre-existing User work.
3. Read [the knowledge protocol](../../../docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md) and classify K1, K2, or K3.
4. Stop for K3 unless the User approved the exact proposal.
5. Read the selected checklist section only.
6. Back up allowed pre-existing files before editing.
7. Apply the smallest evidence-backed patch with no application changes.
8. Read back every changed file.
9. Run the required checks below plus operation-specific checks.
10. Dispatch independent read-only review and correct valid findings.
11. Report evidence and limitations; do not commit unless requested.

## Verification

Run from the repository root:

```powershell
node --check .codex\hooks\pre-tool-use-guard.js
node --check .codex\hooks\completion-evidence-guard.js
node --check .codex\hooks\test-hooks.js
node --check .codex\hooks\validate-harness.js
node .codex\hooks\test-hooks.js
node .codex\hooks\validate-harness.js
git -c safe.directory=C:/Projects/autospinner diff --check
```

Validate the skill with the installed skill-creator validator when available. Treat a missing validator dependency as a documented blocker, not a pass.

Require a distinct `fresh-context-reviewer` verdict with zero unresolved Critical/High findings. Syntax success does not prove hook loading or behavioral enforcement; verify project/hook loading in a new trusted session.

## Retry and stop conditions

- Allow at most two materially different repair attempts per capability tier.
- Escalate a low/fast tool, command, path, or syntax error after one failure.
- Never repeat an identical failed command without new evidence.
- Stop for an out-of-scope file, policy change, secret risk, pre-existing-work collision, unavailable authority, or exhausted retry budget.
- Revert only session-owned changes when abandoning a path.

## Output

Return:

- `Status: PASS | PARTIAL | BLOCKED | FAIL`
- No more than ten summary bullets.
- Exact files changed and backups.
- Commands and exit codes.
- Requirement/check results.
- Independent reviewer identity/verdict/findings.
- Unresolved limitations and next action.

Do not paste complete files, logs, diffs, code, or sensitive values.
