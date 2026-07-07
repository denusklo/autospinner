# 05 — Handover Letter to Future Sessions (G)

> Written 2026-07-07, at the close of Fable 5's only session. Readers: the models that take over next (most likely Opus 4.8 or Sonnet) and the User.
> Status: this letter is background and advice, **not rules**; where it conflicts with the provisions of `01`–`04`, the provisions win. Exception: section 3, the "circuit-breaker handover area", is a workspace and may be appended to when a session circuit-breaks (exemption granted in 04 section 1).

## 1. Three Things Nobody Asked About That I Consider Most Critical

### 1.1 This project's bottleneck is "observability", not "model intelligence"

Switching to a stronger model will not solve "cannot see the browser". In past failed iterations, model intelligence was never the weak link — the missing piece was the feedback loop. Investment priority should be:

1. **Short term (done)**: the `[TOS]` structured log contract + the Node verification channel (PROJECT-FACTS section 4).
2. **Medium term (the single most worthwhile upgrade)**: use Playwright to launch Chromium with this extension loaded (`--load-extension=C:\Projects\autospinner` + `--disable-extensions-except=...`), open the real simulator page, and capture the console's `[TOS]` lines back. Once built, content.js-type changes go from "wait for the User to test by hand" to "the model tests itself", and the whole escalation system's power multiplies roughly threefold. Building this is itself a standalone task well suited to delegating to Sonnet (acceptance criterion: one command runs end-to-end and returns the board JSON). Note: the simulator page is a third-party site — scripts read only, never write, and do not hit it at high frequency.
3. **Reminder**: if the simulator site is redesigned (canvas structure, color theme), F3–F6 are all void. The symptom will be "suddenly everything misreads" — re-verify PROJECT-FACTS first; do not rush to fix the algorithm.

### 1.2 The global environment carries five debts (outside the repo; per instruction I did not touch them)

The list with concrete commands is in `00-DIAGNOSIS.md` section 5. The two most urgent: **the default model is still pinned to `claude-fable-5[1m]`** (the User needs to run `/model` to reset), and **the plaintext API keys in `~/.claude.json`** (rotation recommended). Future models: these are outside the repo and fall under 02 matrix three C3 — remind the User, but do not act without consent.

### 1.3 This harness is a portable asset, not something proprietary to this project

The four files `01`–`04` are deliberately written as a generic system with nothing TOS-specific; all project-specific knowledge is isolated in `PROJECT-FACTS.md`, `LESSONS.md`, and the routing tables in `CLAUDE.md`. The User's other automation projects (gpog-autobet, ttt_aim, etc. — the same "the model cannot see the execution environment" shape) can copy `.claude/harness/` wholesale and rewrite only the three files FACTS/LESSONS/CLAUDE.md. They will hit the same class of pitfalls.

## 2. How This System Degrades Under Long-Term Weak-Model Operation, and Prevention

Ordered by probability of occurrence:

| # | Corruption mode | Early symptom | Prevention/correction |
|---|---|---|---|
| 1 | **Checklist theater**: weak models treat DoD checkmarks as homework — checked but without evidence | Reports contain "verified✓" but no pasted command output | The system already requires "a checkmark without an evidence pointer = not checked" (02 DoD preamble). User-side spot check: when you see a ✓, ask "which line is the evidence on"; one spot check's deterrence lasts a month |
| 2 | **LESSONS inflation**: everything gets recorded, the file becomes a running diary, later models stop reading it | Entries appear for "ordinary bugs fixed on the first try"; file exceeds 150 lines with no compaction | 04 section 2 already defines what does not count as a pitfall + section 4 forces compaction (including the "3 consecutive low-value entries" trigger, no need to wait for the line threshold) |
| 3 | **Rule amnesia** (more common than tampering): the model starts work without reading the harness at all | Wrong report format, code written without checking FACTS, asking the User to paste full-page logs | CLAUDE.md is the only auto-loaded line of defense, so it must stay thin (<100 lines) and put "read FACTS before acting" as hard rule number one. User-side password: "follow the CLAUDE.md rules first" is enough to call it back |
| 4 | **Self-serving rule tampering**: the model changes rules to excuse its own failures (e.g. turning two strikes into three) | `git log -- .claude/harness` shows semantic changes without the `harness-rule-change:` prefix | The freeze tiers of 04 sections 1 and 5 + independent-commit auditing. The User runs the audit command once every few weeks |
| 5 | **Stale FACTS**: after a simulator redesign, old facts keep misleading | "A feature that always worked is suddenly all wrong" | Every fact carries a verification date; the rule is already set: "reality wins — re-verify before fixing code" (04 section 3, this letter 1.1.3) |

One-sentence summary for my future self: **this system exists not to make you smarter, but to make your mistakes cheaper. When a rule blocks you, that is usually exactly it doing its work.**

## 3. Unfinished Items From This Session (circuit-breaker handover area)

None. A–G all delivered; adversarial review and read-back verification were executed (results in the main conversation's execution summary).
