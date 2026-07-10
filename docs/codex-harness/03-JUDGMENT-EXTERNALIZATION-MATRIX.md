# Judgment Externalization Matrix

**Status:** COMPLETE
**Purpose:** Translate engineering judgment into measurable signals, actions, examples, evidence, and escalation destinations.
**Intended readers:** Commanders, workers, reviewers, and future lower-capability models.
**Source-of-truth status:** Canonical stop/continue/completion/User-circuit-breaker criteria.
**Related files:** [diagnosis](01-HARNESS-LEAK-DIAGNOSIS.md), [dispatch protocol](02-MODEL-DISPATCH-PROTOCOL.md), [verification report](08-VERIFICATION-REPORT.md)

## 1. How to use this matrix

Before the first edit, record the task boundary, acceptance checks, and baseline evidence. Re-evaluate this matrix after every failed check, scope change, or proposed completion claim.

Action terms are literal:

- **Stop:** make no further implementation edits on the current path.
- **Revert session-owned:** remove only changes created by the current session; never discard pre-existing User work.
- **Reproduce:** obtain a smaller or cleaner observation before another edit.
- **Different design:** abandon the current mechanism, not merely rename the same attempt.
- **Escalate:** use the next tier and include the failure trace from the dispatch protocol.
- **Ask User:** ask one narrow question only when a circuit-breaker row applies.

## 2. Abandon-the-path signals

Every criterion includes the signal, threshold, required action, examples, evidence, and escalation destination.

### AP-01 — Same error survives materially different attempts

- **Signal:** The same retry key still fails.
- **Threshold:** Two materially different repair attempts at Tier C or B; two at Tier A. A low/fast Tier C tool/path/syntax error escalates after its first failure.
- **Required action:** Stop; preserve the failure trace; revert session-owned experiments if they obstruct reproduction; escalate. At exhausted Tier A, Ask User.
- **Perfect positive example:** Attempt 1 corrects a PowerShell quoting assumption; attempt 2 uses a small Node reproduction; both produce the same parse failure, so the agent stops and escalates with both commands and errors.
- **Typical negative example:** Re-run the identical command three times with different wording in the explanation.
- **Evidence required:** Retry key, commands, exit codes, exact errors, material change between attempts, files touched.
- **Escalation destination:** Tier B after one low/fast Tier C error; Tier A after two Tier C/B attempts; User after two Tier A attempts.

### AP-02 — Supposedly local change expands across unrelated files

- **Signal:** A local fix requires additional owners or subsystems.
- **Threshold:** More than three previously unrelated application files, or any out-of-scope file not named in the dispatch package.
- **Required action:** Stop before touching the fourth unrelated file; do not silently expand scope; produce a dependency map. Different design or Ask User for scope approval.
- **Perfect positive example:** A one-function recognition fix appears to require solver, UI, manifest, and transport changes; the worker stops with the four-file map and requests re-scoping.
- **Typical negative example:** Add “small supporting changes” to six files and mention them only in the final response.
- **Evidence required:** Original in-scope list, proposed file list, ownership reason for each file, diff statistics.
- **Escalation destination:** Commander; User if the approved boundary must expand.

### AP-03 — Proposed fix contradicts observed runtime behavior

- **Signal:** The hypothesis predicts an output that a current reproduction disproves.
- **Threshold:** One reliable contradictory observation.
- **Required action:** Stop; do not tune constants around the contradiction; Reproduce once independently; choose a Different design if confirmed.
- **Perfect positive example:** The simulated plan is safe but the live drag differs; the agent inspects the execution layer instead of changing solver scoring.
- **Typical negative example:** Increase beam width because the live device mis-dragged a plan already proven correct.
- **Evidence required:** Predicted behavior, observed behavior, reproduction steps, timestamps or exact log markers.
- **Escalation destination:** Tier B specialist; Tier A if ownership crosses layers.

### AP-04 — Approach bypasses a test or guard

