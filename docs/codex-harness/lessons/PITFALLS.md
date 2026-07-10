# Codex Harness Pitfalls

**Status:** COMPLETE
**Purpose:** Store only verified or explicitly provisional Codex workflow failure records in a compact structured form.
**Intended readers:** Harness maintainers, Commanders, and fresh-context reviewers.
**Source-of-truth status:** Canonical Codex workflow lesson store; format and authority are defined in [05-KNOWLEDGE-ITERATION-PROTOCOL.md](../05-KNOWLEDGE-ITERATION-PROTOCOL.md).
**Related files:** [lessons index](README.md), [diagnosis](../01-HARNESS-LEAK-DIAGNOSIS.md)

## CH-20260710-001 — Legacy routing was invisible to Codex

- Status: PROVISIONAL
- Date: 2026-07-10
- Task type: harness maintenance
- Symptom: Codex had no repository-native instruction source even though a detailed Claude harness existed.
- Root cause: The root contained `CLAUDE.md` but no `AGENTS.md`; project `.codex/` and `.agents/` were empty, global `AGENTS.md` was zero bytes, and no fallback filename configured Codex to load `CLAUDE.md`.
- Failed approach: Rely on a tool-specific legacy router and assume another coding agent will discover it.
- Evidence: `CLAUDE.md:1-52`; `docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md:42-117`; Phase 1 inventories found no root override or Codex fallback.
- Correct approach: Keep a concise root `AGENTS.md` and route detail to Codex-native project documents, agents, hooks, and skills.
- Prevention mechanism: Root instruction router, project config, missing-entry-point validation, and new-session loaded-instruction check.
- Verification: Structural files can be validated in this session; actual loading remains `PARTIALLY VERIFIED` until a new trusted Codex session reports its instruction chain.
- Generalization scope: Applies when repositories depend on instruction filenames specific to another agent; does not mean legacy files must be deleted.
- Confidence: high for root cause; prevention loading is pending a new session.
- Related files: `AGENTS.md`, `.codex/config.toml`, `docs/codex-harness/00-README.md`
- Expiration or review condition: Review when Codex instruction discovery behavior changes or after the first new-session loading check.

## CH-20260710-002 — Line-count-only compaction missed context-heavy records

- Status: CONFIRMED
- Date: 2026-07-10
- Task type: harness maintenance
- Symptom: Mandatory facts and lesson sources exceeded their own compaction thresholds and contained very long physical lines, while the routing rule still required wholesale reading.
- Root cause: Advisory compaction used physical line/entry thresholds without an executable byte, maximum-line, duplication, or instruction-budget gate.
- Failed approach: Treat a documented compaction threshold as self-enforcing and use long table rows to retain entire incident histories.
- Evidence: `.claude/harness/PROJECT-FACTS.md` was 66,040 bytes/131 lines with a 12,967-character line; `.claude/harness/LESSONS.md` was 76,716 bytes/297 lines; diagnosis evidence is at `docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md:119-198`.
- Correct approach: Route targeted facts, measure both bytes and lines, limit individual line length, preserve immutable IDs, and require independently reviewed compaction.
- Prevention mechanism: `validate-harness.js` budgets plus the quantitative thresholds and archival process in the knowledge protocol.
- Verification: `node .codex/hooks/validate-harness.js --self-test` exited 0 with `VALIDATOR_SELF_TEST PASS 6/6`; the full validator detected the deliberately unfinished reports and a 501-character skill line, proving active status/limit enforcement.
- Generalization scope: Applies to instruction, fact, and lesson stores where physical lines can hold large records; not to generated logs that are never loaded as instructions.
- Confidence: high; both the historic threshold breach and executable detection behavior were directly observed.
- Related files: `.codex/hooks/validate-harness.js`, `docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md`, `docs/codex-harness/lessons/README.md`
- Expiration or review condition: Review after any threshold/parser change or the first compaction.

## CH-20260710-003 — Prose-only controls allowed unsupported completion

- Status: CONFIRMED
- Date: 2026-07-10
- Task type: harness maintenance
- Symptom: The legacy harness called documentation rules “physical blocking measures,” allowed small changes to skip independent review, and preserved no durable verification report for its own completion claim.
- Root cause: Retry, safety, review, and completion obligations were advisory text with no repository hook, validator, reviewer role, or required evidence shape.
- Failed approach: Ask the same implementation context to remember, enforce, and attest to every rule.
- Evidence: `.claude/harness/00-DIAGNOSIS.md:28-45`; `.claude/harness/01-MODEL-DISPATCH.md:59-67`; `.claude/harness/05-HANDOVER-LETTER.md:38-40`; diagnosis evidence is at `docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md:199-285`.
- Correct approach: Separate Commander, bounded worker, and fresh-context reviewer; block high-risk commands; require completion evidence fields; persist review and verification reports.
- Prevention mechanism: Project agent definitions, PreToolUse guard, Stop completion-evidence guard, hook fixture tests, and TC-01 through TC-10.
- Verification: `node .codex/hooks/test-hooks.js` exited 0 with `HOOK_TESTS PASS 46/46`, including separate Commander/subagent completion schemas, Critical/High counts, quoted Windows/Git Bash/WSL/POSIX paths, common copy/move/delete aliases, mandatory-control update/move/delete cases, destructive actions, self-disable, unauthenticated-reviewer limitation, and invalid-input cases.
- Generalization scope: Applies to deterministic workflow obligations; hooks remain defense in depth and cannot resolve subjective judgment or unavailable infrastructure.
- Confidence: high for root cause and deterministic fixture behavior; actual Codex hook loading still requires a new trusted session.
- Related files: `.codex/hooks.json`, `.codex/hooks/pre-tool-use-guard.js`, `.codex/hooks/completion-evidence-guard.js`, `.codex/agents/fresh-context-reviewer.toml`
- Expiration or review condition: Review after first trusted-session execution or a Codex hook schema change.
