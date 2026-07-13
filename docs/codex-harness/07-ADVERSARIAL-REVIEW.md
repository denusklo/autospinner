# Adversarial Review

**Status:** COMPLETE
**Purpose:** Persist independent fresh-context findings, corrections, re-review results, and the final acceptance verdict.
**Intended readers:** The User, Commander, reviewer agents, and future maintainers.
**Source-of-truth status:** Authoritative review record for this harness deployment.
**Related files:** [reviewer agent](../../.codex/agents/fresh-context-reviewer.toml), [verification report](08-VERIFICATION-REPORT.md), [diagnosis](01-HARNESS-LEAK-DIAGNOSIS.md)

## 1. Review identity and method

The implementation Commander did not perform sole acceptance. Reviewers received read-only work orders, re-read disk state, ran prescribed checks, reported before implementation defense, and made no file changes.

| Pass | Reviewer identity | Context/configuration | Result |
|---|---|---|---|
| Initial | `/root/bounded_fresh_reviewer` | Fresh-context instructions; intended inherited model/high reasoning/read-only; effective sandbox write denial was not provable | `FAIL`: Critical 2, High 2, Medium 3 |
| Independent cross-check | `/root/reviewer_fast` | Separate read-only work order | `FAIL`: Critical 0, High 0, Medium 2 |
| Second full pass | `/root/final_adversarial_review` (Descartes) | Fresh context, inherited model, high reasoning, no edits | `FAIL`: Critical 1, High 1, Medium 3 |
| Infrastructure-only attempts | `/root/postfix_adversarial_review`, `/root/postfix_review_retry` | No completed review: model capacity/usage failure | Not evidence |
| Bounded snapshot | `/root/acceptance_snapshot` | Fresh context; short status and checks | `BLOCKED`: corpus-read process was denied before start |
| Final full review | `/root/acceptance_short_reads` | Fresh context; short explicit disk reads; no edits | Full corpus read and prescribed checks completed |
| Correction re-review | `/root/acceptance_short_reads` | Re-read the last corrected template from disk | `PASS`: Critical 0, High 0, Medium 0, Low 0 |
| Final ledger acceptance | `/root/final_report_review` | Fresh report-only context; short disk reads; no edits | `PASS`: Critical 0, High 0, Medium 0, Low 0 |

The collaboration runtime did not prove that the project custom-agent `sandbox_mode = 'read-only'` profile was the effective sandbox. Every reviewer was nevertheless explicitly prohibited from writes, Git status remained unchanged during each completed pass, and reviewers reported `Files changed: none`. Actual custom-profile loading/write denial remains a next-session limitation, not invented evidence.

## 2. Scope and files re-read

The completed full pass read all 25 deployed files:

- Root `AGENTS.md`.
- `.codex/config.toml`, `.codex/hooks.json`, all three `.codex/agents/*.toml` files, and all five files under `.codex/hooks/`.
- All three files in `.agents/skills/harness-maintenance/`.
- Documents `00` through `08` and both lesson files under `docs/codex-harness/`.

At review time documents 07 and 08 were intentionally `SKELETON`; the validator's two status failures were treated as phase state, not accepted final state. Application source and legacy Claude files were inspected only through read-only Git evidence.

## 3. Commands independently run

| Command | Exit | Observed result |
|---|---:|---|
| Four `node --check .codex\hooks\<file>.js` commands | 0 each | All hook/control scripts parsed |
| `node .codex\hooks\test-hooks.js` | 0 | `HOOK_TESTS PASS 46/46` |
| `node .codex\hooks\validate-harness.js` | 1 during review | Exactly two expected errors: documents 07/08 still `SKELETON`; zero warnings |
| `git -c safe.directory=C:/Projects/autospinner diff --check` | 0 | No whitespace errors |
| Read-only branch/status/name-status checks | 0 | Reviewers made no writes; concurrent commits were observed separately |

## 4. Findings and corrections

