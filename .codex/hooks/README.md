# Codex Hook Controls

**Status:** COMPLETE
**Purpose:** Specify, operate, test, trust, and safely recover repository hook controls.
**Intended readers:** Harness maintainers, Commanders, Users, and reviewers.  
**Source-of-truth status:** Operational specification for `.codex/hooks.json` and scripts here; policy originates in the [diagnosis](../../docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md).
**Related files:** [root router](../../AGENTS.md), [judgment matrix](../../docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md), [verification report](../../docs/codex-harness/08-VERIFICATION-REPORT.md)

## 1. Why these hooks exist

Only two lifecycle hooks are deployed, each mapped to diagnosed leak HL-03:

| Event | Script | Failure mode blocked |
|---|---|---|
| `PreToolUse` | `pre-tool-use-guard.js` | Detectable out-of-repository writes, traversal/reparse escapes, destructive Git/deletion, dependency/credential/deployment actions, and hook disabling |
| `Stop` | `completion-evidence-guard.js` | Completion claims without changed files, observed commands/results, distinct review, zero Critical/High findings, and limitations |

The consistency validator and fixture runner are invoked explicitly rather than on every tool call. This avoids expensive recursive hook behavior.

## 2. Wiring and precedence

- Hooks are defined only in `.codex/hooks.json`.
- `.codex/config.toml` contains `[features].hooks = true` and no inline hook table.
- Codex merges matching global, project, managed, and plugin hooks; a project hook cannot prevent another matching hook from starting.
- Project config requires the repository to be trusted. Hook source also requires the normal Codex hook-hash trust review.
- Files created during this running session cannot prove actual next-session loading. Verify through the normal Codex hook UI in a new session.

Never use a dangerous hook-trust bypass. Review the files and trust the recorded hash through the supported UI.

## 3. Input and output

Codex sends one JSON object on stdin.

The PreToolUse guard expects:

- `hook_event_name = PreToolUse`
- `cwd`
- `tool_name`
- `tool_input.command`

Allowed calls exit 0 with no output. Denied calls exit 0 with the supported `hookSpecificOutput.permissionDecision = deny` JSON and a secret-safe corrective next step. Invalid/unsupported input fails closed.

The Stop guard expects:

- `hook_event_name = Stop`
- `last_assistant_message`
- `stop_hook_active`

Non-completion responses exit 0 with no output. An unsupported completion emits `decision = block` and asks Codex to continue with evidence. If the continuation is still invalid and `stop_hook_active` is true, the hook returns `continue = false` with a visible stop reason to avoid an infinite continuation loop.

Neither script prints the intercepted command, message, or sensitive value in its denial reason.

## 4. Repository path policy

The write boundary is exactly `C:\Projects\autospinner`.

The PreToolUse guard normalizes:

- Native Windows: `C:\Projects\autospinner\...`
- Git Bash: `/c/Projects/autospinner/...`
- WSL mount: `/mnt/c/Projects/autospinner/...`
- Repository-relative paths using the hook `cwd`

It rejects `..` path segments for write-capable actions. For an existing target or its nearest existing ancestor, it calls native realpath resolution and denies an ancestor that resolves outside the repository. Phase 1 found no current repository reparse points, but the runtime check remains.

Read-only commands may inspect approved global Codex paths. Once a command is write-capable, external absolute paths and home/profile aliases are denied.

## 5. Blocked categories

- `git reset --hard`, `git clean`, destructive checkout/restore, and force push.
- Recursive deletion forms.
- Database/schema drop or destructive reset.
- Production/infrastructure deployment or destruction.
- Credential/login/environment-secret modification.
- Package install, removal, update, or broad dependency change.
- Test/hook bypass markers such as `--no-verify` or `hooks = false`.
- Apply-patch paths outside the root, relative traversal, unsafe reparse ancestors, or unsupported patch headers.
- Deletion of project config, hook configuration, or guard scripts.

There is no model-invocable environment flag, token file, or command-line bypass.

## 6. Allowed categories

- Read-only repository and approved global configuration inspection.
- Read-only Git status/diff/log/show/rev-parse operations.
- Repository-relative writes that do not match a blocked category and remain inside the OS sandbox.
- Standard apply-patch Add/Update/Delete/Move-to headers for repository paths, except deletion of mandatory controls.
- Node syntax, harness validator, hook test, and canonical regression commands.

An allowed hook result is not permission to violate the dispatch scope. The sandbox, User approvals, role instructions, and independent review still apply.

## 7. Completion evidence contracts

