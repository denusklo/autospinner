# 00 — Harness Leak Diagnosis (A)

> Author: Claude Fable 5 (2026-07-07). Readers: future Opus / Sonnet / Haiku and the User.
> Status: this file is the "why" of the entire harness. The other files (01–05) are the "how". When rules conflict, the specific provisions in 01–04 take precedence; this file is background only.

## 1. Diagnosis Scope and Method

The following evidence sources were examined (static scan on 2026-07-07; no global files were modified):

- `~/.claude/settings.json`, `settings.local.json`, `keybindings.json`, `plugins/`
- `~/.claude.json` (user-level MCP servers, project list)
- `~/.claude/history.jsonl` (1786 prompt entries; sampled ~25 for this project)
- All files in this repo + `.claude/settings.local.json`
- Project memory directory (`~/.claude/projects/C--Projects-autospinner/memory/`, empty)
- Node live test: `node -e "require('./algorithm.js')"` succeeded; the 7 exported classes (Board, MatchFinder, PathFinder, and the solvers) are directly callable

## 2. Pain Point #1: Blind-Loop Iteration (biggest token waste, easiest way to lose focus)

### Symptoms and Evidence
This project's development history is a textbook "blind loop": the model writes browser-automation code → cannot see the browser itself → the User tests manually and pastes 100+ lines of console log (full of emoji boards) → the model guesses the cause → changes code again → paste again. history.jsonl shows many consecutive rounds of:

- "no, the rune only dragged from 0,0 to 2,0. maybe you are moving too fast?" (the User guessing the root cause for the model)
- Whole log blocks and emoji boards pasted repeatedly (several thousand tokens each time)
- The same symptom (incomplete drag) fixed by repeatedly modifying the same logic with no new evidence

Each blind iteration costs ≈ 2-4k tokens of pasted log + the model re-reading context + one wrong change. 5 blind iterations ≈ 10x the cost of one correct diagnosis.

### Physical Blocking Measures (already institutionalized)
1. **Node verification first**: `algorithm.js` is pure logic (verified `require`-able). For any board/path/combo logic, always write a Node script and verify locally first; "change it and ask the User to test in the browser" is forbidden. Concrete commands in `PROJECT-FACTS.md` section 4.
2. **Structured log contract**: for any browser behavior the User must report, the code must output single-line machine-readable markers (e.g. `[TOS] BOARD={...}`, `[TOS] DRAG_TRACE=[...]`), and explicitly tell the User "only paste the lines starting with `[TOS]`". Asking the User to paste the entire console is forbidden.
3. **Hypothesis first**: before modifying code, you must write down "my hypothesis is X; if it holds, the log will show Y / will not show Z". If you cannot state a verification signal, you may not touch the code (criteria in `02-JUDGMENT-MATRIX.md` matrix one R1-3).
4. **Two-strikes rule**: if 2 consecutive changes fail to fix the same symptom → a 3rd logic change is forbidden; you must switch to "adding instrumentation" (insert diagnostic logs) or escalate the model (see `01-MODEL-DISPATCH.md` section 4).

## 3. Pain Point #2: MCP / Tool Overload and Misuse

### Symptoms and Evidence
- 6 MCP servers are mounted at the user level (consult7, context7, zai-mcp-server, web-search-prime, web-reader, codegraph), **unconditionally loaded in every session**. This project is a vanilla JS Chrome extension; 90% of tasks only need Read/Grep/Edit/Node.
- codegraph has no index built for this project (no `.codegraph/`), yet 8 codegraph permissions remain resident in `settings.json` — pure dead weight, and weak models seeing already-allowed tool names are prone to calling them by mistake.
- zai-mcp-server needs an `npx -y` cold start; on failure, weak models (especially Haiku) tend to retry the same call rather than take another path.

