# Canonical Stage 1 — Portable Claude-First Harness Bootstrap

Use this prompt only when the target repository has no established Claude Code
harness and no established Codex harness. Replace `<PROJECT_ROOT>` with the
exact absolute target-repository path before sending it to the strongest
available Claude Code architecture-capable model.

This is stage 1 of a two-stage cross-runtime installation:

1. This prompt establishes the Claude-native harness without claiming
   cross-runtime authority.
2. After this stage passes independent review, run
   `Portable Codex + existing Claude harness prompt.md` in Codex. That stage
   establishes the neutral shared policy and attaches Codex to the preserved
   Claude harness.

Do not run a separate greenfield Codex architect prompt after this stage. The
Codex integration prompt is specifically designed to consume this output.

---

Act as the Commander and Claude Code workflow architect for this task.

Repository root:

`<PROJECT_ROOT>`

## Objective

Build the smallest durable Claude Code-native harness that prevents the
repository's observed recurring workflow failures and can later be integrated
with a neutral Codex/Claude shared policy.

This is a harness-construction task only. Do not implement features, fix
application bugs, refactor application code, update dependencies, deploy,
modify credentials, alter global configuration, or commit.

Do not create `AGENTS.md`, `.codex/**`, `.agents/**`, `docs/codex-harness/**`,
or `docs/shared-harness/**` in this stage. Do not invent Codex behavior. The
later Codex integration stage owns those surfaces.

## Authority and design boundaries

Claude-native surfaces may include, when justified by current installed Claude
Code behavior:

- `CLAUDE.md` as the concise routing hub
- `.claude/settings*.json`
- `.claude/harness/**`
- Claude-native agents, commands, skills, hooks, permissions, or tool routing

Current application code, executed tests, and verified runtime observations
own application behavior. Stored facts and historical lessons never outrank
current evidence.

Keep these categories distinct:

1. Claude-specific runtime rules: models, Agent syntax, tools, permissions,
   hooks, and Claude-specific escalation.
2. Application facts: verified code paths, commands, invariants, and runtime
   observations.
3. Historical evidence: lessons, failed approaches, and obsolete facts.
4. Candidate cross-runtime rules: repository safety, retry, review, completion,
   commit authority, and knowledge routing that a later shared-policy migration
   may adopt.

Candidate shared rules may be documented, but no Claude file may claim to be
the permanent authority for Codex. Include a handoff inventory that lets the
later Codex stage classify each rule without rereading the entire harness.

Use capability tiers rather than depending entirely on fixed model names.
Concrete Claude model names may appear only in Claude-native adapter files and
only after availability is verified.

## Phase 1 — read-only diagnosis

Do not modify any file until the diagnosis is written.

1. Confirm the resolved root equals `<PROJECT_ROOT>`.
2. Record branch, HEAD, and Git status.
3. Inventory and preserve every pre-existing User change.
4. Inspect current repository instructions, application structure, tests,
   verification commands, shell/path assumptions, and Claude Code project and
   permitted global configuration.
5. Inspect installed Claude Code help/schema before proposing settings, hooks,
   agent fields, or permissions. Do not invent unsupported configuration.
6. Identify the top three workflow leaks that waste context, cause focus loss,
   or produce tool/path/retry/completion errors.
7. For each leak record evidence, root cause, weaker-model impact, physical
   control, acceptance criteria, and stop condition.
8. Identify capability limits: ambiguous business intent, product taste,
   aesthetics, brand voice, conflicting objectives, and unavailable live
   infrastructure require a narrow User question or an honest limitation.

Ask at most five questions in one batch only when local read-only evidence
cannot resolve a material decision. Otherwise proceed.

## Phase 2 — freeze scope and ownership

Before writing, publish a bounded file plan containing:

- exact new and existing paths to be changed
- paths that remain read-only
- pre-existing dirty paths
- acceptance criteria
- exact verification commands
- backup paths to be created
- candidate shared rules for the later Codex stage

Do not modify application source, tests, facts, or history merely to make the
harness easier to design.

## Phase 3 — backups and skeletons

Before the first modification of every existing file, create an untouched
sibling backup:

`<filename>.bak.<YYYYMMDD-HHMMSS>`

Never overwrite or delete an earlier backup.

Create skeletons for approved new files before filling them. Build in value
order, completing and reading back each file before starting the next.

Prefer the smallest useful structure. A typical structure may include:

