import fs from 'fs';
import path from 'path';
import { db, dbDirectory, outputDirectory } from './database.js';

const sessionId = process.argv[2];
if (!sessionId) process.exit(1);

//local Ollama only.
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const MODEL = process.env.WAE_MODEL || 'gemma3';

const MAX_LINES = 50;      //context-window guard: max footprint lines
const MAX_LINE_CHARS = 300; //max characters per line

// context-window selection matrix -only structural footprints 
const FOOTPRINTS = [
  /\b(npm|pnpm)\s+(i|install|add|uninstall)\b|\byarn\s+add\b|\bpip3?\s+install\b|\buv\s+(run|pip|add|sync)\b/i, // env changes
  /created file|wrote to file|modified|updated file|deleted file|new file|\bwrite\(|\bedit\(/i,                // file mutations
  /\bgit\s+(commit|push|add|checkout|merge|rebase|reset)\b/i,                                                // version control
  /fatal error|exception|traceback|panic|\berror\b|\bfailed\b|cannot find|exit status:?\s*[1-9]/i              //crashes
];

function logFailure(message) {
  try {
    fs.appendFileSync(path.join(dbDirectory, 'summarizer.log'), `${new Date().toISOString()} ${sessionId} ${message}\n`);
  } 
  catch { /* nothing else to do */ }
}

function extractFootprints(rawData) {
  const seen = new Set();
  const picked = [];
  for (const line of rawData.split('\n')) {
    const text = line.trim();
    if (!text || seen.has(text)) continue; // drop repeated loop lines
    if (FOOTPRINTS.some((re) => re.test(text))) {
      seen.add(text);
      picked.push(text.slice(0, MAX_LINE_CHARS));
      if (picked.length >= MAX_LINES) break;
    }
  }
  return picked;
}

async function summarize() {
  const rows = db.prepare('SELECT log_data FROM terminal_logs WHERE session_id = ? ORDER BY id ASC').all(sessionId);
  const rawData = rows.map((r) => r.log_data).join('');
  const meta = db.prepare('SELECT command FROM sessions WHERE id = ?').get(sessionId);
  const originCommand = meta ? meta.command : 'Unknown session';

  if (!rawData.trim()) return;

  const footprints = extractFootprints(rawData);
  const context = footprints.length > 0
    ? footprints.join('\n')
    : `(No structural markers detected. Tail of session:)\n${rawData.slice(-1500)}`;

  const prompt = `You are an offline terminal flight-log compressor.
Command run: ${originCommand}

Execution footprints (filtered):
${context}

Write EXACTLY 3 bullets, each under 15 words, in this layout and nothing else:
- * ACTIONS: (file or environment changes made)
- * ERRORS: (problems hit, or "None")
-  * STATE: (final workspace status)`;

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const data = await response.json();
  const summary = (data.response || '').trim();
  if (!summary) throw new Error('Ollama returned an empty summary');

  fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, `wae-flight-log-${sessionId.replace(/^session_/, '')}.md`);
  const note = [
    `# wae session: \`${originCommand}\``,
    '',
    `- **Session ID:** \`${sessionId}\``,
    `- **Compiled:** ${new Date().toLocaleString()}`,
    '',
    '## Summary',
    summary,
    '',
    '---',
    '*Saved 100% locally by wae*',
    ''
  ].join('\n');
  await fs.promises.writeFile(target, note, 'utf8');

  //purges raw traces only after note safely on disk
  db.prepare('DELETE FROM terminal_logs WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

summarize()
  .catch((err) => logFailure(err.message)) // logs kept for retry
  .finally(() => process.exit(0));
