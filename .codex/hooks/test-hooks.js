/*
Status: COMPLETE
Purpose: Execute deterministic allowed and blocked samples against hook scripts without executing payload commands.
Readers: Harness maintainers and independent reviewers.
Source of truth: .codex/hooks/README.md.
Related: docs/codex-harness/08-VERIFICATION-REPORT.md.
*/
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PRE = path.join(__dirname, 'pre-tool-use-guard.js');
const STOP = path.join(__dirname, 'completion-evidence-guard.js');
const VALIDATOR = path.join(__dirname, 'validate-harness.js');

function runHook(script, payload, raw) {
  const input = raw === undefined ? JSON.stringify(payload) : raw;
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`hook process exited ${result.status}: ${(result.stderr || '').trim()}`);
  }
  const output = (result.stdout || '').trim();
  if (!output) return { blocked: false, output: null, reason: '' };
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (_) {
    throw new Error('hook emitted non-JSON output');
  }
  const specific = parsed.hookSpecificOutput || {};
  const blocked = parsed.decision === 'block' || specific.permissionDecision === 'deny' || parsed.continue === false;
  const reason = parsed.reason || specific.permissionDecisionReason || parsed.stopReason || '';
  return { blocked, output: parsed, reason };
}

function shell(command, cwd = ROOT) {
  return { hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } };
}

function patch(command, cwd = ROOT) {
  return { hook_event_name: 'PreToolUse', cwd, tool_name: 'apply_patch', tool_input: { command } };
}

function stop(message, stopHookActive = false) {
  return { hook_event_name: 'Stop', cwd: ROOT, last_assistant_message: message, stop_hook_active: stopHookActive };
}

const compliant = `Status: COMPLETE
Files changed:
- docs/codex-harness/example.md
Verification:
- Command: node .codex/hooks/validate-harness.js
  Exit code: 0
  Result: validation passed
Independent review:
- Reviewer: fresh-context-reviewer
  Verdict: PASS
  Findings: Critical 0, High 0, Medium 0, Low 0
Limitations:
- none`;

const limited = `Status: PASS WITH DOCUMENTED LIMITATIONS
Files changed:
- docs/codex-harness/example.md
Verification:
- Command: node .codex/hooks/validate-harness.js
  Exit code: 0
  Result: structural checks passed
Independent review:
- Reviewer: fresh-context-reviewer
  Verdict: PASS
  Findings: Critical 0, High 0, Medium 1, Low 0
Limitations:
- New-session hook loading remains unverified; User owns the next-session check.`;

const subagentPass = `Status: PASS
Summary:
- Bounded investigation passed.
Evidence:
- docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md:139
Commands:
- Command: node .codex/hooks/validate-harness.js
  Exit code: 0
  Result: prescribed check passed
Files changed:
- none
Unresolved risks:
- none
Recommended next action:
- Return evidence to the Commander.`;

