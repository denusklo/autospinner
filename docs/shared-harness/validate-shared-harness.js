/*
Status: COMPLETE
Purpose: Detect drift between the shared repository policy and Codex/Claude adapters.
Readers: Codex, Claude Code, harness maintainers, and independent reviewers.
Source of truth: docs/shared-harness/REPOSITORY-POLICY.md.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXPECTED_ROOT = path.win32.normalize('C:\\Projects\\autospinner').toLowerCase();
const POLICY = 'docs/shared-harness/REPOSITORY-POLICY.md';
const MARKER = 'SHARED_POLICY_AUTHORITY=docs/shared-harness/REPOSITORY-POLICY.md';
const REQUIRED = [
  'AGENTS.md',
  'CLAUDE.md',
  POLICY,
  'docs/shared-harness/validate-shared-harness.js',
  'docs/codex-harness/00-README.md',
  'docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md',
  'docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md',
  'docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md',
  '.claude/harness/01-MODEL-DISPATCH.md',
  '.claude/harness/02-JUDGMENT-MATRIX.md',
  '.claude/harness/03-DELEGATION-TEMPLATES.md',
  '.claude/harness/04-KNOWLEDGE-PROTOCOL.md'
];
const CONSTANTS = [
  'SHARED_POLICY_VERSION=1',
  'SHARED_REPOSITORY_ROOT=C:\\Projects\\autospinner',
  'SHARED_RETRY_BUDGET=2_PER_CAPABILITY_TIER',
  'SHARED_RETRY_RESET=NO_RESET_FOR_SAME_PATCH_CHAIN',
  'SHARED_REVIEW=FRESH_READ_ONLY_FOR_ANY_WRITE',
  'SHARED_COMMIT_AUTHORITY=EXPLICIT_USER_ONLY',
  'SHARED_FACTS_LOADING=TARGETED_ONLY',
  'SHARED_PARALLEL_WRITES=PROHIBITED_BY_DEFAULT'
];
const SECRET_PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub-style token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
  ['bearer credential', /\bBearer\s+[A-Za-z0-9._~-]{24,}\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/]
];

function full(relative) {
  return path.join(ROOT, ...relative.split('/'));
}

function read(relative) {
  return fs.readFileSync(full(relative), 'utf8');
}

function count(text, literal) {
  return text.split(literal).length - 1;
}

function metrics(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: lines.length,
    maxLine: lines.reduce((value, line) => Math.max(value, line.length), 0)
  };
}

function localLinks(relative, text) {
  const links = [];
  const pattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|app:)/i.test(target) || target.startsWith('#')) continue;
    const hash = target.indexOf('#');
    if (hash >= 0) target = target.slice(0, hash);
    try { target = decodeURIComponent(target); }
    catch (_) { links.push({ source: match[1], error: 'invalid URL encoding' }); continue; }
    links.push({ source: match[1], resolved: path.resolve(path.dirname(full(relative)), target || '.') });
  }
  return links;
}

function activeLegacyViolations(files) {
  const violations = [];
  const rules = [
    ['.claude/harness/01-MODEL-DISPATCH.md', /changed symptom\s*=\s*a new subtask/i, 'changed symptom resets retry counter'],
    ['.claude/harness/01-MODEL-DISPATCH.md', /(?:single-file|small) changes?[^\r\n]*(?:20|\u2264\s*20)[^\r\n]*(?:skip|exempt)/i, 'small-change review exemption'],
    ['.claude/harness/02-JUDGMENT-MATRIX.md', /single-file changes?[^\r\n]*(?:20|\u2264\s*20)[^\r\n]*exempt/i, 'small-change completion exemption'],
    ['.claude/harness/02-JUDGMENT-MATRIX.md', /pitfalls?\s+(?:hit|go|->|\u2192)[^\r\n]*LESSONS\.md/i, 'undifferentiated pitfall routing to LESSONS'],
    ['.claude/harness/04-KNOWLEDGE-PROTOCOL.md', /must be an\s+\*\*independent commit\*\*/i, 'automatic harness commit authority'],
    ['CLAUDE.md', /before doing anything[^\r\n]*read[^\r\n]*PROJECT-FACTS\.md/i, 'wholesale facts loading'],
    ['.claude/harness/03-DELEGATION-TEMPLATES.md', /first read[^\r\n]*PROJECT-FACTS\.md/i, 'wholesale delegated facts loading']
  ];
  for (const [relative, pattern, label] of rules) {
    if (pattern.test(files.get(relative) || '')) violations.push(`${relative}: ${label}`);
  }
  return violations;
}