- **Signal:** Success depends on disabling, deleting, weakening, skipping, or special-casing an existing check.
- **Threshold:** One proposed bypass.
- **Required action:** Stop; preserve the failing check; choose a Different design that satisfies it. Ask User only if policy and requested behavior genuinely conflict.
- **Perfect positive example:** A new behavior fails `node verify.js`; the implementation is corrected and the test remains unchanged unless the User-approved requirement proves the test obsolete.
- **Typical negative example:** Comment out a failing assertion, add `--no-verify`, or disable hooks to claim completion.
- **Evidence required:** Original check, failing output, requirement that establishes the intended behavior.
- **Escalation destination:** Tier A; User for an intentional policy change.

### AP-05 — Each retry introduces a new regression

- **Signal:** The original symptom changes while previously passing checks begin to fail.
- **Threshold:** Two consecutive repair attempts each introduce at least one new regression.
- **Required action:** Stop; count both against the original retry key; Revert session-owned repair chain; Reproduce from the last passing baseline; choose a Different design.
- **Perfect positive example:** Two threshold tweaks fix different samples but break earlier confirmed samples, so both are reverted and classification ownership is re-traced.
- **Typical negative example:** Treat each regression as a new issue and reset the retry counter indefinitely.
- **Evidence required:** Before/after check matrix for every attempt and the last passing revision.
- **Escalation destination:** Tier A.

### AP-06 — Execution path cannot be explained

- **Signal:** The model cannot identify the caller chain from input to failing output.
- **Threshold:** After one targeted search, it still cannot name the entry point, owning function, and verification observation.
- **Required action:** Stop editing; dispatch `harness-explorer` or an application explorer; Reproduce and trace before design work.
- **Perfect positive example:** The agent states capture → classify → settle → solve → execute and cites each owning symbol before changing recognition.
- **Typical negative example:** Patch the first function whose name resembles the symptom.
- **Evidence required:** File paths, symbols, caller chain, and observed boundary where behavior diverges.
- **Escalation destination:** Tier C explorer, then Tier B if the trace crosses subsystems.

### AP-07 — Required API or option is unconfirmed

- **Signal:** The approach depends on a command, hook field, model, API, or option not confirmed for the installed/current version.
- **Threshold:** One material unverified dependency.
- **Required action:** Stop implementation; inspect installed help/schema or official current documentation. If still unknown, choose a supported alternative or Ask User.
- **Perfect positive example:** Before using a hook output field, the agent verifies it in the installed Codex documentation and tests an input sample.
- **Typical negative example:** Copy a configuration key from memory and call TOML syntax success behavioral proof.
- **Evidence required:** Installed version, official source or schema, and a representative local check where possible.
- **Escalation destination:** Tier B documentation specialist; User if no authoritative source exists.

### AP-08 — Repository evidence contradicts an assumption

- **Signal:** A manifest, current code path, Git state, or runtime observation disproves a planning assumption.
- **Threshold:** One authoritative contradiction.
- **Required action:** Stop; replace the assumption in the task record; assess whether acceptance criteria change; Different design or Ask User if the task description itself is contradicted.
- **Perfect positive example:** The repository has no package manager, so the worker uses direct Node checks rather than inventing `npm test`.
- **Typical negative example:** Create package infrastructure solely because a generic template expects it.
- **Evidence required:** Exact file/line or command result and the contradicted assumption.
- **Escalation destination:** Commander; User if the requested outcome depends on the contradicted state.

### AP-09 — Patch exceeds its approved budget

- **Signal:** Changed paths or lines exceed the dispatch package.
- **Threshold:** Any out-of-scope path; or, when no line budget was supplied, more than 200 changed application lines excluding tests/docs; or more than 25% of changed lines outside the primary owner file.
- **Required action:** Stop before further edits; report diff statistics; split the task, reduce the design, or Ask User for a revised boundary.
- **Perfect positive example:** At 180 lines the worker sees a required second subsystem will exceed 200, stops, and proposes two independently verifiable tasks.
- **Typical negative example:** Call a 600-line refactor “necessary cleanup.”
- **Evidence required:** `git diff --stat`, `git diff --numstat`, original budget, and path ownership.
- **Escalation destination:** Commander; User for broader approved scope.