const cases = [
  ['allow read-only global Codex inspection', PRE, shell('Get-Content -LiteralPath C:\\Users\\sean1\\.codex\\config.toml'), false],
  ['allow repository-relative write command', PRE, shell('Set-Content -LiteralPath docs\\codex-harness\\example.tmp -Value safe'), false],
  ['allow WSL-mounted repository shell write', PRE, shell('tee /mnt/c/Projects/autospinner/docs/codex-harness/example.tmp'), false],
  ['allow quoted Windows in-root copy path with spaces', PRE, shell('copy docs\\source.txt \x22C:\\Projects\\autospinner\\docs\\codex-harness\\safe output.txt\x22'), false],
  ['allow WSL-mounted in-root copy alias', PRE, shell('cp docs/source.txt /mnt/c/Projects/autospinner/docs/codex-harness/output.txt'), false],
  ['allow repository apply_patch', PRE, patch('*** Begin Patch\n*** Add File: docs/codex-harness/example.md\n+safe\n*** End Patch'), false],
  ['allow Git Bash repository patch path', PRE, patch('*** Begin Patch\n*** Add File: /c/Projects/autospinner/docs/codex-harness/example.md\n+safe\n*** End Patch'), false],
  ['block Windows external patch path', PRE, patch('*** Begin Patch\n*** Add File: C:\\Users\\sean1\\outside.txt\n+unsafe\n*** End Patch'), true],
  ['block Git Bash external patch path', PRE, patch('*** Begin Patch\n*** Add File: /c/Users/sean1/outside.txt\n+unsafe\n*** End Patch'), true],
  ['block WSL external patch path', PRE, patch('*** Begin Patch\n*** Add File: /mnt/c/Users/sean1/outside.txt\n+unsafe\n*** End Patch'), true],
  ['block relative traversal patch', PRE, patch('*** Begin Patch\n*** Add File: ../outside.txt\n+unsafe\n*** End Patch'), true],
  ['block external shell write', PRE, shell('Set-Content -LiteralPath C:\\Users\\sean1\\outside.txt -Value unsafe'), true],
  ['block quoted Windows root-prefix external path with spaces', PRE, shell('copy docs\\source.txt \x22C:\\Projects\\autospinner escape\\outside.txt\x22'), true],
  ['block quoted Git Bash external copy path with spaces', PRE, shell('cp docs/source.txt \x22/c/Users/sean1/Outside Folder/out.txt\x22'), true],
  ['block quoted WSL external move path with spaces', PRE, shell('mv docs/source.txt \x22/mnt/c/Users/sean1/Outside Folder/out.txt\x22'), true],
  ['block POSIX tmp shell write', PRE, shell('tee /tmp/outside.txt'), true],
  ['block POSIX home shell write', PRE, shell('tee /home/user/outside.txt'), true],
  ['block direct POSIX delete alias outside root', PRE, shell('rm /tmp/outside.txt'), true],
  ['block direct Windows delete alias outside root', PRE, shell('del C:\\Users\\sean1\\outside.txt'), true],
  ['block traversal shell write', PRE, shell('Set-Content -LiteralPath ..\\outside.txt -Value unsafe'), true],
  ['block git reset hard', PRE, shell('git reset --hard HEAD'), true],
  ['block git clean', PRE, shell('git clean -fd'), true],
  ['block force push', PRE, shell('git push origin master --force'), true],
  ['block dependency install', PRE, shell('npm install lodash'), true],
  ['block credential modification', PRE, shell('setx API_TOKEN unsafe'), true],
  ['block production deploy', PRE, shell('terraform apply'), true],
  ['block hooks false patch', PRE, patch('*** Begin Patch\n*** Update File: .codex/config.toml\n@@\n-hooks = true\n+hooks = false\n*** End Patch'), true],
  ['block mandatory guard content update', PRE, patch('*** Begin Patch\n*** Update File: .codex/hooks/pre-tool-use-guard.js\n@@\n-old\n+new\n*** End Patch'), true],
  ['block mandatory guard shell overwrite', PRE, shell('Set-Content -LiteralPath .codex\\hooks\\pre-tool-use-guard.js -Value unsafe'), true],
  ['block hook deletion patch', PRE, patch('*** Begin Patch\n*** Delete File: .codex/hooks/pre-tool-use-guard.js\n*** End Patch'), true],
  ['block absolute mandatory control deletion', PRE, patch('*** Begin Patch\n*** Delete File: C:\\Projects\\autospinner\\.codex\\hooks\\pre-tool-use-guard.js\n*** End Patch'), true],
  ['block mandatory control move', PRE, patch('*** Begin Patch\n*** Update File: .codex/hooks/pre-tool-use-guard.js\n*** Move to: docs/codex-harness/retired-guard.js\n@@\n-old\n+new\n*** End Patch'), true],
  ['block invalid PreToolUse JSON', PRE, null, true, '{invalid'],
  ['allow non-completion response', STOP, stop('The current evidence is inconclusive, so no completion claim is being made.'), false],
  ['block unsupported completion', STOP, stop('I have completed the work.'), true],
  ['allow compliant completion', STOP, stop(compliant), false],
  ['allow documented limited pass', STOP, stop(limited), false],
  ['allow compliant subagent PASS report', STOP, stop(subagentPass), false],
  ['block bare subagent PASS report', STOP, stop('Status: PASS'), true],
  ['block completion with High finding', STOP, stop(compliant.replace('High 0', 'High 1')), true],
  ['block COMPLETE with non-none limitation', STOP, stop(compliant.replace('- none', '- Hook loading is unverified.')), true],
  ['block self-review completion', STOP, stop(compliant.replace('fresh-context-reviewer', 'self')), true],
  ['allow structurally valid unverified reviewer name because identity is unauthenticated', STOP, stop(compliant.replace('fresh-context-reviewer', 'plausible-but-unverified-agent')), false],
  ['block repeated invalid completion safely', STOP, stop('Completed without evidence.', true), true],
  ['block invalid Stop JSON', STOP, null, true, '{invalid']
];

let failures = 0;
for (const item of cases) {
  const [name, script, payload, expectedBlocked, raw] = item;
  try {
    const result = runHook(script, payload, raw);
    if (result.blocked !== expectedBlocked) {
      throw new Error(`expected blocked=${expectedBlocked}, observed ${result.blocked}`);
    }
    if (expectedBlocked && !/Corrective next step:/i.test(result.reason)) {
      throw new Error('blocked result lacks a corrective next step');
    }
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  const result = spawnSync(process.execPath, [VALIDATOR, '--self-test'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0 || !/VALIDATOR_SELF_TEST PASS/.test(result.stdout || '')) {
    throw new Error(`validator self-test exited ${result.status}`);
  }
  console.log('PASS validator negative fixtures');
} catch (error) {
  failures += 1;
  console.error(`FAIL validator negative fixtures: ${error.message}`);
}

const total = cases.length + 1;
if (failures === 0) {
  console.log(`HOOK_TESTS PASS ${total}/${total}`);
  process.exit(0);
}
console.error(`HOOK_TESTS FAIL ${failures}/${total}`);
process.exit(1);
