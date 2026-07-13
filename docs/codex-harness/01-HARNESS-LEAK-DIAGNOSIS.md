# Harness Leak Diagnosis

**Status:** COMPLETE  
**Purpose:** Define the evidence-backed failure modes that every Codex harness control in this repository must address.  
**Intended readers:** The User, Commander/Architect agents, harness maintainers, and independent reviewers.  
**Source-of-truth status:** Architectural source of truth for the Codex harness. If another Codex-harness file conflicts with this diagnosis, stop and resolve the conflict here before changing policy. Application behavior remains sourced from current code and relevant verified project facts.  
**Related files:** [Harness index](00-README.md), [dispatch protocol](02-MODEL-DISPATCH-PROTOCOL.md), [judgment matrix](03-JUDGMENT-EXTERNALIZATION-MATRIX.md), [verification report](08-VERIFICATION-REPORT.md)

## 1. Scope and evidence baseline

This diagnosis covers Codex workflow architecture only. It does not authorize application implementation, refactoring, feature work, or bug fixing.

Verified baseline on 2026-07-10:

- Repository root: `C:\Projects\autospinner` (`Resolve-Path` and `git rev-parse --show-toplevel`).
- Branch: `master`; `origin/master` is not ahead or behind.
- Git requires per-command `-c safe.directory=C:/Projects/autospinner` because the repository owner SID differs from the current process SID. Global Git configuration was not changed.
- Pre-existing modified files: `.claude/harness/LESSONS.md`, `.claude/harness/PROJECT-FACTS.md`, `CLAUDE.md`, `algorithm.js`, `phone/autospin.js`, `phone/parallel.js`, and `verify.js`.
- Root `AGENTS.md` and `AGENTS.override.md` were absent. `.codex/` and `.agents/` existed but were empty.
- Global `~/.codex/AGENTS.md` was empty; global `AGENTS.override.md` was absent; global config did not define `project_doc_fallback_filenames`. Therefore `CLAUDE.md` was not an apparent Codex fallback.
- The exact project path is marked trusted in global Codex config. This permits a future repository `.codex` layer, but does not prove that files created during this session are already loaded.
- The repository has no package manifest, dependency lockfile, CI workflow, linter, formatter, or automated browser end-to-end suite. `node verify.js` is the canonical pure-logic regression command (`verify.js:1-12`).
- A read-only explorer ran `node verify.js`: exit `0`, `ALL CHECKS PASSED`, approximately 40.7 seconds. This is baseline evidence, not verification of the new harness.
- Official Codex documentation states that project instructions are loaded once per session, that the combined default project-instruction limit is 32 KiB, that trusted projects load project config/hooks, and that `PreToolUse` hooks are guardrails rather than a complete enforcement boundary.

### Conservative decisions made from the evidence

1. Native Windows PowerShell is the primary operating environment. Git Bash and WSL path forms are normalized by guards, but are not assumed to be the normal launch environment.
2. The dirty legacy `.claude` files are preserved unchanged. They remain evidence and application-specific guidance; the new Codex layer supersedes only legacy Codex-incompatible orchestration rules.
3. No networked MCP server is added. Global MCP/plugin changes are recommendations only.
4. The User-approved 2026-07-13 routing pins Commander/planning/review to `gpt-5.6-sol`, coding to `gpt-5.6-sol`, exploration/search to `gpt-5.6-terra`, and small mechanical work to `gpt-5.6-luna`; installed Codex `0.144.1` exposed all three identifiers and the requested reasoning levels before migration.
5. Direct hook-script tests can verify guard logic. Actual Codex hook discovery, hash trust, and lifecycle execution require a fresh session and are recorded as only partially verifiable in this session.

## 2. Ranked diagnosis

| Rank | ID | Leak | Frequency | Severity | Primary cost |
|---:|---|---|---|---|---|
| 1 | HL-01 | Codex instruction invisibility and incompatible legacy dispatch | Systemic | Critical | Focus loss, wrong tools, rediscovery |
| 2 | HL-02 | Unbounded duplicated knowledge with stale executable facts | Systemic | High | Context pollution and contradictory decisions |
| 3 | HL-03 | Advisory-only safety, retry, review, and completion controls | Frequent | Critical | Unsafe actions and unsupported completion |