```text
CLAUDE.md
.claude/
  harness/
    00-DIAGNOSIS.md
    01-MODEL-DISPATCH.md
    02-JUDGMENT-MATRIX.md
    03-DELEGATION-TEMPLATES.md
    04-KNOWLEDGE-PROTOCOL.md
    05-HANDOVER-LETTER.md
    PROJECT-FACTS.md        # only if verified project facts need a store
    LESSONS.md              # only if historical evidence needs a store
```

Do not create files merely to match this example. Each deployed file must
solve an observed problem and have a named owner.

## Phase 4 — implementation requirements

`CLAUDE.md` must remain a concise routing hub containing:

- exact repository boundary
- task classification and lifecycle
- targeted read routing
- critical verification rules
- retry and escalation summary
- User circuit breakers
- forbidden actions
- links to detailed Claude-native documents

Do not require wholesale loading of large facts or lessons files. Search first
and read only the owning section or relevant records.

The dispatch protocol must define:

- Commander responsibility
- measurable delegation thresholds
- a three-part work order: goal/background, acceptance criteria, report format
- bounded reports without full code/log dumps
- capability-tier escalation and de-escalation
- two materially different repair attempts per capability tier
- no identical retry without new evidence
- no retry-counter reset for changed symptoms or regressions in the same patch
  chain
- implementation and final acceptance performed by different contexts

Every write requires fresh-context, read-only final acceptance. There is no
small-change exemption. If the current Claude environment cannot provide a
fresh reviewer, report the limitation; do not call self-review independent.

Commits require an explicit User request. Approval to build or edit the
harness does not authorize a commit.

The judgment matrix must include measurable signals, thresholds, required
actions, perfect positive examples, and typical negative examples for:

- abandoning a clearly wrong direction
- permitting a meaningful retry
- declaring a task complete
- sufficient test evidence
- scope expansion
- uncertainty reporting
- User circuit breakers

Delegation templates must include context, scope, exclusions, acceptance,
verification, retry limits, stop conditions, and bounded reporting for:

- research/search
- feature implementation
- refactoring
- code review
- fresh-context acceptance
- failure escalation
- mechanical batch application

Knowledge maintenance must distinguish confirmed facts, provisional
hypotheses, historical evidence, obsolete/superseded records, compaction
thresholds, and changes requiring User approval. Never silently delete history.

Prefer deterministic scripts, validators, or hooks over prose only when the
failure is mechanically detectable and current installed Claude Code behavior
supports the mechanism. Do not weaken security or add a bypass.

## Phase 5 — Codex integration handoff

Create a concise handoff section or file that lists:

- each Claude-native file and its owner
- application fact/history stores that Codex may later read only in targeted
  form
- candidate shared rules and their exact current locations
- Claude-only model/tool/hook/permission clauses that must remain native
- unresolved assumptions
- exact baseline validation commands
- the instruction to run `Portable Codex + existing Claude harness prompt.md`
  next

Do not pre-author Codex files in this stage.

## Phase 6 — verification and adversarial review

1. Reopen every deployed file from disk.
2. Check for truncation, placeholders, malformed encoding, broken paths,
   duplicate authority, unsupported model/tool claims, and secrets.
3. Parse every modified JSON or executable configuration with a current parser.
4. Run the narrowest Claude-native validator/hook tests actually created.
5. Run a path-scoped `git diff --check` for session files.
6. Run the full-worktree diff check and separate pre-existing failures.
7. Verify each backup matches its pre-edit Git blob or original hash.
8. Confirm no application source, tests, dependencies, credentials, global
   configuration, or Git history changed.
9. Record initial and final status.
10. Dispatch a distinct fresh-context read-only reviewer.

The reviewer must find conflicts, ambiguous weak-model wording, broken paths,
unsafe permissions, impossible criteria, unsupported completion claims,
validator blind spots, and scope violations.

Correct all valid Critical and High findings and re-review until both counts
are zero.

## Completion report

```text
Status: COMPLETE | PASS WITH DOCUMENTED LIMITATIONS | BLOCKED
Files created:
- <path and purpose>
Files modified:
- <path and purpose>
Backups:
- <exact path>
Verification:
- Command: <exact command>
  Exit code: <integer>
  Result: <observed result>
Independent review:
- Reviewer: <distinct identity>
  Verdict: PASS | FAIL
  Findings: Critical <n>, High <n>, Medium <n>, Low <n>
Pre-existing changes preserved:
- <paths>
Codex integration handoff:
- <candidate shared rules, native ownership, and next prompt>
Limitations:
- <unverified behavior, owner, and next check; or none>
```

Do not claim loaded hooks, available models, passing tests, application
behavior, or successful review without observed evidence.

The objective is not the largest possible Claude harness. Build the smallest
enforceable Claude-native system that the later shared/Codex integration can
preserve rather than replace.
