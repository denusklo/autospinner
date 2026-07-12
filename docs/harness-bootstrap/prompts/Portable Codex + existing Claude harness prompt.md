# Canonical Stage 2 — Attach Codex and Establish the Shared Harness

Use this prompt only when the target repository already has a Claude Code
harness and does not have an established Codex harness. The neutral shared
harness may already exist or may still need to be created. If an established
Codex harness already exists, stop: this is a consolidation/maintenance task,
not a bootstrap, and requires a separate bounded conflict audit. If the
repository has neither a Claude harness nor a Codex harness, run
`Tell CC Fable 5 Implement CC Harness.md` first, finish its independent review,
and then return to this prompt.

Replace `<PROJECT_ROOT>` with the exact absolute target-repository path before
sending this prompt to Codex. Do not run an independent greenfield Codex
architect prompt after the Claude bootstrap; this file is the canonical Codex
integration stage.

Act as the Commander and repository workflow architect for this task.

Repository root:

<PROJECT_ROOT>

Objective:

This repository already has a Claude Code harness. Build the smallest durable
Codex-native harness and neutral shared-policy layer that allow Codex and
Claude Code to work in the same repository without duplicating, weakening, or
silently overriding each other’s rules.

If `docs/shared-harness/` already exists, treat it as potentially authoritative
User work: diagnose and preserve it, then make only the minimum evidence-backed
changes needed to attach Codex. Do not replace it with a newly invented policy.
If it does not exist, create it from the ownership analysis below.

This is a harness-construction task only. Do not implement features, fix
application bugs, refactor application code, update dependencies, deploy,
modify credentials, or commit.

Core architecture:

1. Shared cross-runtime policy:
   docs/shared-harness/REPOSITORY-POLICY.md

2. Shared drift validator:
   docs/shared-harness/validate-shared-harness.js
   or an equivalent dependency-free script justified by the repository.