## 3. HL-01 — Codex instruction invisibility and incompatible legacy dispatch

### Evidence

- No repository `AGENTS.md` or `AGENTS.override.md` existed; `.codex/` and `.agents/` contained no files (read-only inventory command, exit `0`).
- `CLAUDE.md:21-25` contains the rules that a coding agent most needs, but Codex did not have a configured fallback filename.
- `CLAUDE.md:31-36` routes work through Claude-specific `Grep`, `Glob`, `Bash`, `context7`, and `zai-mcp-server` surfaces. Several are absent from the current Codex tool registry.
- `.claude/harness/01-MODEL-DISPATCH.md:1-14` hard-codes Opus/Sonnet/Haiku roles and Claude agent parameters.
- `.claude/harness/03-DELEGATION-TEMPLATES.md:3-10` repeats model-specific dispatch and path assumptions.
- `CLAUDE.md:36` requires delegation for broad reads, but no project Codex agent existed.
- Global config contains `codegraph`, while `CLAUDE.md:35` forbids it because this repository has no index. No repository layer enforced that exclusion.

### Observable symptoms

- Every Codex session must rediscover project rules manually.
- A weaker model can treat `CLAUDE.md` as either invisible or authoritative without knowing which parts are Codex-incompatible.
- Tool calls fail because named tools are unavailable or because Bash examples are copied into PowerShell.
- Main-context scans expand because no read-only explorer role or reporting schema exists.
- Model names and capability assumptions decay independently of installed availability.

### Root cause

The existing harness was created for another agent runtime and was never projected onto Codex-native instruction, configuration, agent, skill, or hook surfaces.

### Why a weaker model is especially vulnerable

A weaker model is more likely to follow literal tool names, interpret a missing tool as a reason to retry, copy an incompatible shell command, or ignore an instruction file it was not told to load. It is also less likely to distinguish application facts from orchestration policy.

### Frequency and severity

- **Frequency:** Systemic; it affects every Codex session before task-specific work begins.
- **Severity:** Critical; no later rule is reliable if the entry point is not loaded.

### Token/context cost estimate

Estimated waste is 3,000-12,000 tokens per non-trivial task from repeated repository mapping, tool-error recovery, and copied legacy context. A wholesale read of the legacy facts and lessons adds roughly 140 KB of source text before task evidence.

### Existing controls and why they fail

- `CLAUDE.md` is concise, but it is not a native Codex instruction filename in the observed configuration.
- The legacy dispatch documents contain useful concepts, but bind those concepts to stale model and tool names.
- Global trust permits project config but supplies neither repository policy nor agent caps.

### Documentation-level solution

Create a concise root `AGENTS.md` as the permanent Codex routing hub. Define capability tiers, task classification, evidence-before-editing, exact retry budgets, circuit breakers, and source-of-truth precedence in the linked Codex harness documents.

### Physical blocking solution

- Deploy `.codex/config.toml` with workspace-write sandboxing, network disabled by default, `agents.max_depth = 1`, and a conservative thread cap.
- Deploy four narrow project agents: application coding worker, read-only harness explorer, small-mechanical harness worker, and read-only fresh-context reviewer.
- Deploy a repository skill for repeatable harness maintenance.
- Deploy a consistency validator that fails when the router, agent files, skill, hooks, or links are missing or malformed.

### Detection mechanism

- Run `node .codex/hooks/validate-harness.js`.
- At session start, ask Codex to report loaded instruction sources; absence of root `AGENTS.md` is a stop condition.
- Check that no non-empty root `AGENTS.override.md` exists.
- Record project trust and hook trust separately.

### Recovery mechanism

Stop edits, return to the repository root, run the validator, start a fresh Codex session, report loaded instructions, and re-dispatch the bounded task. Do not compensate by pasting the entire legacy harness into the conversation.

### Residual risk

Project config can be bypassed by higher-precedence runtime/admin settings. Custom agents may inherit parent MCP/plugin surfaces that cannot be completely removed by a narrow project file. A model can still ignore prose; sandbox and hook controls are defense in depth.

### Verification method

1. Parse all TOML/JSON files.
2. Confirm root `AGENTS.md` is below 32 KiB and 300 lines.
3. Confirm four agent files contain the approved model/effort routes, required fields, and intended sandbox modes.
4. Confirm `agents.max_depth = 1` and the documented thread cap.
5. In a new trusted session, report the loaded instruction/config/hook sources and inspect `/hooks` or the equivalent UI.