A Commander completion claim must contain the exact headings in [AGENTS.md section 13](../../AGENTS.md#13-completion-report-format):

- `Status: COMPLETE` or `PASS WITH DOCUMENTED LIMITATIONS`
- Non-empty `Files changed`
- `Verification` with `Command`, integer `Exit code`, and observed `Result`
- `Independent review` with a distinct reviewer, `Verdict: PASS`, and Critical/High/Medium/Low counts
- `Limitations`

Critical and High must both be zero. `COMPLETE` requires `Limitations: none`; a limited pass requires a real limitation. Self/none/N-A is rejected syntactically.

An implementation, explorer, or reviewer subagent that returns `Status: PASS` must instead use these exact non-empty headings:

- `Summary:` with one to ten bullets
- `Evidence:` with paths/lines or observed artifacts
- `Commands:` with `Command`, integer `Exit code`, and `Result`
- `Files changed:`, using `none` for a read-only role
- `Unresolved risks:`
- `Recommended next action:`

`PARTIAL`, `BLOCKED`, and `FAIL` are not positive completion claims, but their dispatch reports still use the same headings where evidence is available. This separate schema prevents the project-wide Stop hook from making the mandated subagent `PASS` contract impossible.

The guard detects explicit status/verdict lines and common natural-language completion claims. It validates structure only: the Stop event supplies text, not a cryptographically authenticated reviewer identity or command transcript. A plausible invented reviewer name can therefore satisfy this hook. Actual independent-agent evidence in `07-ADVERSARIAL-REVIEW.md`, command reruns, and the Commander's read-back remain mandatory; this hook alone cannot satisfy TC-06.

## 8. Test matrix

`test-hooks.js` passes JSON fixtures to the actual scripts but never executes payload commands. It covers:

- Allowed global read, repository write, repository patch, and Git Bash/WSL in-root paths.
- Blocked Windows, Git Bash, WSL, `/tmp`, and `/home` external paths.
- Blocked patch/shell traversal and external shell write.
- Destructive Git, force push, dependency, credential, deployment, hook-disable, absolute control deletion, and control-move cases.
- Invalid JSON fail-closed behavior.
- Non-completion, unsupported completion, compliant Commander completion, limited pass, compliant and bare subagent PASS, High finding, non-none COMPLETE limitation, self-review, unauthenticated reviewer-name limitation, and repeated invalid completion.
- Validator negative self-tests.

Run:

```powershell
node --check .codex\hooks\pre-tool-use-guard.js
node --check .codex\hooks\completion-evidence-guard.js
node --check .codex\hooks\test-hooks.js
node --check .codex\hooks\validate-harness.js
node .codex\hooks\test-hooks.js
node .codex\hooks\validate-harness.js
```

Expected success markers are `HOOK_TESTS PASS <n>/<n>` and `HARNESS_VALIDATION PASS ...`. Any nonzero exit or `FAIL` line blocks completion.

## 9. User-only bypass policy

There is no autonomous bypass. When a blocked action is intentionally required:

1. Stop and show the User the category, exact intended operation, impact, and safe alternative.
2. Obtain explicit approval.
3. Prefer the User executing the operation directly outside the model workflow.
4. If the User deliberately disables a project hook through supported Codex controls, record the window and reason, restore it immediately afterward, and rerun the full hook tests/validator.
5. Require fresh-context review of the resulting state.

A weak model must never edit the guard, set hooks false, create an approval file, or use a trust-bypass flag to unblock itself.

## 10. Fail-safe recovery

If a legitimate action is falsely blocked:

1. Do not retry the identical command.
2. Reduce it to a literal repository path and a single operation.
3. Run the matching fixture or add a non-secret regression fixture.
4. Correct a parser bug only when the documented safety policy remains unchanged.
5. Any policy weakening is K3 and requires User approval.
6. Run independent review and all hook tests before trusting the correction.

## 11. Known limitations

- Official Codex documentation states PreToolUse does not intercept every shell or non-shell route; it is a guardrail, not a security boundary.
- An allowed script can conceal behavior the static command scan cannot see.
- Static shell parsing cannot prove every computed path or distinguish every quoted search string.
- Runtime/admin permission overrides can alter project sandbox behavior.
- A project hook cannot inspect whether a User approval occurred unless the product supplies that fact in the event.
- The completion hook cannot authenticate reviewer identity or prove that reported commands ran; it only rejects structurally incomplete claims.
- Actual hook discovery/trust is `PARTIALLY VERIFIED` until a new trusted session loads these files.

The OS sandbox, explicit User approvals, narrow agents, Git evidence, validators, and independent review provide the remaining layers.

The Commander owns the unauthenticated-reviewer residual risk. Keep the durable independent evidence in document 07 and revisit this design when an official Codex Stop payload exposes authenticated agent identity; until then, never treat the Stop hook alone as review evidence.
