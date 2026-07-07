# 04 — Knowledge Iteration and Reflection Protocol (F)

> Purpose: let weak models safely grow this harness with experience, while preventing rules from being quietly broken.

## 1. File Permission Tiers

| Tier | File | The model may | Requires explicit User consent |
|---|---|---|---|
| 🟢 Free write | `LESSONS.md` | Append entries per the section 2 format; trigger compaction per section 4 | Deleting the substantive content of others' entries (including past sessions') |
| 🟡 Change with evidence | `PROJECT-FACTS.md` | Add facts with verification evidence; upgrade UNVERIFIED to verified (with evidence); correct disproven facts (keep one line: "originally recorded X, disproven 2026-xx-xx, see LESSONS#n") | Deleting an entire fact |
| 🟡 Change with evidence | `CLAUDE.md` | Update file-map rows (when files are added/removed), add new file pointers to the routing table | Changing any hard rule R1–R5, or the forbidden items in the tool routing table |
| 🔴 Frozen | `01`, `02`, `03`, `04` (this file), `05` | Fix typos, dead paths, stale line numbers (mechanical corrections). Exception: `05` section 3 "circuit-breaker handover area" may be appended to when a session circuit-breaks, treated as 🟢 | **Any change to rule semantics** — including loosening thresholds, adding/removing criteria, changing retry counts |

**Iron rule**: a semantic change to a 🔴 file must first be presented to the User as "current text / proposed text / motivation (citing specific LESSONS entry numbers)"; only after consent may you Edit, and the commit message uses the `harness-rule-change:` prefix (this prefix is the alternative form of section 5's `harness:` — pick one, do not stack them). **The motivation must not be "this rule inconvenienced me in this task"** — when a rule blocks you, that is usually exactly it doing its job.

## 2. Pitfall Records (LESSONS.md) Write Format

When to write: CLAUDE.md R5 — write **the moment** you hit the pitfall, not at session end (by session end it is often compressed and forgotten).

Format (fixed five fields, total length ≤10 lines, numbers increment):

```markdown
## L{{n}} {{YYYY-MM-DD}} {{one-sentence title}}
- Symptom: {{the observed error phenomenon, including key error messages verbatim}}
- Root cause: {{the real cause (not the first guess)}}
- Lesson: {{one actionable rule, phrased as "next time X happens, do Y"}}
- Evidence: {{file:line or command output snippet}}
- Affected files: {{PROJECT-FACTS entries needing sync, or "none"}}
```

What counts as a "pitfall" (any one qualifies): (a) a wrong assumption that wasted ≥2 rounds of changes; (b) a PROJECT-FACTS record that contradicts reality; (c) a non-obvious failure mode of a tool/MCP; (d) the User corrected the model's directional judgment.
What does not count: an ordinary bug fixed on the first try; a pure requirements change.

## 3. PROJECT-FACTS Update Rules

- Threshold for adding a fact: it must have a [verification] field — output of an actually-run command, code line numbers, or the User's explicit confirmation (mark "User stated"). "I infer" cannot enter the base; write inferences as `UNVERIFIED` with the source noted.
- Line numbers drift: when citing line numbers, attach the function name (e.g. `content.js:176 rgbToRuneType`); when line numbers go stale, relocate by function name and correct mechanically.
- When a fact in the base conflicts with reality: **reality wins**. Correct immediately + record one LESSON (type b).

## 4. Compaction and Abstraction Triggers (anti-bloat)

If any condition holds, run compaction after the current task wraps up (do not interrupt work in progress):

- `LESSONS.md` has > 20 entries, or the whole file > 150 lines, or 3 consecutive low-value entries that fail section 2's "what counts as a pitfall" definition
- `PROJECT-FACTS.md` > 120 lines
- `CLAUDE.md` > 100 lines (a fattening routing hub = an early sign of system failure; handle with top priority)

Compaction algorithm (LESSONS):
1. Find entries with repeated themes (≥2 entries sharing a root cause) → abstract into one general rule.
2. Where the general rule goes: if it's a fact → merge into PROJECT-FACTS; if it's a judgment criterion → **propose** adding it to 02-JUDGMENT-MATRIX (a 🔴 file; follow the section 1 consent process).
3. Compress each abstracted original entry into one line: `## L{{n}} (abstracted into {{destination}}) original title`.
4. Record a LESSON for the compaction itself? No — just note `lessons-compaction` in the git commit message.

## 5. Anti-Corruption: Git Audit Requirements

- Any change to `.claude/harness/` or `CLAUDE.md` must be an **independent commit** (not mixed with code changes in the same commit), with message prefix `harness:`; for rule-semantics changes use `harness-rule-change:` (see section 1).
- This lets the User audit the system's evolution with one command: `git log --oneline -- .claude/harness CLAUDE.md`
- Before a model takes over a large task in a new session, it is advised to run the command above + `git diff HEAD~5 -- .claude/harness` to quickly confirm whether rules changed recently (a semantic change without the `harness-rule-change:` prefix = a corruption signal; report to the User).
