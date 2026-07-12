# TOS Auto Spinner — Project Entry Point (Claude Code Routing Hub)

Chrome MV3 extension: on the orb-spinning simulator <https://louisalflame.github.io/TOSwebsite/canvas.html>, it automatically reads the board (canvas pixels) and simulates mouse drags to spin orbs. Vanilla JS, no build step, no package dependencies.

## Shared Policy Authority

SHARED_POLICY_AUTHORITY=docs/shared-harness/REPOSITORY-POLICY.md

The shared repository policy at [docs/shared-harness/REPOSITORY-POLICY.md](docs/shared-harness/REPOSITORY-POLICY.md) owns all cross-runtime invariants: safety, retry, review, commit, evidence, scope, and knowledge-routing rules. This file plus `.claude/harness/01`–`05` are the Claude Code native adapter: Claude-specific tools, models, Agent syntax, and permissions stay Claude-owned here, and may be stricter but never weaker than the shared policy.

Whenever shared-harness files or native adapter files (`CLAUDE.md`, `.claude/harness/**`, `AGENTS.md`, `.codex/**`, `docs/codex-harness/**`) change, run the shared validator and it must pass completely:

```powershell
node docs\shared-harness\validate-shared-harness.js --self-test
node docs\shared-harness\validate-shared-harness.js
```

## File Map

| File | Responsibility | Notes |
|---|---|---|
| `algorithm.js` | Pure logic: Board / all Solvers / `BoardSimulator` (exact simulation) / `DoraSolver` (primary engine) | Change this → must run `node verify.js` (hard rule R2) |
| `verify.js` | Standard regression suite (runs directly under Node) | When adding algorithm.js behavior, add a matching check |
| `content.js` | Browser side: canvas rune reading, mouse event simulation, control panel | Change this → cannot be verified locally, must follow the structured log contract |
| `popup.html` / `popup.js` | Extension popup UI | Low-risk area |
| `manifest.json` | MV3 config; content_scripts order is algorithm.js → content.js | Order must not be reversed |
| `test-algorithm.html` | Manual browser test page | For User manual testing only, not automated verification |
| `phone/autospin.js` | Real Android game: adb capture → recognition → DoraSolver → MaaTouch drag | Facts in PROJECT-FACTS section 5; `--dry` solves without touching; demo account only |
| `phone/parallel.js` | Node-ONLY worker_threads sharding driver (`solveDoraParallel` / `solveClearAllParallel`, `--workers`) | Facts in PROJECT-FACTS P18; algorithm.js stays browser-pure — solver behavior changes belong there (R2) |
| `docs/autodora-algorithm-spec.md` | Implementation reference for new solvers (full DoraHeart V2 beam search spec) | ⚠️ The spec's rune encoding is **different** from this project (Water/Fire swapped); read PROJECT-FACTS F9 before implementing |

## Hard Rules R1–R6 (violating any one = this work is not acceptable)

- **R1 Search first, load targeted**: identify which facts own the task, then read only the targeted `.claude/harness/PROJECT-FACTS.md` sections and only the relevant `LESSONS.md` entries. Never load either file wholesale. Assumptions that contradict the facts base must not be written into code.
- **R2 Node verification**: Whenever `algorithm.js` is modified, you must run the Node verification script and paste the actual output before delivery (command in PROJECT-FACTS section 4). "It should run" does not count as verification.
- **R3 Structured logs**: Whenever the User must report back from the browser, the code must output single-line `[TOS] KEY=value` markers, and you must tell the User to paste only the `[TOS]` lines. Asking for the entire console page is forbidden.
- **R4 Retry budget (shared-policy mirror)**: at most **2 materially different repair attempts per capability tier** for the same retry key `(bounded goal, failing acceptance check, observed symptom)`. A changed error message, symptom wording, or new regression in the same patch chain does **not** reset the counter. On exhaustion, stop changing logic — add diagnostic instrumentation or escalate per `01-MODEL-DISPATCH.md`.
- **R5 Record pitfalls immediately, routed by owner**: application facts → targeted PROJECT-FACTS sections; application/Claude history → `LESSONS.md`; cross-runtime workflow pitfalls → `docs/codex-harness/lessons/PITFALLS.md` (format in `04-KNOWLEDGE-PROTOCOL.md`). Write it right away — do not wait until the end of the session.
- **R6 Independent review and commit authority**: every write requires acceptance by a distinct fresh-context, read-only reviewer — there is no small-change exemption (rules in `01-MODEL-DISPATCH.md` section 5). Commits happen only on an explicit User request; policy-edit approval does not grant commit authority.

## Tool Routing Table (look it up and use it; do not invent your own)

| Task type | Use this | Forbidden |
|---|---|---|
| Find code/files | Grep / Glob; fuzzy search across many files → dispatch an Explore subagent | Running find/grep via Bash |
| Run board logic | Bash: `node ...` (see PROJECT-FACTS section 4) | Asking the User to open a browser to test pure logic |
| Look up Chrome extension API | context7 MCP | Answering API details from memory |
| User pastes a game screenshot | zai-mcp-server image analysis | — |
| Other MCPs (consult7 / web-search-prime / web-reader / codegraph) | **Never used in this project** (codegraph has no index built) | Calling them |
| Bulk file reading / repo scanning | Dispatch a subagent (rules in `01-MODEL-DISPATCH.md`) | Commander reading >3 files itself |

## Harness File Routing (.claude/harness/)

| File | When to read |
|---|---|
| `PROJECT-FACTS.md` | Before hands-on tasks: search first, then read **only the targeted sections** that own the task (never the whole file) |
| `01-MODEL-DISPATCH.md` | When dispatching a subagent, or escalating/de-escalating after consecutive failures |
| `02-JUDGMENT-MATRIX.md` | When unsure "should I stop / does this count as done / should I ask the User" |
| `03-DELEGATION-TEMPLATES.md` | When writing a delegation prompt (apply the template directly) |
| `04-KNOWLEDGE-PROTOCOL.md` | When updating harness files / writing LESSONS |
| `LESSONS.md` | When an error feels familiar: search for the symptom and read only the matching entries (never load it wholesale) |
| `00-DIAGNOSIS.md` | When you want to understand why this system exists (background, not rules) |
| `05-HANDOVER-LETTER.md` | Before a new session takes over a large task |
| `06-RECOGNITION-PROTOCOL.md` | When the User reports a new visual board pattern/overlay needing recognition + solver wiring |

> No CLAUDE.local.md: this is a single-person project with no machine-private settings to isolate; local permissions are managed by `.claude/settings.local.json`. Do not create one.
