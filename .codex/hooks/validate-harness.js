/*
Status: COMPLETE
Purpose: Validate harness presence, syntax subset, links, limits, agents, skill, identifiers, hook wiring, and secret patterns.
Readers: Harness maintainers, workers, reviewers, and future CI.
Source of truth: docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md HL-01 through HL-03.
Related: .codex/hooks/README.md.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXPECTED_ROOT = path.win32.normalize('C:\\Projects\\autospinner').toLowerCase();
const REQUIRED = [
  'AGENTS.md', '.codex/config.toml', '.codex/hooks.json',
  '.codex/agents/coding-worker.toml', '.codex/agents/harness-explorer.toml',
  '.codex/agents/harness-worker.toml', '.codex/agents/fresh-context-reviewer.toml',
  '.codex/hooks/README.md',
  '.codex/hooks/pre-tool-use-guard.js', '.codex/hooks/completion-evidence-guard.js',
  '.codex/hooks/test-hooks.js', '.codex/hooks/validate-harness.js',
  '.agents/skills/harness-maintenance/SKILL.md',
  '.agents/skills/harness-maintenance/references/MAINTENANCE-CHECKLIST.md',
  '.agents/skills/harness-maintenance/agents/openai.yaml',
  'docs/codex-harness/00-README.md', 'docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md',
  'docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md',
  'docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md',
  'docs/codex-harness/04-DISPATCH-PROMPT-TEMPLATES.md',
  'docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md',
  'docs/codex-harness/06-HANDOFF-TO-FUTURE-SESSIONS.md',
  'docs/codex-harness/07-ADVERSARIAL-REVIEW.md',
  'docs/codex-harness/08-VERIFICATION-REPORT.md',
  'docs/codex-harness/lessons/README.md', 'docs/codex-harness/lessons/PITFALLS.md'
];
const PITFALL_FIELDS = [
  'Status', 'Date', 'Task type', 'Symptom', 'Root cause', 'Failed approach', 'Evidence',
  'Correct approach', 'Prevention mechanism', 'Verification', 'Generalization scope',
  'Confidence', 'Related files', 'Expiration or review condition'
];
const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub-style token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['bearer credential', /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/]
];
const TRIPLE = `'''`;

function full(relative) { return path.join(ROOT, ...relative.split('/')); }
function read(relative) { return fs.readFileSync(full(relative), 'utf8'); }
function rows(text) { return text.replace(/\r\n/g, '\n').split('\n'); }
function metrics(text) {
  const all = rows(text);
  return { bytes: Buffer.byteLength(text, 'utf8'), lines: all.length,
    maxLine: all.reduce((max, line) => Math.max(max, line.length), 0) };
}

function parseTomlSubset(text, label = 'TOML') {
  const values = new Map();
  let section = '';
  let pending = null;
  let pendingValue = [];
  for (const [offset, raw] of rows(text).entries()) {
    const line = raw.trim();
    if (pending) {
      if (line === TRIPLE) {
        values.set(pending, pendingValue.join('\n'));
        pending = null;
        pendingValue = [];
      } else pendingValue.push(raw);
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }
    const keyMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!keyMatch) throw new Error(`${label}:${offset + 1} invalid TOML subset syntax`);
    const key = section ? `${section}.${keyMatch[1]}` : keyMatch[1];
    if (values.has(key)) throw new Error(`${label}:${offset + 1} duplicate key ${key}`);
    const value = keyMatch[2].trim();
    if (value === TRIPLE) pending = key;
    else if (/^'[^']*'$/.test(value)) values.set(key, value.slice(1, -1));
    else if (/^\x22(?:[^\x22\\]|\\.)*\x22$/.test(value)) values.set(key, value.slice(1, -1));
    else if (/^(?:true|false)$/.test(value)) values.set(key, value === 'true');
    else if (/^-?\d+$/.test(value)) values.set(key, Number(value));
    else if (/^\[[^\]]*\]$/.test(value)) values.set(key, value);
    else throw new Error(`${label}:${offset + 1} TOML value must be quoted, boolean, integer, or simple array`);
  }
  if (pending) throw new Error(`${label}: unclosed multiline literal for ${pending}`);
  return values;
}

function fileStatus(text) {
  const head = rows(text).slice(0, 12).join('\n');
  const match = head.match(/(?:\*\*Status:\*\*|#\s*Status:|Status:)\s*([A-Z ]+)/);
  return match ? match[1].trim() : null;
}
function walk(directory, predicate, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(item, predicate, found);
    else if (predicate(item)) found.push(item);
  }
  return found;
}
function slug(value) {
  return value.trim().toLowerCase().replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}
function links(file, text) {
  const result = [];
  const pattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|app:)/i.test(target) || target.startsWith('#')) continue;
    const hash = target.indexOf('#');
    const fragment = hash >= 0 ? target.slice(hash + 1) : '';
    if (hash >= 0) target = target.slice(0, hash);
    try { target = decodeURIComponent(target); }
    catch (_) { result.push({ error: 'invalid URL encoding' }); continue; }
    result.push({ resolved: path.resolve(path.dirname(file), target || '.'), fragment, source: match[1] });
  }
  return result;
}
function collectIds(text) {
  const patterns = [/^###\s+(AP-\d{2})\b/gm, /^\|\s*(TC-\d{2})\s*\|/gm,
    /^\|\s*(CB-\d{2})\s*\|/gm, /^\|\s*(DG-\d{2})\s*\|/gm,
    /^##\s+(CH-\d{8}-\d{3})\b/gm];
  const found = [];
  for (const pattern of patterns) { let match; while ((match = pattern.exec(text)) !== null) found.push(match[1]); }
  return found;
}
function secretFindings(relative, text) {
  return SECRET_PATTERNS.filter(item => item[1].test(text)).map(item => `${relative}: possible ${item[0]}`);
}

function validatePitfalls(text, errors) {
  const records = text.split(/^##\s+(?=CH-\d{8}-\d{3})/m).slice(1);
  for (const record of records) {
    const id = (record.match(/^(CH-\d{8}-\d{3})/) || [null, 'unknown'])[1];
    for (const field of PITFALL_FIELDS) {
      const safe = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!(new RegExp(`^- ${safe}:\\s*\\S`, 'm')).test(record)) errors.push(`${id}: missing field ${field}`);
    }
    const state = (record.match(/^- Status:\s*(\S+)/m) || [null, ''])[1];
    if (!['CONFIRMED', 'PROVISIONAL', 'OBSOLETE', 'SUPERSEDED'].includes(state)) errors.push(`${id}: invalid status`);
  }
}
function validateBudget(relative, limits, errors, warnings) {
  const value = metrics(read(relative));
  if (value.lines > limits.lines) errors.push(`${relative}: ${value.lines} lines exceeds ${limits.lines}`);
  if (value.bytes > limits.bytes) errors.push(`${relative}: ${value.bytes} bytes exceeds ${limits.bytes}`);
  if (value.maxLine > limits.maxLine) errors.push(`${relative}: max line ${value.maxLine} exceeds ${limits.maxLine}`);
  if (limits.warnLines && value.lines > limits.warnLines) warnings.push(`${relative}: line warning ${value.lines}`);
  if (limits.warnBytes && value.bytes > limits.warnBytes) warnings.push(`${relative}: byte warning ${value.bytes}`);
}

function runValidation() {
  const errors = [];
  const warnings = [];
  let checks = 0;
  const check = (condition, message) => { checks += 1; if (!condition) errors.push(message); };

  check(path.win32.normalize(ROOT).toLowerCase() === EXPECTED_ROOT, `validator root mismatch: ${ROOT}`);
  for (const relative of REQUIRED) {
    check(fs.existsSync(full(relative)), `missing required file ${relative}`);
    if (fs.existsSync(full(relative))) check(fs.statSync(full(relative)).size > 0, `empty required file ${relative}`);
  }
  const override = full('AGENTS.override.md');
  check(!fs.existsSync(override) || fs.statSync(override).size === 0, 'non-empty root AGENTS.override.md masks AGENTS.md');
  for (const relative of REQUIRED.filter(item => item !== '.codex/hooks.json')) {
    if (fs.existsSync(full(relative))) check(fileStatus(read(relative)) === 'COMPLETE', `${relative}: status must be COMPLETE`);
  }

  try {
    const config = parseTomlSubset(read('.codex/config.toml'), '.codex/config.toml');
    check(config.get('model') === 'gpt-5.6-sol', 'Commander/planning model must be gpt-5.6-sol');
    check(config.get('model_reasoning_effort') === 'max', 'Commander/planning reasoning effort must be max');
    check(config.get('sandbox_mode') === 'workspace-write', 'sandbox_mode must be workspace-write');
    check(config.get('approval_policy') === 'on-request', 'approval_policy must be on-request');
    check(config.get('sandbox_workspace_write.network_access') === false, 'network_access must be false');
    check(config.get('agents.max_depth') === 1, 'agents.max_depth must be 1');
    check(config.get('agents.max_threads') === 3, 'agents.max_threads must be 3');
    check(config.get('features.hooks') === true, 'features.hooks must be true');
    check(config.get('features.multi_agent') === true, 'features.multi_agent must be true');
    check(![...config.keys()].some(key => key.startsWith('hooks.')), 'hooks may not be inline in config.toml');
    check(![...config.keys()].some(key => key.startsWith('mcp_servers.')), 'project config adds an unreviewed MCP server');
  } catch (error) { errors.push(error.message); }

  const agents = {
    'coding-worker': { sandbox: 'workspace-write', model: 'gpt-5.6-sol', effort: 'high' },
    'harness-explorer': { sandbox: 'read-only', model: 'gpt-5.6-terra', effort: 'high' },
    'harness-worker': { sandbox: 'workspace-write', model: 'gpt-5.6-luna', effort: 'medium' },
    'fresh-context-reviewer': { sandbox: 'read-only', model: 'gpt-5.6-sol', effort: 'max' }
  };
  for (const [name, expected] of Object.entries(agents)) {
    const relative = `.codex/agents/${name}.toml`;
    try {
      const agent = parseTomlSubset(read(relative), relative);
      check(agent.get('name') === name, `${relative}: name mismatch`);
      check((agent.get('description') || '').length >= 30, `${relative}: description too vague`);
      check((agent.get('developer_instructions') || '').length >= 300, `${relative}: instructions incomplete`);
      check(agent.get('sandbox_mode') === expected.sandbox, `${relative}: sandbox must be ${expected.sandbox}`);
      check(agent.get('model') === expected.model, `${relative}: model must be ${expected.model}`);
      check(agent.get('model_reasoning_effort') === expected.effort, `${relative}: reasoning effort must be ${expected.effort}`);
      check(/Do not spawn subagents/i.test(agent.get('developer_instructions') || ''), `${relative}: recursion prohibition missing`);
      check(/ten summary bullets|No more than ten summary bullets/i.test(agent.get('developer_instructions') || ''), `${relative}: report cap missing`);
    } catch (error) { errors.push(error.message); }
  }

  const diagnosis = read('docs/codex-harness/01-HARNESS-LEAK-DIAGNOSIS.md');
  check(/Deploy four narrow project agents/i.test(diagnosis) && /application coding worker/i.test(diagnosis), 'diagnosis must describe all four project agents');
  check(/Confirm four agent files contain the approved model\/effort routes/i.test(diagnosis), 'diagnosis agent verification count or route check drift');

  try {
    const hooks = JSON.parse(read('.codex/hooks.json'));
    check(Object.keys(hooks).length === 1 && Boolean(hooks.hooks), 'hooks.json must contain only hooks');
    check(Array.isArray(hooks.hooks.PreToolUse) && hooks.hooks.PreToolUse.length > 0, 'PreToolUse hook missing');
    check(Array.isArray(hooks.hooks.Stop) && hooks.hooks.Stop.length > 0, 'Stop hook missing');
    const serialized = JSON.stringify(hooks);
    check(/pre-tool-use-guard\.js/.test(serialized), 'PreToolUse command missing');
    check(/completion-evidence-guard\.js/.test(serialized), 'Stop command missing');
    check(/commandWindows/.test(serialized), 'Windows hook command missing');
  } catch (error) { errors.push(`hooks.json invalid: ${error.message}`); }

  const skill = read('.agents/skills/harness-maintenance/SKILL.md');
  const frontmatter = skill.match(/^---\s*\n([\s\S]*?)\n---/);
  check(Boolean(frontmatter), 'SKILL.md frontmatter missing');
  if (frontmatter) {
    const keys = rows(frontmatter[1]).map(line => (line.match(/^([A-Za-z0-9_-]+):/) || [null, null])[1]).filter(Boolean);
    check(keys.length === 2 && keys.includes('name') && keys.includes('description'), 'SKILL.md frontmatter must contain only name and description');
    check(/^name:\s*harness-maintenance\s*$/m.test(frontmatter[1]), 'SKILL.md name invalid');
    check(/when|use|trigger/i.test((frontmatter[1].match(/^description:\s*(.*)$/m) || [null, ''])[1]), 'SKILL.md trigger context missing');
  }
  check(/Allowed files/i.test(skill) && /Forbidden files/i.test(skill) && /Verification/i.test(skill), 'SKILL.md scope or verification missing');

  const yaml = read('.agents/skills/harness-maintenance/agents/openai.yaml');
  check(/display_name:\s*\x22Harness Maintenance\x22/.test(yaml), 'openai.yaml display_name missing');
  const short = (yaml.match(/short_description:\s*\x22([^\x22]+)\x22/) || [null, ''])[1];
  check(short.length >= 25 && short.length <= 64, 'openai.yaml short_description must be 25-64 characters');
  check(/default_prompt:\s*\x22[^\x22]*\$harness-maintenance[^\x22]*\x22/.test(yaml), 'openai.yaml default_prompt must mention the skill');

  validateBudget('AGENTS.md', { lines: 300, bytes: 24 * 1024, maxLine: 500, warnLines: 220, warnBytes: 16 * 1024 }, errors, warnings);
  validateBudget('docs/codex-harness/lessons/PITFALLS.md', { lines: 400, bytes: 48 * 1024, maxLine: 500, warnLines: 300, warnBytes: 36 * 1024 }, errors, warnings);
  validateBudget('.agents/skills/harness-maintenance/SKILL.md', { lines: 250, bytes: 20 * 1024, maxLine: 500, warnLines: 150, warnBytes: 12 * 1024 }, errors, warnings);
  for (const relative of REQUIRED.filter(item => item.startsWith('docs/codex-harness/') && item.endsWith('.md'))) {
    validateBudget(relative, { lines: 450, bytes: 32 * 1024, maxLine: 500 }, errors, warnings);
  }

  const markdown = [full('AGENTS.md'), full('.codex/hooks/README.md'),
    full('.agents/skills/harness-maintenance/SKILL.md'),
    full('.agents/skills/harness-maintenance/references/MAINTENANCE-CHECKLIST.md'),
    ...walk(full('docs/codex-harness'), file => file.endsWith('.md'))];
  for (const file of markdown) {
    for (const link of links(file, fs.readFileSync(file, 'utf8'))) {
      if (link.error) { errors.push(`${path.relative(ROOT, file)}: ${link.error}`); continue; }
      const relativeTarget = path.relative(ROOT, link.resolved);
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        errors.push(`${path.relative(ROOT, file)}: local link escapes repository`); continue;
      }
      if (!fs.existsSync(link.resolved)) {
        errors.push(`${path.relative(ROOT, file)}: missing link ${link.source}`); continue;
      }
      if (link.fragment && fs.statSync(link.resolved).isFile()) {
        const slugs = rows(fs.readFileSync(link.resolved, 'utf8'))
          .map(line => (line.match(/^#{1,6}\s+(.+)$/) || [null, null])[1])
          .filter(Boolean).map(slug);
        if (!slugs.includes(link.fragment.toLowerCase())) errors.push(`${path.relative(ROOT, file)}: missing anchor ${link.source}`);
      }
    }
  }

  const idCounts = new Map();
  for (const file of markdown) {
    for (const id of collectIds(fs.readFileSync(file, 'utf8'))) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const [id, count] of idCounts) if (count !== 1) errors.push(`duplicate identifier ${id}`);
  check([...idCounts.keys()].filter(id => id.startsWith('AP-')).length >= 10, 'fewer than 10 AP criteria');
  check([...idCounts.keys()].filter(id => id.startsWith('TC-')).length === 10, 'TC criteria count must be 10');
  check([...idCounts.keys()].filter(id => id.startsWith('CB-')).length >= 10, 'fewer than 10 CB criteria');
  check([...idCounts.keys()].filter(id => id.startsWith('DG-')).length === 15, 'DG count must be 15');
  validatePitfalls(read('docs/codex-harness/lessons/PITFALLS.md'), errors);

  const policy = [read('AGENTS.md'), read('docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md'),
    read('docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md'),
    read('docs/codex-harness/04-DISPATCH-PROMPT-TEMPLATES.md')].join('\n');
  check(/RETRY_BUDGET\s*=\s*2 materially different repair attempts per capability tier/.test(policy), 'canonical retry token missing');
  check(!/\b(?:3|three)\s+(?:materially different\s+)?(?:repair|diagnostic)?\s*attempts\b/i.test(policy), 'conflicting three-attempt rule found');
  check(!/148 checks|verify_hazard\.js/i.test(read('AGENTS.md')), 'root router repeats stale verification data');

  const secretFiles = new Set([full('AGENTS.md')]);
  for (const relative of ['.codex', '.agents/skills/harness-maintenance', 'docs/codex-harness']) {
    const directory = full(relative);
    if (!fs.existsSync(directory)) continue;
    for (const file of walk(directory, item => /\.(?:md|toml|json|js|ya?ml|txt)$/i.test(item) || path.basename(item).includes('.bak.'))) {
      secretFiles.add(file);
    }
  }
  for (const file of secretFiles) {
    const relative = path.relative(ROOT, file).replace(/\\/g, '/');
    errors.push(...secretFindings(relative, fs.readFileSync(file, 'utf8')));
  }
  return { checks, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function selfTest() {
  const failures = [];
  let count = 0;
  const expect = (condition, name) => { count += 1; if (!condition) failures.push(name); };
  const expectThrow = (fn, name) => {
    let threw = false;
    try { fn(); } catch (_) { threw = true; }
    expect(threw, name);
  };
  const valid = parseTomlSubset(`name = 'sample'\nflag = true\ncount = 2\ntext = '''\nbody\n'''`, 'fixture');
  expect(valid.get('name') === 'sample' && valid.get('flag') === true && valid.get('count') === 2, 'valid TOML');
  expectThrow(() => parseTomlSubset('name = bare-word', 'fixture'), 'invalid TOML');
  expectThrow(() => JSON.parse('{invalid'), 'invalid JSON');
  expect(secretFindings('fixture', `sk-${'A'.repeat(24)}`).length === 1, 'secret pattern');
  expect(collectIds('### AP-01 — one\n### AP-01 — duplicate').length === 2, 'duplicate ID');
  expect(metrics('a\n'.repeat(10)).lines > 9, 'budget metric');
  if (failures.length) {
    console.error(`VALIDATOR_SELF_TEST FAIL ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log(`VALIDATOR_SELF_TEST PASS ${count}/${count}`);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  let result;
  try { result = runValidation(); }
  catch (error) {
    console.error(`HARNESS_VALIDATION FAIL fatal: ${error.message}`);
    process.exit(1);
  }
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`FAIL ${error}`);
    console.error(`HARNESS_VALIDATION FAIL checks=${result.checks} errors=${result.errors.length} warnings=${result.warnings.length}`);
    process.exit(1);
  }
  console.log(`HARNESS_VALIDATION PASS checks=${result.checks} warnings=${result.warnings.length}`);
}

module.exports = { collectIds, links, metrics, parseTomlSubset, runValidation,
  secretFindings, status: fileStatus, validatePitfalls };