3. Codex-native router and controls:
   AGENTS.md
   .codex/**
   .agents/skills/**
   docs/codex-harness/**

4. Claude-native router and controls:
   Existing CLAUDE.md and .claude/** files.

5. Application behavior authority:
   Current code, tests, and verified runtime observations.

The shared policy must own only rules that both runtimes should apply
identically:

- repository boundary and preservation of existing work
- task lifecycle
- evidence required before editing
- retry accounting and circuit breakers
- completion evidence
- independent acceptance
- commit authority
- shared knowledge routing
- capability limits
- instruction-drift detection

Runtime-native adapters must continue to own:

- concrete model names
- agent/subagent invocation syntax
- runtime-specific tools
- MCP configuration
- hooks and permissions
- shell integration
- profiles and runtime configuration

Do not copy Claude model names or tool syntax into Codex policy. Do not copy
Codex model names, hooks, or agent syntax into Claude policy.

Authorization:

You may create the shared and Codex harness files described above.

You may make only minimal adapter changes to existing CLAUDE.md or active
Claude workflow files when necessary to:

- link the shared policy
- give it authority over cross-runtime invariants
- remove a direct contradiction with the shared policy
- add shared-validator commands
- replace wholesale facts/lessons loading with targeted loading

Do not rewrite or relocate Claude application facts, lessons, recognition
semantics, historical evidence, project-specific workflows, or tool mappings.

Before modifying every existing file, create an untouched sibling backup:

<filename>.bak.<YYYYMMDD-HHMMSS>

Never overwrite or delete a previous backup.

Phase 1 — read-only diagnosis

Before any write:

1. Confirm the exact resolved repository root.
2. Record branch, HEAD, and Git status.
3. Identify every pre-existing User change and preserve it.
4. Inventory:
   - AGENTS.md and AGENTS.override.md
   - CLAUDE.md, CLAUDE.local.md, and .claude/**
   - existing instruction/rules files
   - .codex/**
   - .agents/**
   - repository hooks and validators
   - project/global Codex configuration, read-only when necessary
   - current test, build, lint, and verification commands
   - Windows/PowerShell/WSL/Git Bash/Docker path assumptions
5. Determine which existing Claude files contain:
   - cross-runtime workflow policy
   - Claude-specific adapter rules
   - application facts
   - application/Claude history
   - recognition or domain protocols
6. Search for conflicting retry counts, review exemptions, automatic commit
   rules, wholesale context loading, unsupported completion claims, duplicated
   authority, stale model/tool names, and broken paths.
7. Identify the top three expensive workflow leaks with evidence, root cause,
   weaker-model impact, and a physical prevention mechanism.
8. Write the diagnosis before modifying existing files.

Ask at most five questions in one batch only if locally obtainable evidence
cannot resolve a decision that materially changes behavior. Otherwise proceed.

Phase 2 — freeze the ownership map

Before implementation, write a concise ownership table:

- shared control layer
- Codex-native adapter
- Claude-native adapter
- shared application facts/evidence
- historical/archived evidence

For every existing Claude harness file, choose exactly one:

- preserve unchanged
- retain as Claude-native
- treat as shared application knowledge
- minimally bridge to the shared policy
- archive only with explicit User approval

Do not create a second copy of an existing canonical fact or rule.

Phase 3 — skeleton first

Create skeletons for all approved new harness files before filling them.

Minimum expected structure:

docs/shared-harness/
  REPOSITORY-POLICY.md
  validate-shared-harness.js

AGENTS.md

docs/codex-harness/
  00-README.md
  01-HARNESS-LEAK-DIAGNOSIS.md
  02-MODEL-DISPATCH-PROTOCOL.md
  03-JUDGMENT-EXTERNALIZATION-MATRIX.md
  04-DISPATCH-PROMPT-TEMPLATES.md
  05-KNOWLEDGE-ITERATION-PROTOCOL.md
  06-HANDOFF-TO-FUTURE-SESSIONS.md
  lessons/PITFALLS.md
  lessons/README.md

Create .codex configuration, project agents, hooks, or a maintenance skill only
when current installed Codex behavior supports them and the diagnosis shows
they provide a real physical control.

Do not invent config keys, hook schemas, model availability, MCP capabilities,
or agent fields. Verify installed help/configuration or authoritative current
documentation first.

Phase 4 — implementation requirements

AGENTS.md must remain a concise Codex routing hub containing:

- exact repository boundary
- shared-policy authority
- task classification and lifecycle
- targeted read routing
- delegation thresholds
- retry/escalation summary
- verification contract
- circuit breakers
- forbidden actions
- completion-report format
- links to detailed documents

The shared policy must:

- be neutral between Codex and Claude Code
- contain machine-checkable constants for critical invariants
- define shared precedence and ownership
- prohibit silent weakening by native adapters
- require explicit User approval for semantic policy changes
- require backups, validation, and fresh-context review
- avoid concrete runtime-specific model and tool names

The shared validator must deterministically check at least:

- required files exist and are nonempty
- both native routers link the shared policy
- the shared authority marker appears exactly once per router
- retry budgets and reset behavior have not drifted
- no small-change independent-review exemption exists
- commit authority remains explicit-User-only
- facts/lessons loading remains targeted
- cross-runtime workflow pitfalls have one canonical destination
- local Markdown links resolve
- instruction files stay within documented size limits
- no root override silently masks AGENTS.md
- no obvious credential material appears
- known old conflicting phrases are rejected

Provide negative self-tests proving that the validator detects representative
drift. A validator that only passes the current files without testing its
failure paths is insufficient.

Capability tiers:

Use capability tiers such as strongest architecture tier, implementation tier,
and mechanical/search tier. Do not depend entirely on fixed model names.

If the current environment supports an explicitly requested strongest model,
record it only in the Codex-native dispatch adapter, together with an
unavailability circuit breaker. Do not put it in shared policy.

Retry contract:

- two materially different repair attempts per capability tier
- no identical retry without new evidence
- changed symptoms or new regressions in the same patch chain do not reset the
  counter
- low-cost workers escalate after their first tool/path/syntax failure
- strongest tier stops and asks the User after exhausting its budget
- implementation agents cannot perform final acceptance

Phase 5 — verification

After writing:

1. Reopen every deployed file from disk.
2. Check truncation, placeholders, malformed encoding, wrong paths, and
   accidental duplication.
3. Parse every created/modified JSON, TOML, JavaScript, and other executable
   configuration with an appropriate current parser.
4. Run shared-validator self-tests.
5. Run the full shared validator.
6. Run all Codex-native hook/validator tests created or modified.
7. Run a path-scoped git diff --check.
8. Run the full-worktree diff check and distinguish pre-existing failures.
9. Confirm every backup exists and matches the pre-edit Git blob or original
   file hash.
10. Confirm no application source or existing facts/history were changed.
11. Record initial and final Git status.
12. Do not commit.

Phase 6 — adversarial acceptance

Dispatch a distinct fresh-context, read-only reviewer that did not implement
the harness.

It must inspect disk state and find:

- conflicting authority
- duplicated rules
- broken links or paths
- unsafe permissions
- unsupported model/tool assumptions
- impossible completion criteria
- weak-model ambiguity
- validator blind spots
- accidental Claude harness damage
- application or User-work scope violations

Classify findings as Critical, High, Medium, or Low.

Fix all valid Critical and High findings and repeat review until both counts
are zero. The implementation context cannot self-accept.

Completion report:

Status: COMPLETE | PASS WITH DOCUMENTED LIMITATIONS | BLOCKED

Files created:
- path and purpose

Files modified:
- path and purpose

Backups:
- exact backup paths

Ownership map:
- shared
- Codex-native
- Claude-native
- application facts/history

Verification:
- exact command
- integer exit code
- observed result

Independent review:
- reviewer identity
- verdict
- Critical/High/Medium/Low counts

Pre-existing changes preserved:
- exact paths

Limitations:
- unavailable live loading, hooks, models, tools, CI, browser/device evidence,
  or other unverified behavior

Next-task startup:
- exact instructions for starting Codex
- exact instructions for starting Claude Code

Honesty requirements:

Do not invent test results, loaded configuration, model availability, MCP
capabilities, hook execution, business intent, paths, or application behavior.

The goal is not to produce the largest harness. Build the smallest enforceable
system that prevents the repository’s observed recurring failures.
