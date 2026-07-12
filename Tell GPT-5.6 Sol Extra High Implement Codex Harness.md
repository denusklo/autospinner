# Harness Bootstrap Decision Router

**Status:** RETIRED AS A STANDALONE IMPLEMENTATION PROMPT

**Canonical decision guide:** [docs/harness-bootstrap/README.md](docs/harness-bootstrap/README.md)

This file intentionally does not contain another complete Codex harness
specification. Maintaining it alongside the canonical portable integration
prompt would create duplicate instructions and eventual policy drift.

Do not paste the old version of this file into another repository. It was
hard-coded to `C:\Projects\autospinner`, assumed a Codex-first greenfield
installation, depended on a fixed model label, and did not safely integrate an
existing Claude Code harness or a neutral shared-policy layer.

Use the decision table below.

| Target repository state | Correct sequence |
|---|---|
| Claude harness exists; Codex and shared harnesses absent | Run `docs/harness-bootstrap/prompts/Portable Codex + existing Claude harness prompt.md` in Codex; it creates the shared layer while preserving Claude |
| Neither Claude nor Codex harness exists | Run `docs/harness-bootstrap/prompts/Tell CC Fable 5 Implement CC Harness.md` in Claude Code, complete its review, then run the portable Codex prompt in the same folder |
| Shared + Claude harness exists; Codex absent | Run `docs/harness-bootstrap/prompts/Portable Codex + existing Claude harness prompt.md`; it must preserve and attach to the existing shared policy |
| Both harnesses and shared policy exist | Do not bootstrap; run their validators and use the repository's maintenance workflow |
| Claude and Codex harnesses exist; shared policy absent | Do not bootstrap over either harness; run a bounded consolidation/conflict audit and obtain explicit migration approval |
| Codex harness exists; Claude harness absent | This toolkit does not yet contain the inverse Claude-attachment prompt; stop and create/review that bounded adapter prompt instead of using either greenfield prompt |

## Why two independent greenfield prompts are forbidden

Running a Claude architect prompt and an unrelated Codex architect prompt
against the same repository can create:

- two competing sources of truth
- different retry budgets and reset rules
- different completion and independent-review requirements
- conflicting commit authority
- duplicated facts and lessons
- validators that inspect only one runtime
- one runtime silently rewriting the other runtime's adapter

The canonical sequence gives the second runtime an integration assignment, not
a second greenfield architecture assignment.

## Portability requirements

Before using either canonical prompt in another repository:

1. Copy the required prompt file or paste its contents into the target runtime.
2. Replace `<PROJECT_ROOT>` with the exact absolute target path.
3. Launch the runtime from that target repository root.
4. Preserve all pre-existing dirty work.
5. Do not copy autospinner's completed harness files wholesale.
6. Do not assume model names, hooks, tools, MCP servers, tests, or shell paths;
   verify the target environment.
7. Do not commit unless explicitly requested.

## Canonical prompt files

- Stage 1, only when neither harness exists:
  `docs/harness-bootstrap/prompts/Tell CC Fable 5 Implement CC Harness.md`
- Stage 2, when a Claude harness exists and Codex must be integrated:
  `docs/harness-bootstrap/prompts/Portable Codex + existing Claude harness prompt.md`

These two files are the maintained prompt sources. This router exists only to
prevent accidental use of the superseded independent Codex bootstrap.
