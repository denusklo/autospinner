# Harness Lessons Index

**Status:** COMPLETE
**Purpose:** Explain how to find, add, validate, compact, supersede, and archive Codex workflow lessons.
**Intended readers:** Harness maintainers, Commanders, and reviewers.
**Source-of-truth status:** Routing index only; record policy is in [05-KNOWLEDGE-ITERATION-PROTOCOL.md](../05-KNOWLEDGE-ITERATION-PROTOCOL.md).
**Related files:** [PITFALLS.md](PITFALLS.md), [harness-maintenance skill](../../../.agents/skills/harness-maintenance/SKILL.md)

## Store boundary

`PITFALLS.md` stores Codex workflow and harness-maintenance lessons. It does not replace application facts or the legacy `.claude/harness/LESSONS.md` file.

Do not copy application incidents here unless they establish a reusable Codex workflow failure with its own current evidence.

## Find before adding

From the repository root:

```powershell
rg -n "CH-|Symptom:|Root cause:|Prevention mechanism:" docs/codex-harness/lessons/PITFALLS.md
```

Then search the likely symptom/root-cause terms. If an existing record covers the cause, update its verification/review condition or mark it superseded; do not create a near-duplicate.

## Add a record

1. Read [section 5 of the knowledge protocol](../05-KNOWLEDGE-ITERATION-PROTOCOL.md#5-pitfall-record-format).
2. Choose the immutable ID `CH-YYYYMMDD-NNN` using the next sequence for the local date.
3. Use every required field in the required order.
4. Use `PROVISIONAL` if root cause or prevention is not proven.
5. Keep each physical line below 500 characters.
6. Link repository-relative files; do not paste secrets, raw logs, or complete diffs.
7. Run the harness validator and dispatch read-only review.

## Status transitions

- `PROVISIONAL` → `CONFIRMED`: requires new direct evidence for root cause and verified prevention.
- `CONFIRMED` → `SUPERSEDED`: retain the record and name the replacement ID.
- Any status → `OBSOLETE`: retain the reason, environment/version change, and review date.
- Never silently delete or renumber a record.

## Validation

Run:

```powershell
node .codex/hooks/validate-harness.js
```

The check must detect duplicate IDs, invalid/missing fields, broken links, oversized lines/files, and unresolved root override masking. Syntax success alone does not validate a lesson's truth; the reviewer checks evidence.

## Compaction

Start a compaction review at 300 lines or 36 KiB. Compaction is mandatory at 400 lines or 48 KiB, or when three records share one root cause.

Compaction must:

- Create a sibling timestamped backup before modifying the existing file.
- Preserve every ID and evidence provenance.
- Mark old records `SUPERSEDED` rather than delete them.
- Create `archive/YYYY.md` only when real content needs archiving; do not create empty archive structure.
- Receive independent read-only comparison against the backup.

## What not to record

- Speculation presented as fact.
- User preferences not explicitly stated.
- Secrets, tokens, cookies, private keys, or complete sensitive environment values.
- Full command logs or code dumps.
- Generic “best practice” with no repository evidence.
- A one-off tool typo that has no repeatable prevention value.
- Application architecture changes disguised as a lesson.

## Ownership

The harness maintainer may add evidence under the autonomous rules. The User owns policy changes, evidence deletion, safety weakening, and legacy-harness consolidation. The fresh-context reviewer owns independent acceptance but never edits this store.