### AP-10 — Editing starts before evidence

- **Signal:** An implementation edit is proposed before reproduction, trace, or baseline.
- **Threshold:** First application edit, except a literal documentation typo with an unambiguous source.
- **Required action:** Stop; undo only that session-owned edit if needed; obtain baseline evidence and acceptance checks.
- **Perfect positive example:** Before changing `algorithm.js`, run or cite a current failing case and record the relevant `node verify.js` baseline.
- **Typical negative example:** “This likely fixes it” followed by a patch before any current observation.
- **Evidence required:** Reproduction or trace, baseline command/result, and explicit acceptance criteria.
- **Escalation destination:** Commander; Tier C explorer when ownership is unclear.

### AP-11 — No falsifiable verification signal exists

- **Signal:** The agent cannot state what observable result would prove or disprove the change.
- **Threshold:** Acceptance criteria contain only subjective phrases such as “looks correct” or “should work.”
- **Required action:** Stop; define a measurable signal. Ask User if the missing signal is a product or aesthetic preference.
- **Perfect positive example:** “Exit 0 and `ALL CHECKS PASSED`; no changed path outside the manifest.”
- **Typical negative example:** “Verify the change carefully.”
- **Evidence required:** Expected command, exit status, output marker, or User-observable result.
- **Escalation destination:** Commander; User for irreducibly subjective acceptance.

## 3. True completion scorecard

A task is deliverable only when every mandatory row is `PASS`. Use `NOT APPLICABLE` only where the row explicitly permits it. `UNVERIFIED` and `BLOCKED` never count as pass.

| ID | Mandatory category | PASS condition | Required evidence | `NOT APPLICABLE` allowed when |
|---|---|---|---|---|
| TC-01 | Scope compliance | Every changed path and operation is inside the approved task/repository boundary | Initial/final status, changed-file list, diff stat | Never |
| TC-02 | Requirements coverage | Each acceptance criterion maps to an observed result | Requirement-to-evidence table | Never |
| TC-03 | Build or syntax validity | Every modified executable/config format passes its available parser or syntax check | Command, exit code, concise result | Only for prose-only files with no parseable format; Markdown link validation still applies |
| TC-04 | Relevant test execution | The narrowest behavior-owning test ran and passed | Exact command, exit code, output marker | Only when the task changes no behavior and the reviewer records why |
| TC-05 | Regression checks | Repository canonical regression or an approved narrower alternative passed | `node verify.js` for `algorithm.js`; change-specific matrix otherwise | Only when no executable behavior changed |
| TC-06 | Independent review | A distinct read-only reviewer returns no unresolved Critical/High finding | Reviewer identity, scope, commands, finding counts | Only for a response with no file or external-state change |
| TC-07 | Documentation update | Durable commands/rules/facts affected by the change are updated | Paths and read-back | When no durable knowledge changed |
| TC-08 | Critical/High findings | Count is zero after re-review | Severity table and dispositions | Never |
| TC-09 | Clean read-back | Every changed file was reopened and checked for truncation, placeholders, and wrong paths | Read-back list/status | Never |
| TC-10 | Evidence attached | Final report lists files, commands, results, review, and limitations | Completion-evidence block | Never |

### Machine-readable outcome vocabulary

Use only: `VERIFIED`, `PARTIALLY VERIFIED`, `UNVERIFIED`, `BLOCKED`, `NOT APPLICABLE`.

- `VERIFIED` may satisfy a scorecard row.
- `PARTIALLY VERIFIED` must state the missing observation and produces `PASS WITH DOCUMENTED LIMITATIONS`, never unconditional `PASS`.
- `UNVERIFIED` or `BLOCKED` prevents a completion claim for any mandatory row.
- `NOT APPLICABLE` requires the row-specific reason.