| ID | Initial severity | Evidence | Literal weak-model failure | Correction and re-review |
|---|---|---|---|---|
| AR-01 | Critical | `.codex/hooks/pre-tool-use-guard.js:115-130` | `tee /tmp/x` or `/home` could evade the original Windows-centric extraction | General POSIX extraction and `/tmp`/`/home` fixtures added; 46/46 pass |
| AR-02 | Critical | `.codex/hooks/pre-tool-use-guard.js:133-166` | Absolute Delete or standard Update+Move could relocate a mandatory control | Canonical mandatory paths now block Update/Delete/Move; absolute/move fixtures pass |
| AR-03 | High | `.codex/hooks/completion-evidence-guard.js:61-73` | A plausible reviewer-name string could masquerade as authenticated review | Hook claim narrowed to structural validation; spoof fixture is explicit; durable independent evidence remains mandatory |
| AR-04 | High | `.codex/agents/fresh-context-reviewer.toml:8-15` | A reviewer could inherit workspace write despite the intended profile | Project profile remains read-only; actual new-session denial is documented as a limitation; completed reviewers made no writes |
| AR-05 | Medium | `docs/codex-harness/00-README.md:87` | Reader expected Python `tomllib` although the validator used a constrained parser | Documentation now names the constrained parser plus Codex semantic config load |
| AR-06 | Medium | `docs/codex-harness/04-DISPATCH-PROMPT-TEMPLATES.md:48-108` | Feature/refactor work could be sent to harness-only worker | Templates now require a named application worker or Commander, never `harness-worker` |
| AR-07 | Medium | `.codex/hooks/validate-harness.js:279-291` | Non-required generated harness files/backups could avoid secret scanning | Bounded scan covers root router and text artifacts/backups in all harness roots |
| AR-08 | Medium | Added Markdown metadata lines | `git diff --check` failed on 40 two-space hard breaks | Trailing spaces removed; independent diff check passes |
| AR-09 | Critical | `.codex/hooks/pre-tool-use-guard.js:35-40,115-142` | `cp`/`mv`/`rm`/`del` and quoted root-prefix paths with spaces could evade detection | Common aliases, quoted-path parser, case-insensitive drives, and Windows/Git Bash/WSL fixtures added; 46/46 pass |
| AR-10 | High | `.codex/hooks/completion-evidence-guard.js:10-106` | Required subagent `Status: PASS` was rejected by a Commander-only schema | Separate Commander and subagent PASS schemas implemented; compliant/bare PASS fixtures pass |
| AR-11 | Medium | `01-HARNESS-LEAK-DIAGNOSIS.md:179` | Diagnosis allowed 32 KiB while validator rejected above 24 KiB | Diagnosis now distinguishes 24 KiB harness budget from 32 KiB product ceiling |
| AR-12 | Medium | `04-DISPATCH-PROMPT-TEMPLATES.md:248` before correction | `rg` parsed a leading `--check` pattern as an option | Command now uses `rg -n -- ...` and ran successfully |
| AR-13 | Medium | Eleven `OUTPUT FORMAT` clauses in document 04 | Local template prose could override the exact machine-checked heading contract | All eleven clauses now repeat the exact section-1 headings; correction re-review PASS |

## 5. Literal lower-capability simulation

The final reviewer verified that:

- Root precedence has one permanent router and no masking root override.
- Tasks map to explicit roles; application work cannot be routed to `harness-worker`.
- `RETRY_BUDGET = 2 materially different repair attempts per capability tier` is literal and consistent.
- Every positive subagent PASS and Commander completion claim has a separate exact schema.
- The 24 KiB router budget, 300-line ceiling, circuit breakers, and User-approval cases are measurable.
- Windows, Git Bash, WSL, POSIX, traversal, root-prefix collision, destructive command, and mandatory-control samples are represented.
- No worker may call its own second pass fresh-context acceptance.
- Report caps and no-log-dump rules are explicit.

## 6. Accepted residual risks

These are limitations, not unresolved review findings:

1. **Unauthenticated reviewer text.** Owner: Commander. Reason: the observed Stop payload provides text but no authenticated reviewer identity. Control: document 07 plus actual independent-agent evidence. Review trigger: official Codex hook identity becomes available or the Stop schema changes.
2. **New-session loading and read-only denial.** Owner: User and next-session Commander. Reason: config/hooks/agent files created during a running session cannot prove their own trusted reload. Control: project files, parser checks, `codex features list`, and no-write reviewer evidence. Review trigger: next normal trusted Codex session.
3. **Static hook interception is incomplete.** Owner: harness maintainer. Reason: computed paths or concealed script behavior cannot be fully proved by command text. Control: OS sandbox, approvals, deterministic fixtures, validator, and review. Review trigger: any bypass/false-positive or Codex hook API change.
4. **Concurrent repository commits.** Owner: User. Reason: `HEAD` advanced during this audit without a commit command issued by this Commander. Control: final status/HEAD evidence and no attribution. Review trigger: before the next development task.

## 7. Final verdict

`PASS` for independent adversarial review: Critical 0, High 0, Medium 0, Low 0 after corrections.

This verdict accepts the static/deterministic harness implementation. It does not convert the new-session loading, authenticated identity, or external infrastructure limitations into verified behavior.

## 8. 2026-07-13 K3 model-routing migration

The User approved explicit Codex routing: Commander/planning/review on `gpt-5.6-sol` at `max`, coding on `gpt-5.6-sol` at `high`, exploration/search on `gpt-5.6-terra` at `high`, and small mechanical work on `gpt-5.6-luna` at `medium`.

| Pass | Reviewer identity | Result |
|---|---|---|
| Initial migration review | `/root/fresh_context_reviewer` | `FAIL`: Critical 0, High 1, Medium 0, Low 0 |
| Correction re-review | `/root/fresh_context_reviewer` | `PASS`: Critical 0, High 0, Medium 0, Low 0; TC-01 through TC-10 verified |

The initial High found that `01-HARNESS-LEAK-DIAGNOSIS.md` still prescribed three project agents while the router, config, and validator required four including `coding-worker`. The diagnosis now names all four roles and verifies four model/effort/sandbox definitions; `.codex/hooks/validate-harness.js` adds two deterministic assertions against recurrence.

Independent observed results after correction:

- Hook fixtures: `HOOK_TESTS PASS 46/46`.
- Native harness: `HARNESS_VALIDATION PASS checks=145 warnings=0`.
- Shared validator self-test: `SHARED_VALIDATOR_SELF_TEST PASS 6/6`.
- Shared harness: `SHARED_HARNESS_VALIDATION PASS checks=84`.
- Path-scoped `git diff --check`: exit `0`.

All eleven prepared `.bak.20260713-092146` files, the shared-validator backup, and the corrected-file backups matched their `HEAD` originals during review. The five named pre-existing dirty paths remained outside migration scope. Actual project-role/config/PreToolUse loading remains limited to a new trusted session after the User re-enables PreToolUse.