function validate() {
  const errors = [];
  let checks = 0;
  const check = (condition, message) => {
    checks += 1;
    if (!condition) errors.push(message);
  };

  check(path.win32.normalize(ROOT).toLowerCase() === EXPECTED_ROOT, `root mismatch: ${ROOT}`);
  const files = new Map();
  for (const relative of REQUIRED) {
    check(fs.existsSync(full(relative)), `missing required path ${relative}`);
    if (fs.existsSync(full(relative))) {
      const text = read(relative);
      files.set(relative, text);
      check(Buffer.byteLength(text, 'utf8') > 0, `empty required path ${relative}`);
    }
  }

  const policy = files.get(POLICY) || '';
  check(/\*\*Status:\*\* COMPLETE/.test(policy), `${POLICY}: status must be COMPLETE`);
  for (const literal of CONSTANTS) check(count(policy, literal) === 1, `${POLICY}: constant must appear once: ${literal}`);

  for (const router of ['AGENTS.md', 'CLAUDE.md']) {
    const text = files.get(router) || '';
    check(count(text, MARKER) === 1, `${router}: shared-policy marker must appear once`);
    check(/shared (?:repository )?policy/i.test(text) && /cross-runtime invariant/i.test(text), `${router}: shared-policy precedence missing`);
    check(/validate-shared-harness\.js/.test(text), `${router}: shared validator command missing`);
  }

  const codexDispatch = files.get('docs/codex-harness/02-MODEL-DISPATCH-PROTOCOL.md') || '';
  check(/RETRY_BUDGET\s*=\s*2 materially different repair attempts per capability tier/.test(codexDispatch), 'Codex retry budget drift');
  check(/regression caused by the same patch chain does not reset/i.test(codexDispatch), 'Codex retry reset drift');
  check(/TIER_A_CODEX_TARGET\s*=\s*gpt-5\.6-sol/.test(codexDispatch), 'Codex Tier A target drift');

  const claudeDispatch = files.get('.claude/harness/01-MODEL-DISPATCH.md') || '';
  check(/RETRY_BUDGET\s*=\s*2 materially different repair attempts per capability tier/.test(claudeDispatch), 'Claude retry budget mirror missing');
  check(/same patch chain does not reset/i.test(claudeDispatch), 'Claude retry reset mirror missing');
  check(/fresh-context/i.test(claudeDispatch) && /read-only/i.test(claudeDispatch), 'Claude fresh read-only review mirror missing');

  const claudeKnowledge = files.get('.claude/harness/04-KNOWLEDGE-PROTOCOL.md') || '';
  check(/commit[^\r\n]*explicit User request/i.test(claudeKnowledge), 'Claude commit authority mirror missing');
  check(/shared workflow pitfalls[^\r\n]*PITFALLS\.md/i.test(claudeKnowledge), 'Claude shared-pitfall routing missing');

  const claudeRouter = files.get('CLAUDE.md') || '';
  check(/targeted[^\r\n]*PROJECT-FACTS\.md/i.test(claudeRouter), 'CLAUDE.md targeted facts rule missing');
  const claudeTemplates = files.get('.claude/harness/03-DELEGATION-TEMPLATES.md') || '';
  check(/targeted[^\r\n]*PROJECT-FACTS\.md/i.test(claudeTemplates), 'Claude template targeted facts rule missing');
  const claudeMatrix = files.get('.claude/harness/02-JUDGMENT-MATRIX.md') || '';
  check(/application\/Claude history[^\r\n]*LESSONS\.md/i.test(claudeMatrix), 'Claude matrix application-history routing missing');
  check(/cross-runtime workflow pitfalls[^\r\n]*PITFALLS\.md/i.test(claudeMatrix), 'Claude matrix shared-pitfall routing missing');

  for (const violation of activeLegacyViolations(files)) errors.push(`active legacy conflict: ${violation}`);

  for (const relative of ['AGENTS.md', 'CLAUDE.md', POLICY, 'docs/codex-harness/00-README.md',
    'docs/codex-harness/05-KNOWLEDGE-ITERATION-PROTOCOL.md', '.claude/harness/01-MODEL-DISPATCH.md',
    '.claude/harness/02-JUDGMENT-MATRIX.md', '.claude/harness/03-DELEGATION-TEMPLATES.md',
    '.claude/harness/04-KNOWLEDGE-PROTOCOL.md']) {
    const text = files.get(relative) || '';
    const value = metrics(text);
    check(value.lines <= 450, `${relative}: ${value.lines} lines exceeds 450`);
    check(value.bytes <= 32 * 1024, `${relative}: ${value.bytes} bytes exceeds 32 KiB`);
    check(value.maxLine <= 500, `${relative}: maximum line ${value.maxLine} exceeds 500`);
    for (const link of localLinks(relative, text)) {
      if (link.error) errors.push(`${relative}: ${link.error} in ${link.source}`);
      else {
        const escaped = path.relative(ROOT, link.resolved);
        if (escaped.startsWith('..') || path.isAbsolute(escaped)) errors.push(`${relative}: local link escapes repository: ${link.source}`);
        else if (!fs.existsSync(link.resolved)) errors.push(`${relative}: missing local link ${link.source}`);
      }
    }
    for (const [label, pattern] of SECRET_PATTERNS) if (pattern.test(text)) errors.push(`${relative}: possible ${label}`);
  }

  return { checks, errors: [...new Set(errors)] };
}

