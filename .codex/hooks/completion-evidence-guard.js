/*
Status: COMPLETE
Purpose: Require structurally complete evidence fields before explicit completion claims at the Stop event; it does not authenticate evidence.
Readers: Codex hook runtime, harness maintainers, and reviewers.
Source of truth: AGENTS.md section 13 and docs/codex-harness/03-JUDGMENT-EXTERNALIZATION-MATRIX.md.
Related: .codex/hooks/README.md and test-hooks.js.
*/
'use strict';

const ROOT_HEADINGS = ['Files changed', 'Verification', 'Independent review', 'Limitations'];
const SUBAGENT_HEADINGS = ['Summary', 'Evidence', 'Commands', 'Files changed', 'Unresolved risks', 'Recommended next action'];
const ALL_HEADINGS = ['Status', ...new Set([...ROOT_HEADINGS, ...SUBAGENT_HEADINGS])];

function stopBlock(reason, stopHookActive) {
  const message = `AUTOSPINNER_COMPLETION_GUARD: ${reason}. Corrective next step: use AGENTS.md section 13 or the dispatch protocol's exact PASS schema with observed evidence, obtain independent review where required, or downgrade the status to BLOCKED.`;
  if (stopHookActive) {
    return { continue: false, stopReason: message, systemMessage: message };
  }
  return { decision: 'block', reason: message };
}

function claimsCompletion(text) {
  return /^\s*Status:\s*(?:COMPLETE|PASS(?:\s+WITH\s+DOCUMENTED\s+LIMITATIONS)?)\s*$/im.test(text) ||
    /^\s*(?:Done|Completed|Implemented|Fixed|Finished)\b/im.test(text) ||
    /\b(?:I|we)\s+(?:have\s+)?(?:completed|implemented|fixed|finished|delivered)\b/i.test(text) ||
    /\bFinal\s+verdict:\s*PASS\b/i.test(text) ||
    /\b(?:this|the\s+(?:task|work|change|implementation|fix))\s+is\s+(?:complete|done|fixed)\b/i.test(text);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function section(text, heading) {
  const startPattern = new RegExp(`^\\s*${escapeRegex(heading)}:\\s*(.*)$`, 'im');
  const match = startPattern.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const remainder = text.slice(start);
  const nextPattern = new RegExp(`^\\s*(?:${ALL_HEADINGS.map(escapeRegex).join('|')}):\\s*`, 'im');
  const next = nextPattern.exec(remainder);
  return `${match[1]}\n${next ? remainder.slice(0, next.index) : remainder}`.trim();
}

function validateEvidence(text) {
  const missing = [];
  const statusMatch = text.match(/^\s*Status:\s*(PASS\s+WITH\s+DOCUMENTED\s+LIMITATIONS|COMPLETE|PASS)\s*$/im);
  if (!statusMatch) missing.push('Status: COMPLETE, PASS WITH DOCUMENTED LIMITATIONS, or subagent PASS');
  const status = statusMatch ? statusMatch[1].toUpperCase() : null;
  const required = status === 'PASS' ? SUBAGENT_HEADINGS : ROOT_HEADINGS;

  const parts = {};
  for (const heading of required) {
    parts[heading] = section(text, heading);
    if (!parts[heading]) missing.push(`${heading}: non-empty section`);
  }

  if (status === 'PASS') {
    if (parts.Summary) {
      const bullets = parts.Summary.split(/\r?\n/).filter(line => /^\s*-\s+\S/.test(line));
      if (bullets.length < 1 || bullets.length > 10) missing.push('Summary: 1 to 10 bullets');
    }
    if (parts.Commands) {
      if (!/^\s*-?\s*Command:\s*\S.+$/im.test(parts.Commands)) missing.push('Commands Command');
      if (!/^\s*Exit code:\s*-?\d+\s*$/im.test(parts.Commands)) missing.push('Commands Exit code');
      if (!/^\s*Result:\s*\S.+$/im.test(parts.Commands)) missing.push('Commands Result');
    }
    return [...new Set(missing)];
  }

  if (parts.Verification) {
    if (!/^\s*-?\s*Command:\s*\S.+$/im.test(parts.Verification)) missing.push('Verification Command');
    if (!/^\s*Exit code:\s*-?\d+\s*$/im.test(parts.Verification)) missing.push('Verification Exit code');
    if (!/^\s*Result:\s*\S.+$/im.test(parts.Verification)) missing.push('Verification Result');
  }

  let findings = null;
  if (parts['Independent review']) {
    const reviewer = parts['Independent review'].match(/^\s*-?\s*Reviewer:\s*(.+)$/im);
    if (!reviewer || /^(?:self|same|implementation agent|none|n\/a)$/i.test(reviewer[1].trim())) {
      missing.push('distinct Independent review Reviewer');
    }
    if (!/^\s*Verdict:\s*PASS\s*$/im.test(parts['Independent review'])) {
      missing.push('Independent review Verdict: PASS');
    }
    findings = parts['Independent review'].match(/^\s*Findings:\s*Critical\s+(\d+),\s*High\s+(\d+),\s*Medium\s+(\d+),\s*Low\s+(\d+)\s*$/im);
    if (!findings) missing.push('Independent review Findings counts');
    else if (Number(findings[1]) !== 0 || Number(findings[2]) !== 0) missing.push('zero Critical and High findings');
  }

  if (status && parts.Limitations) {
    const normalized = parts.Limitations.replace(/^\s*-\s*/gm, '').trim();
    const saysNone = /^(?:none|none\.)$/i.test(normalized);
    if (status === 'COMPLETE' && !saysNone) {
      missing.push('Status COMPLETE requires Limitations: none');
    }
    if (/PASS\s+WITH/i.test(status) && saysNone) {
      missing.push('documented limitations for limited pass');
    }
  }

  return [...new Set(missing)];
}

function evaluate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return stopBlock('hook input is not a JSON object', false);
  }
  if (payload.hook_event_name && payload.hook_event_name !== 'Stop') {
    return stopBlock('hook event does not match Stop', Boolean(payload.stop_hook_active));
  }
  if (typeof payload.last_assistant_message !== 'string') {
    return stopBlock('last assistant message is missing', Boolean(payload.stop_hook_active));
  }

  const text = payload.last_assistant_message;
  if (!claimsCompletion(text)) return null;

  const missing = validateEvidence(text);
  if (missing.length === 0) return null;
  return stopBlock(`completion claim is missing or violates: ${missing.join('; ')}`, Boolean(payload.stop_hook_active));
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
      result = stopBlock('hook input is invalid JSON', false);
    }
    if (result) process.stdout.write(JSON.stringify(result));
  });
}

if (require.main === module) run();

module.exports = { claimsCompletion, evaluate, section, stopBlock, validateEvidence };