## 4. HL-02 — Unbounded duplicated knowledge with stale executable facts

### Evidence

- `CLAUDE.md:21` mandates reading all of `.claude/harness/PROJECT-FACTS.md` before action.
- `PROJECT-FACTS.md` is 66,040 bytes/131 lines; line 115 alone is 12,967 characters; 27 lines exceed 500 characters and 11 exceed 2,000.
- `LESSONS.md` is 76,716 bytes/297 lines; 44 lines exceed 500 characters.
- `.claude/harness/04-KNOWLEDGE-PROTOCOL.md:42-46` sets compaction triggers of 20 lessons/150 lines and 120 facts lines. Both are already exceeded.
- Recent incident narratives are duplicated between `PROJECT-FACTS.md:115-127` and `LESSONS.md:203-296`.
- `CLAUDE.md:10` says 148 checks while `PROJECT-FACTS.md:37` says 151; hard-coded totals drift as tests change.
- `PROJECT-FACTS.md:60` contains stale class line positions.
- `.claude/harness/06-RECOGNITION-PROTOCOL.md:83` references missing `verify_hazard.js`.
- `LESSONS.md:1` says append-only while `04-KNOWLEDGE-PROTOCOL.md:48-52` requires in-place compaction.
- `LESSONS.md:297` is an orphaned continuation associated with an earlier lesson, showing structural drift.

### Observable symptoms

- Relevant facts are buried inside long incident histories.
- Physical line counts understate token cost because records are collapsed into giant lines.
- Old counts and file positions look authoritative after they are stale.
- Duplicated lessons can disagree or be updated on only one side.
- The Commander spends decision context on recognition history unrelated to the current task.

### Root cause

The same files serve as current facts, chronological incident log, verification archive, and operating instructions. Compaction is advisory, line-count based, and conflicts with append-only rules.

### Why a weaker model is especially vulnerable

A weaker model is less able to rank evidence by recency, detect that two entries share one root cause, or distinguish a historical failed approach from current policy. Large reads also displace the task and acceptance criteria from its working context.

### Frequency and severity

- **Frequency:** Systemic for every task that follows the mandatory full-read instruction.
- **Severity:** High; stale facts can produce wrong edits even when the workflow appears compliant.

### Token/context cost estimate

The two legacy knowledge files total 142,756 bytes before the router and protocols. Depending on encoding and content, a wholesale read can consume roughly 30,000-45,000 tokens. Re-reading after a failed attempt compounds the cost.

### Existing controls and why they fail

- The legacy protocol defines compaction thresholds, but nothing executes or blocks when thresholds are exceeded.
- Append-only history preserves evidence, but conflicts with consolidation and creates orphaned fragments.
- Line references are easy to add but inherently drift-prone.

### Documentation-level solution

- Keep `AGENTS.md` as routing only; never copy incident narratives into it.
- Use `docs/codex-harness/lessons/PITFALLS.md` for short, structured, verified Codex workflow lessons only.
- Treat current application code and executed checks as authoritative over stored line numbers or check totals.
- Search legacy facts/lessons by task keyword and read only the relevant section; do not load both wholesale.
- Define explicit `CONFIRMED`, `PROVISIONAL`, `OBSOLETE`, and `SUPERSEDED` states and non-destructive archival rules.

### Physical blocking solution

The harness validator enforces byte/line ceilings, broken-link detection, missing referenced paths, duplicate lesson IDs, agent/config presence, empty files, root-override masking, and secret-pattern scans. It warns or fails when compaction thresholds are crossed.

### Detection mechanism

- `AGENTS.md` over 300 lines or 24 KiB: fail. The separate Codex product default is a 32 KiB combined project-instruction ceiling, not this harness budget.
- `PITFALLS.md` over 400 lines, or three records sharing one root-cause tag: compaction required.
- Missing local Markdown target, duplicate pitfall ID, invalid JSON/TOML, or empty permanent mechanism: fail.
- A hard-coded regression count in the Codex router: fail review.

### Recovery mechanism