### Physical Blocking Measures (already institutionalized)
1. **Tool routing table**: `CLAUDE.md` has a built-in "task type → the one correct tool" lookup table, plus this project's "forbidden list". Weak models don't need to judge — just look it up.
2. **MCP whitelist principle**: within this project's tasks, MCP has only two legitimate uses — `context7` (looking up Chrome extension API docs) and `zai-mcp-server` image analysis (when the User pastes a game screenshot). Any other MCP call is treated as a routing error.
3. **Lock tools when delegating**: the delegation templates (`03-DELEGATION-TEMPLATES.md`) require the commander to explicitly list the tools a subagent may use in the work order; going beyond that list is an acceptance failure.
4. **Recommendation for the User (not executed this time, see section 5)**: move unused MCP servers from the user level into each project's `.mcp.json`, loaded on demand.

## 4. Pain Point #3: Zero Persistent Knowledge → every session re-does archaeology

### Symptoms and Evidence
- No CLAUDE.md at global or project level; project memory directory empty; no hooks/commands/agents at all.
- As a result, facts paid for with real money in past sessions — "the correct canvas is DragCanvas, not BarCanvas", "light rune measured RGB=(136,85,0)", "dragging too fast drops the rune" — exist only in old conversations. Weak models in new sessions inevitably hit the same pitfalls again, or worse: write code directly on top of wrong assumptions.

### Physical Blocking Measures (already institutionalized)
1. **`CLAUDE.md` routing hub**: auto-loaded every session, <100 lines, containing only the architecture map + hard rules + file routing.
2. **`PROJECT-FACTS.md` facts base**: every fact carries [verification method] [verification date]; unverified ones are marked `UNVERIFIED`. Look it up before writing code.
3. **`LESSONS.md` pitfall ledger**: record pitfalls immediately; format and compaction mechanism in `04-KNOWLEDGE-PROTOCOL.md`.

## 5. Global Environment Debt (per User instruction, not touched this time — recorded only)

The following issues are outside the repo and left for the User to decide (copy-paste to execute):

| # | Issue | Suggested action |
|---|---|---|
| 1 | `~/.claude/settings.json` pins `model` to `claude-fable-5[1m]`, which no longer applies after this session | Run `/model` to switch back to a daily model (Opus 4.8 recommended) |
| 2 | `~/.claude/settings.local.json` contains 20+ WireGuard/network-forensics PowerShell permissions (leftovers from another project) | Move them to that project's `.claude/settings.local.json`, or delete them |
| 3 | `~/.claude.json` `mcpServers` contains plaintext API keys (consult7's Gemini key, context7 key, z.ai key) | Switch to environment-variable references; rotate any key that entered git history or was pasted to a third party |
| 4 | 6 MCP servers resident globally | Keep context7; move the rest into each project's `.mcp.json`, enabled on demand |
| 5 | codegraph permissions resident but this project has no index | To use it: run `codegraph init` in the project root; otherwise: remove those 8 allow entries from settings.json |

## 6. Honesty Clause: The Capability Limits of This Harness

Decomposition + isolated verification can bring weak models close to top-tier quality in these domains: **logical correctness, regression protection, mechanical refactoring, format compliance**. In the following domains weak models are doomed to fail; the system can only contain the damage, not cure it:

| Limit domain | Concrete example in this project | Mandatory standard response for weak models |
|---|---|---|
| Perceptual judgment | "does the drag look smooth", "does the animation look human" | No adjectives allowed. Convert to measurable proxy metrics (ms per movement step, px spacing between path points); offer 2-3 parameter sets and let the User pick one. |
| Open-ended algorithm taste | how large should beam width be, how to weight the scoring function | No gut-feel parameter changes. Run A/B: fix 10 test boards, run each parameter set once, report a combo-count comparison table, let the numbers decide. Test-board generation method in `PROJECT-FACTS.md` section 4. |
| Business/aesthetic decisions | whether to redesign the UI panel, feature trade-offs | Circuit-break and ask the User directly (`02-JUDGMENT-MATRIX.md` matrix three C5), presenting 2-3 concrete options with their costs; do not decide on your own. |
| Facts that cannot be verified | the simulator's internal implementation, undocumented behavior | Mark `UNVERIFIED` and write into PROJECT-FACTS; design an experiment the User can verify in one click. Writing it as a statement of fact is forbidden. |

**Overall principle: a weak model's value lies in "verifiable execution", not "unverifiable judgment". Any task for which no verification method can be designed is a circuit-breaker point.**