### When a test cannot run

“Tests not run” is not passing. Record:

1. Exact command attempted.
2. Exit code and environmental blocker.
3. Why the blocker is external to the patch.
4. Alternative evidence actually collected.
5. Residual behavior not verified.
6. Owner and next command needed to close the gap.

Use `PARTIALLY VERIFIED` only if the remaining gap is not Critical/High and delivery with limitations is explicitly acceptable. Otherwise use `BLOCKED`.

## 4. User circuit breaker

Stop autonomous work and ask one narrow question when any row triggers.

| ID | Trigger | Threshold | Required question shape | Evidence before asking |
|---|---|---|---|---|
| CB-01 | Two valid interpretations | They produce materially different user-visible behavior or data | “Should X behave as option A or option B?” | Both concrete options and trade-offs |
| CB-02 | Irreversible/destructive operation | Migration, deletion, force operation, or production deployment is required | Ask approval for the exact operation and impact | Dry-run or impact inventory |
| CB-03 | Credentials/production access | A secret or external privileged action is required | Ask the User to authorize/provide the approved access path, never the secret in chat | Exact blocked command and required scope |
| CB-04 | Pre-existing work collision | Completion would overwrite, revert, move, or reinterpret User changes | Ask whether to preserve, isolate, or explicitly replace named paths | Initial status and overlapping diff |
| CB-05 | Business/aesthetic preference | Evidence cannot determine product taste, brand voice, or subjective acceptance | Present two or three concrete options and ask for one choice | Observable trade-offs |
| CB-06 | Repository boundary expansion | A write or required artifact lies outside `C:\Projects\autospinner` | Ask whether to expand scope; do not write first | Required path and reason |
| CB-07 | Security conflict | Requested behavior conflicts with safety policy or trust boundary | Ask which authorized secure alternative to use | Policy, risk, alternatives |
| CB-08 | No authoritative source | Installed help and official current documentation cannot confirm a material API/option | Ask whether to use a documented alternative or pause | Sources checked and uncertainty |
| CB-09 | Repository contradicts task | Current branch/state makes the requested target materially different | Ask which source of truth controls | Exact contradictory evidence |
| CB-10 | Unavailable infrastructure | Acceptance requires unavailable device, browser state, CI, service, or credentials | Ask the User to run one exact check or approve delivery as blocked | Attempted check and alternative evidence |
| CB-11 | Tier A exhausted | Same retry key failed two materially different Tier A attempts | Ask whether to stop, change requirement, or authorize a named experiment | Complete failure trace |

### Conditions that do not justify interrupting the User

Do not ask merely because:

- A path, command, branch, test, or manifest can be inspected locally.
- One implementation is clearly favored by repository evidence and is reversible.
- A safe read-only command failed once and a materially different diagnostic is available within the retry budget.
- Formatting, naming, or mechanical choices are already defined by a source-of-truth file.
- Independent review found a valid issue that can be corrected within scope.
- Work is difficult, slow, or would benefit from reassurance.
- A subagent is unavailable; the Commander can continue within the same boundary.

## 5. Literal lower-capability response at a capability limit

When judgment depends on ambiguous business requirements, subjective aesthetics, product taste, brand voice, unstated stakeholder preference, or conflicting objectives without a priority owner:

1. Identify the ambiguous decision.
2. Present two or three concrete options.
3. State observable trade-offs.
4. Recommend one only when evidence supports it.
5. Ask one narrowly framed User question.
6. Do not fabricate preferences.
7. Do not continue irreversible implementation while unresolved.

## 6. Matrix verification

The fresh-context reviewer must sample every AP and CB row and confirm that a literal worker can identify the signal, threshold, evidence, and destination without inventing a policy. Any missing element is at least Medium severity; a missing stop threshold or bypassable completion row is High.