Stop expanding the router. Preserve original evidence, mark superseded records, compact repeated lessons into one rule plus references, run a fresh-context review, and rerun the validator. Never silently delete historical evidence.

### Residual risk

The large legacy `.claude` knowledge files remain because they are dirty, semantics-frozen, and outside this Codex-only migration. They remain a cost if a future agent ignores targeted-reading rules.

### Verification method

1. Run the validator and local-link check.
2. Measure file bytes, physical lines, and maximum line length.
3. Search for known stale references (`148 checks`, `verify_hazard.js`, hard-coded class positions) and ensure the Codex router does not repeat them.
4. Have a fresh reviewer locate a relevant pitfall without reading the full legacy corpus.

## 5. HL-03 — Advisory-only safety, retry, review, and completion controls

### Evidence

- `.claude/harness/00-DIAGNOSIS.md:28-45` calls routing prose “physical blocking measures,” but no executable guard existed.
- Ignored `.claude/settings.local.json:2-42` contains 36 allow entries and zero deny/ask entries, including broad Node/Python/Bun/ADB and user-directory reads. It is Claude-specific and not a Codex enforcement layer.
- `.claude/harness/01-MODEL-DISPATCH.md:38-57` uses ambiguous retry accounting: per-model attempts, an across-chain cap, and a counter reset when the symptom changes.
- `.claude/harness/01-MODEL-DISPATCH.md:61` permits changes of 20 lines or fewer to skip independent review.
- `.claude/harness/02-JUDGMENT-MATRIX.md:37-38` permits some browser work to finish with an expected test guide rather than an observed result.
- `.claude/harness/05-HANDOVER-LETTER.md:40` claims review/read-back evidence that remained only in a prior conversation.
- `.claude/harness/04-KNOWLEDGE-PROTOCOL.md:56-58` mandates harness commits, conflicting with the current rule that commits require explicit User request.
- Git commits `fb42c9e`, `50e47cc`, `96d40bc`, `c68b33d`, `d3cc55d`, and `a12cdb2` mix application and harness files despite the independent-commit rule.
- The working tree already contains unrelated User changes on `master`, increasing accidental-overwrite risk.
- Two PowerShell probes in this audit failed for syntax/version reasons. The path was abandoned after bounded attempts and replaced with independent evidence, illustrating the need for executable retry accounting.

### Observable symptoms

- A model can repeat a failing command with superficial changes.
- A small but high-risk change can self-review.
- “Tests not run” can be converted into confident prose without a durable blocker.
- Destructive or out-of-repository commands rely on model discretion.
- Safety rules can be weakened or ignored without a machine-visible failure.
- Harness and application scope become mixed in commits and completion reports.

### Root cause

Policy, enforcement, evidence, and acceptance are conflated. The repository contains advice but no Codex hook, sandbox default, machine-readable check, reviewer role, or durable verification artifact.

### Why a weaker model is especially vulnerable

A weaker model tends to equate syntax success with behavioral success, interpret a changed error as permission to reset retries, minimize the risk of a small diff, and accept its own summary as independent evidence.

### Frequency and severity

- **Frequency:** Frequent; history shows repeated mixed-scope delivery and every task reaches a completion decision.
- **Severity:** Critical; this leak permits destructive actions and false completion.

### Token/context cost estimate

Each blind retry commonly adds 1,000-5,000 tokens of commands, errors, hypotheses, and repair. A multi-step loop can consume the majority of a session while reducing context quality.

### Existing controls and why they fail

- The two-strikes concept is useful but has contradictory counters and no persistent attempt trace.
- The legacy completion matrix is not machine checked.
- Self-review exceptions are based on line count instead of risk.
- Local permissions are broad, ignored, and runtime-specific.

### Documentation-level solution

- Define one canonical retry token: `RETRY_BUDGET=2_PER_CAPABILITY_TIER`; a retry requires new evidence, hypothesis, tool, reproduction, or corrected environment assumption.
- Escalate a low-tier tool/path/syntax error immediately; do not repeat the identical command.
- Require a three-part dispatch package and a structured failure trace.
- Require independent fresh-context acceptance for every write task, regardless of diff size.
- Define a ten-category completion scorecard and explicit acceptable evidence when a test cannot run.
- Define User circuit breakers and non-circuit-breakers.

### Physical blocking solution