function selfTest() {
  const failures = [];
  let checks = 0;
  const expect = (condition, label) => { checks += 1; if (!condition) failures.push(label); };
  expect(count('A TOKEN B TOKEN', 'TOKEN') === 2, 'literal count');
  expect(metrics('a\nb').lines === 2, 'line metrics');
  expect(activeLegacyViolations(new Map([
    ['.claude/harness/01-MODEL-DISPATCH.md', 'A changed symptom = a new subtask'],
    ['.claude/harness/02-JUDGMENT-MATRIX.md', ''],
    ['.claude/harness/04-KNOWLEDGE-PROTOCOL.md', ''],
    ['CLAUDE.md', ''],
    ['.claude/harness/03-DELEGATION-TEMPLATES.md', '']
  ])).length === 1, 'legacy retry reset detection');
  expect(activeLegacyViolations(new Map([
    ['.claude/harness/01-MODEL-DISPATCH.md', ''],
    ['.claude/harness/02-JUDGMENT-MATRIX.md', 'Single-file changes of \u226420 lines are exempt'],
    ['.claude/harness/04-KNOWLEDGE-PROTOCOL.md', ''],
    ['CLAUDE.md', ''],
    ['.claude/harness/03-DELEGATION-TEMPLATES.md', '']
  ])).length === 1, 'review exemption detection');
  expect(activeLegacyViolations(new Map([
    ['.claude/harness/01-MODEL-DISPATCH.md', ''],
    ['.claude/harness/02-JUDGMENT-MATRIX.md', 'pitfalls hit -> LESSONS.md'],
    ['.claude/harness/04-KNOWLEDGE-PROTOCOL.md', ''],
    ['CLAUDE.md', ''],
    ['.claude/harness/03-DELEGATION-TEMPLATES.md', '']
  ])).length === 1, 'undifferentiated pitfall routing detection');
  expect(SECRET_PATTERNS[1][1].test(`sk-${'A'.repeat(24)}`), 'secret detection');
  if (failures.length) {
    console.error(`SHARED_VALIDATOR_SELF_TEST FAIL ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log(`SHARED_VALIDATOR_SELF_TEST PASS ${checks}/${checks}`);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  let result;
  try { result = validate(); }
  catch (error) {
    console.error(`SHARED_HARNESS_VALIDATION FAIL fatal: ${error.message}`);
    process.exit(1);
  }
  if (result.errors.length) {
    for (const error of result.errors) console.error(`FAIL ${error}`);
    console.error(`SHARED_HARNESS_VALIDATION FAIL checks=${result.checks} errors=${result.errors.length}`);
    process.exit(1);
  }
  console.log(`SHARED_HARNESS_VALIDATION PASS checks=${result.checks}`);
}

module.exports = { activeLegacyViolations, count, localLinks, metrics, validate };
