# Harness Bootstrap Decision Guide

**Status:** COMPLETE
**Purpose:** Select the only safe Claude Code/Codex harness bootstrap sequence for a target repository's current state.
**Intended readers:** The User and the first architecture-capable Claude Code or Codex session entering another repository.
**Source-of-truth status:** Routing guide only. The linked prompts own bootstrap execution; after installation, the target repository's shared policy and native routers own workflow authority.

## 1. Authority and scope

This toolkit prevents two independent runtime architects from creating competing repository policies. It does not authorize application development, commits, destructive Git operations, credential changes, global configuration changes, dependency changes, or copying autospinner's completed harness into another repository.

The intended final ownership is:

| Layer | Owner |
|---|---|
| Cross-runtime safety, retry, review, completion, commit, evidence, and knowledge-routing invariants | Neutral shared policy in the target repository |
| Claude models, Agent syntax, tools, hooks, permissions, and Claude procedures | Claude-native router and adapter |
| Codex models, agents, skills, tools, hooks, configuration, and Codex procedures | Codex-native router and adapter |
| Application behavior | Current code, executed tests, and verified runtime observations |
| Application facts and history | The target repository's existing canonical stores, read in targeted form |

## 2. Repository-state decision matrix

Choose exactly one mutually exclusive row before opening a bootstrap session.

| Target repository state | Required action |
|---|---|
| Neither Claude nor Codex harness exists | Run Stage 1 in Claude Code; after its independent PASS, run Stage 2 in Codex |
| Claude harness exists; Codex and shared harnesses are absent | Skip Stage 1 and run Stage 2 in Codex |
| Claude and shared harnesses exist; Codex harness is absent | Run Stage 2 in Codex; preserve and attach to the existing shared policy |
| Claude, Codex, and shared harnesses all exist | Do not bootstrap; run validators and the repository's maintenance workflow |
| Claude and Codex harnesses exist; shared policy is absent | Do not bootstrap over either native harness; perform a bounded consolidation/conflict audit and obtain explicit migration approval |
| Codex harness exists; Claude harness is absent | Stop. This toolkit does not yet contain the inverse Claude-attachment prompt |

If repository evidence does not fit exactly one row, stop and inventory the instruction surfaces before choosing a prompt.

## 3. Canonical two-stage sequence

### Stage 1 — Claude-first bootstrap

Use [Tell CC Fable 5 Implement CC Harness.md](prompts/Tell%20CC%20Fable%205%20Implement%20CC%20Harness.md) only when neither native harness exists.

Stage 1:

- builds the Claude-native harness only;
- keeps `CLAUDE.md` concise;
- records candidate shared rules without claiming authority for Codex;
- does not create `AGENTS.md`, `.codex/**`, `.agents/**`, `docs/codex-harness/**`, or `docs/shared-harness/**`;
- produces an ownership handoff for Stage 2;
- requires backups, observed validation, and fresh-context read-only acceptance.

### Stage 2 — Codex integration and shared policy

Use [Portable Codex + existing Claude harness prompt.md](prompts/Portable%20Codex%20%2B%20existing%20Claude%20harness%20prompt.md) only when a Claude harness exists and a Codex harness does not.

Stage 2:

- preserves and classifies the Claude harness;
- creates or minimally reconciles the neutral shared policy;
- builds Codex-native controls from current installed evidence;
- makes only bounded Claude adapter changes needed to link shared authority;
- does not rewrite application facts, lessons, recognition semantics, or history;
- installs drift validation across both native routers;
- requires a fresh-context read-only correction review.

Stage 2 is an integration assignment, not a second greenfield architecture assignment.

## 4. Unsupported or maintenance states

- If Codex already has an established harness, Stage 2 must stop rather than overwrite it.
- If both native harnesses exist without a shared policy, use a separately approved consolidation plan.
- If only Codex exists, create and review an inverse Claude-attachment prompt before proceeding.
- If all three layers exist, use validators and maintenance procedures; bootstrap prompts are obsolete for that repository.
- If a target runtime cannot provide a fresh read-only reviewer, report the limitation instead of treating self-review as independent acceptance.

## 5. Prompt inventory and usage

1. Copy or paste only the prompt required by the decision matrix.
2. Replace every `<PROJECT_ROOT>` token with the exact absolute target path.
3. Launch the named runtime from that target repository root.
4. Record and preserve all pre-existing changes before any write.
5. Verify installed model, hook, tool, MCP, agent, shell, and configuration support; never inherit autospinner assumptions.
6. Do not copy completed autospinner harness files into the target repository.
7. Do not commit unless the User explicitly requests a commit.
8. Finish and independently accept one stage before starting the next.

The historical root file `Tell GPT-5.6 Sol Extra High Implement Codex Harness.md` is a retired decision router, not an implementation prompt.

## 6. Drift-prevention rules

- One repository has one neutral shared authority for cross-runtime invariants.
- Native routers own runtime-specific mechanisms and may be stricter, never weaker.
- Never run two independent greenfield harness architects in the same repository.
- Never duplicate one fact, retry budget, completion gate, or commit rule in competing stores.
- A shared validator must detect missing router links and known conflicting legacy clauses.
- An existing shared policy is User work: audit and preserve it rather than replacing it.
- Existing facts, lessons, dirty files, and historical evidence remain untouched unless explicitly in scope.
- Every existing file changed during bootstrap receives a timestamped untouched backup.
- Every bootstrap ends with read-back, parser/validator checks, initial/final Git evidence, and distinct read-only acceptance.
