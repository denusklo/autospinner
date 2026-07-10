/*
Status: COMPLETE
Purpose: Deny detectable out-of-repository writes, traversal, hook disabling, and high-risk commands.
Readers: Codex hook runtime, harness maintainers, and reviewers.
Source of truth: docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md HL-03.
Related: .codex/hooks/README.md and test-hooks.js.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.win32.normalize('C:\\Projects\\autospinner');
const ROOT_KEY = ROOT.toLowerCase();
const APPLY_NAMES = new Set(['apply_patch', 'edit', 'write']);
const SHELL_NAMES = new Set(['bash', 'shell_command', 'exec_command', 'shell']);
const MANDATORY_CONTROLS = new Set(['.codex/config.toml', '.codex/hooks.json']);

const HIGH_RISK = [
  ['destructive Git reset', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+reset\s+--hard\b/i],
  ['destructive Git clean', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+clean(?:\s|$)/i],
  ['destructive Git checkout', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+checkout\s+--(?:\s|$)/i],
  ['destructive Git restore', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+restore(?:\s|$)/i],
  ['force push', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+push\b[^\r\n;&|]*(?:--force(?:-with-lease)?|\s-f(?:\s|$))/i],
  ['Git stash of User work', /\bgit(?:\.exe)?(?:\s+-c\s+\S+)*\s+stash(?:\s|$)/i],
  ['recursive deletion', /\b(?:remove-item|rm)\b[^\r\n;&|]*(?:-recurse|-r\b|--recursive)[^\r\n;&|]*(?:-force|-f\b|--force)?/i],
  ['recursive deletion', /\b(?:rmdir|rd|del|erase)\b[^\r\n;&|]*(?:\/s\b|-s\b)/i],
  ['database destruction', /\b(?:drop\s+(?:database|schema)|prisma\s+migrate\s+reset|sequelize\s+db:drop|rails\s+db:drop|migrate:fresh)\b/i],
  ['production or infrastructure action', /\b(?:firebase\s+deploy|vercel\b[^\r\n;&|]*--prod|netlify\s+deploy\b[^\r\n;&|]*--prod|terraform\s+(?:apply|destroy)|kubectl\s+(?:apply|delete)|helm\s+(?:install|upgrade|uninstall))\b/i],
  ['credential modification', /\b(?:npm\s+login|gh\s+auth|git\s+credential|cmdkey|ssh-keygen|setx\b[^\r\n;&|]*(?:token|secret|password|key))\b/i],
  ['credential modification', /setenvironmentvariable\s*\([^\r\n]*(?:token|secret|password|key)/i],
  ['dependency change', /\b(?:npm\s+(?:install|i|update|upgrade)|pnpm\s+(?:add|install|update|upgrade)|yarn\s+(?:add|install|upgrade)|bun\s+(?:add|install|update)|pip\s+(?:install|uninstall)|cargo\s+(?:add|update)|composer\s+(?:require|update))\b/i],
  ['dependency change', /\b(?:python|py)\s+-m\s+pip\s+(?:install|uninstall)\b/i],
  ['test or hook bypass', /(?:--no-verify\b|\bHUSKY\s*=\s*0\b|\bSKIP_TESTS\s*=|\bhooks\s*=\s*false\b)/i],
  ['mandatory control removal or relocation', /\b(?:remove-item|move-item|rename-item|rm|mv|del|erase)\b[^\r\n;&|]*(?:\.codex[\\/](?:config\.toml|hooks(?:\.json|[\\/])))/i],
  ['mandatory control content modification', /(?:\b(?:set-content|add-content|out-file|remove-item|move-item|copy-item|rename-item|cp|mv|rm|del|erase|copy|move|xcopy|robocopy)\b[^\r\n;&|]*|>{1,2}\s*[^\r\n;&|]*)(?:\.codex[\\/](?:config\.toml|hooks(?:\.json|[\\/])))/i],
  ['filesystem permission change', /\b(?:set-acl|icacls|takeown|chmod|chown)\b/i]
];

const WRITE_INTENT = /\b(?:set-content|add-content|out-file|new-item|remove-item|move-item|copy-item|rename-item|mkdir|touch|tee|cp|mv|rm|rmdir|del|erase|copy|move|xcopy|robocopy|mklink|ln|sed\s+-i|perl\s+-pi|git\s+(?:add|commit|merge|rebase|cherry-pick|tag)|npm\s+(?:install|i|update|upgrade)|pnpm\s+(?:add|install|update)|yarn\s+(?:add|install|upgrade))\b|(?:^|[\s)])>{1,2}(?!=)/i;
const HOME_REFERENCE = /(?:\$env:(?:userprofile|home)|%userprofile%|%home%|\$home\b|~[\\/])/i;

function denial(reason, corrective) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `AUTOSPINNER_GUARD: ${reason}. Corrective next step: ${corrective}`
    }
  };
}

function isInsideRoot(candidate) {
  const key = path.win32.normalize(candidate).toLowerCase();
  return key === ROOT_KEY || key.startsWith(`${ROOT_KEY}\\`);
}

function trimToken(raw) {
  return String(raw || '').trim().replace(/^[`'\x22]+|[`'\x22,)}\]]+$/g, '');
}

function toWindowsPath(raw, cwd) {
  let value = trimToken(raw).replace(/^file:\/\//i, '');
  try {
    value = decodeURIComponent(value);
  } catch (_) {
    throw new Error('path encoding is invalid');
  }

  let match = value.match(/^\/mnt\/([a-z])(?:\/(.*))?$/i);
  if (match) value = `${match[1]}:\\${(match[2] || '').replace(/\//g, '\\')}`;

  match = value.match(/^\/([a-z])(?:\/(.*))?$/i);
  if (match) value = `${match[1]}:\\${(match[2] || '').replace(/\//g, '\\')}`;

  if (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value)) {
    return path.win32.normalize(value);
  }

  const base = cwd ? toWindowsPath(cwd, ROOT) : ROOT;
  return path.win32.resolve(base, value.replace(/\//g, '\\'));
}

function hasTraversal(raw) {
  return trimToken(raw).split(/[\\/]+/).some(part => part === '..');
}

function verifyExistingAncestor(candidate) {
  let current = path.win32.normalize(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.win32.dirname(current);
    if (parent === current) return { ok: false, reason: 'no resolvable ancestor' };
    current = parent;
  }

  try {
    const resolved = fs.realpathSync.native(current);
    return isInsideRoot(resolved)
      ? { ok: true }
      : { ok: false, reason: 'existing ancestor resolves outside the repository' };
  } catch (_) {
    return { ok: false, reason: 'existing ancestor could not be resolved safely' };
  }
}

function patchPaths(command) {
  const found = [];
  const pattern = /^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s*(.+?)\s*$/gmi;
  const movePattern = /^\*\*\*\s+Move\s+to:\s*(.+?)\s*$/gmi;
  let match;
  while ((match = pattern.exec(command)) !== null) found.push(match[1]);
  while ((match = movePattern.exec(command)) !== null) found.push(match[1]);
  return found;
}

function extractsAbsolutePaths(command) {
  const values = [];
  const quotedPatterns = [
    /\x22([a-z]:[\\/][^\x22\r\n]+|\\\\[^\x22\r\n]+|\/[^\x22\r\n]+)\x22/gi,
    /'([a-z]:[\\/][^'\r\n]+|\\\\[^'\r\n]+|\/[^'\r\n]+)'/gi
  ];
  for (const pattern of quotedPatterns) {
    let quoted;
    while ((quoted = pattern.exec(command)) !== null) values.push(quoted[1]);
  }

  const patterns = [
    /[a-z]:[\\/][^\s'`\x22;|]+/gi,
    /\\\\[^\s'`\x22;|]+/g,
    /\/mnt\/[a-z]\/(?:[^\s'`\x22;|]*)/gi,
    /\/[a-z]\/(?:[^\s'`\x22;|]*)/gi
  ];
  for (const pattern of patterns) {
    const matches = command.match(pattern);
    if (matches) values.push(...matches);
  }
  const posix = /(?:^|[\s'`\x22])(\/(?!\/)[^\s'`\x22;|]+)/g;
  let match;
  while ((match = posix.exec(command)) !== null) values.push(match[1]);
  return [...new Set(values)];
}

function headerPaths(command, kind) {
  const safeKind = kind.replace(/[^A-Za-z ]/g, '');
  const pattern = new RegExp(`^\\*\\*\\*\\s+${safeKind}\\s*(?:File)?:?\\s*(.+?)\\s*$`, 'gmi');
  const found = [];
  let match;
  while ((match = pattern.exec(command)) !== null) found.push(match[1]);
  return found;
}

function isMandatoryControl(raw, cwd) {
  let candidate;
  try { candidate = toWindowsPath(raw, cwd); }
  catch (_) { return true; }
  if (!isInsideRoot(candidate)) return false;
  const relative = path.win32.relative(ROOT, candidate).replace(/\\/g, '/').toLowerCase();
  return MANDATORY_CONTROLS.has(relative) || relative.startsWith('.codex/hooks/');
}

function selfProtectionViolation(command, cwd) {
  if (/\bhooks\s*=\s*false\b/i.test(command)) return true;
  const changed = [
    ...headerPaths(command, 'Update File'),
    ...headerPaths(command, 'Delete File'),
    ...headerPaths(command, 'Move to')
  ];
  return changed.some(raw => isMandatoryControl(raw, cwd));
}

function evaluatePatch(command, cwd) {
  const paths = patchPaths(command);
  if (paths.length === 0) {
    return denial('apply_patch input has no supported file header', 'use standard Add, Update, Delete, or Move-to patch headers inside the repository');
  }
  if (selfProtectionViolation(command, cwd)) {
    return denial('the patch modifies, disables, deletes, or moves a mandatory harness control', 'ask the User for an explicit policy change; there is no model-invocable bypass');
  }

  for (const raw of paths) {
    if (hasTraversal(raw)) {
      return denial('relative path traversal is not allowed in a patch', 'use a repository-relative path with no .. segments');
    }
    let candidate;
    try {
      candidate = toWindowsPath(raw, cwd);
    } catch (_) {
      return denial('a patch path could not be normalized safely', 'use a literal repository-relative Windows path');
    }
    if (!isInsideRoot(candidate)) {
      return denial('a patch targets a path outside C:\\Projects\\autospinner', 'limit the patch to the repository or ask the User to expand scope');
    }
    const resolved = verifyExistingAncestor(candidate);
    if (!resolved.ok) {
      return denial(`a patch path failed the reparse check: ${resolved.reason}`, 'choose a literal path whose existing ancestor resolves inside the repository');
    }
  }
  return null;
}

function evaluateShell(command, cwd) {
  for (const [label, pattern] of HIGH_RISK) {
    if (pattern.test(command)) {
      return denial(`${label} requires explicit User control`, 'stop and ask the User for the exact approved operation or use a non-destructive diagnostic');
    }
  }

  if (!WRITE_INTENT.test(command)) return null;

  let workingDirectory;
  try {
    workingDirectory = toWindowsPath(cwd || ROOT, ROOT);
  } catch (_) {
    return denial('the working directory could not be normalized safely', 'return to C:\\Projects\\autospinner and retry after recording status');
  }
  if (!isInsideRoot(workingDirectory)) {
    return denial('a write-capable command is running outside the repository', 'return to C:\\Projects\\autospinner or use a read-only command');
  }
  if (/(?:^|[\s'`\x22])\.\.(?:[\\/]|$)/.test(command)) {
    return denial('a write-capable command contains relative traversal', 'use a literal path inside the repository with no .. segments');
  }
  if (HOME_REFERENCE.test(command)) {
    return denial('a write-capable command references a home/profile path', 'use a literal repository path or ask the User to authorize external scope');
  }

  for (const raw of extractsAbsolutePaths(command)) {
    let candidate;
    try {
      candidate = toWindowsPath(raw, workingDirectory);
    } catch (_) {
      return denial('an absolute write path could not be normalized safely', 'use a literal repository path');
    }
    if (!isInsideRoot(candidate)) {
      return denial('a detectable write path is outside C:\\Projects\\autospinner', 'limit the command to the repository or ask the User to expand scope');
    }
    const resolved = verifyExistingAncestor(candidate);
    if (!resolved.ok) {
      return denial(`a write path failed the reparse check: ${resolved.reason}`, 'choose a path whose existing ancestor resolves inside the repository');
    }
  }
  return null;
}

function evaluate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return denial('hook input is not a JSON object', 'retry with a valid Codex PreToolUse payload');
  }
  if (payload.hook_event_name && payload.hook_event_name !== 'PreToolUse') {
    return denial('hook event does not match PreToolUse', 'check .codex/hooks.json event wiring');
  }

  const tool = String(payload.tool_name || '').toLowerCase();
  const command = payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string' || command.trim() === '') {
    return denial('guarded tool input has no command string', 'use a supported literal tool input');
  }
  if (APPLY_NAMES.has(tool)) return evaluatePatch(command, payload.cwd || ROOT);
  if (SHELL_NAMES.has(tool)) return evaluateShell(command, payload.cwd || ROOT);
  return denial('an unsupported tool matched the safety hook', 'review the matcher and add an explicit safe handler before using this tool');
}

function run() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    let result;
    try {
      result = evaluate(JSON.parse(input));
    } catch (_) {
      result = denial('hook input is invalid JSON', 'retry with a valid Codex hook payload; no tool action was authorized');
    }
    if (result) process.stdout.write(JSON.stringify(result));
  });
}

if (require.main === module) run();

module.exports = { ROOT, denial, evaluate, evaluatePatch, evaluateShell, toWindowsPath, hasTraversal, isInsideRoot };