- Project sandbox: workspace-write, network disabled by default, approval on request.
- `PreToolUse` guard: deny recognized destructive commands, dependency changes, credential/deployment actions, relative traversal, and detectable writes outside the repository; normalize Windows/Git-Bash/WSL path forms and inspect existing paths for reparse escapes.
- `Stop` guard: when the final message makes a completion claim, require machine-detectable files-changed, command/result, independent-review, and limitation fields.
- Consistency validator: parse configuration, enforce paths/limits, and scan for secrets.
- Read-only reviewer agent: cannot turn its own second pass into “fresh context.”

### Detection mechanism

- Hook emits a deny decision with a corrective next step.
- Final report records every command, exit code, and interpretation.
- Reviewer reports findings by severity and re-reviews corrections.
- Git start/end status and diff path comparison detect scope expansion.

### Recovery mechanism

Stop the failing path; do not reset, clean, stash, or overwrite. Record the concise failure trace, escalate capability, revert only session-owned changes if the chosen design is abandoned, rerun the smallest safe reproduction, and require independent acceptance before delivery.

### Residual risk

Official documentation states that current `PreToolUse` interception is incomplete and is not a security boundary. A script launched by an allowed command can conceal writes. Runtime/admin overrides can relax project sandboxing. The guard therefore supplements, but does not replace, User approvals and OS sandboxing.

### Verification method

1. Feed allowed and blocked JSON samples to each hook script and assert decisions/exit codes.
2. Test native Windows, Git Bash, WSL, traversal, and external absolute path samples.
3. Parse `.codex/hooks.json`; confirm hooks exist in JSON only, not duplicated inline in TOML.
4. Simulate an unsupported completion message and a compliant evidence-bearing message.
5. Run independent read-only review with no unresolved Critical/High findings.

## 6. Control-to-leak traceability

| Planned control | HL-01 | HL-02 | HL-03 |
|---|:---:|:---:|:---:|
| Root `AGENTS.md` router | X | X | X |
| `.codex/config.toml` sandbox and agent caps | X |  | X |
| Explorer/worker/reviewer agents | X |  | X |
| Repository maintenance skill | X | X | X |
| `PreToolUse` boundary/destructive guard |  |  | X |
| `Stop` completion-evidence guard |  |  | X |
| Consistency validator | X | X | X |
| Structured lessons and compaction protocol |  | X | X |
| Durable adversarial and verification reports |  | X | X |

No permanent mechanism may be deployed unless it maps to at least one cell in this table.

## 7. Capability limits

Decomposition, stronger models, deterministic checks, and independent verification improve reliability. They cannot guarantee correct judgment when the task depends on:

- Ambiguous business requirements
- Subjective aesthetics
- Product taste
- Brand voice
- Unstated stakeholder preferences
- Conflicting objectives without a priority owner

When a weak model encounters one of these limits, it must:

1. Identify the ambiguous decision.
2. Present two or three concrete options.
3. State the observable trade-offs.
4. Recommend one option only when evidence supports it.
5. Ask one narrowly framed User question.
6. Do not fabricate preferences.
7. Do not continue irreversible implementation while the decision remains unresolved.

## 8. Initial unresolved risks

- Actual loading of the new repository config and hooks cannot be proven until a new trusted session starts and accepts/reviews the hook hashes.
- Current Codex hook interception does not cover every possible shell or non-shell write path.
- No automated browser/extension acceptance or deterministic Android recognition fixture currently exists.
- Global `codegraph`, `node_repl`, enabled plugins, connector permissions, and a notifier remain inherited trust surfaces; they are not changed here.
- Two Codex launchers are present on PATH and reported different versions during inspection. The resolved `codex` command reported `codex-cli 0.144.1`; another installed executable reported `0.144.0-alpha.4`. Model and hook behavior must be verified against the launcher actually used.
- The legacy facts/lessons corpus remains oversized and internally stale. This session does not rewrite dirty or semantics-frozen legacy files.
- User judgment remains necessary for business, aesthetic, product, and irreversible operational decisions.

## 9. Diagnosis acceptance

This diagnosis is accepted as the specification for subsequent harness work when:

- Every deployed mechanism maps to a documented leak.
- No application source file is touched.
- Dirty legacy files are preserved.
- No global configuration is changed.
- Every limitation is carried into the final verification report.
