#!/usr/bin/env node
import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnPTY } from './ptyWrapper.js';
import { initDB, createSession } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));                 //currently hardcoded path in use 

// Management flags owned by wae. They are stripped BEFORE the command
// reaches the shell wrapper so target binaries (uv, git, ...) never see them

const MANAGEMENT_FLAGS = new Set(['--mcp', '--help', '-h']);

function parseArgs(argv) {
  const flags= new Set();
  const command = [];
  for (const arg of argv) {
    if (command.length === 0 && MANAGEMENT_FLAGS.has(arg)) flags.add(arg);
    else command.push(arg);
  }
  return { flags, command };
}

function printUsage() {
  console.log(`
 WAE - human-agent session anchor

Usage:
  wae <command> [args...]    Record a session, e.g.  wae claude
  wae --mcp                  Start the stdio MCP server (no ports)

Env:
  WAE_VAULT   Obsidian vault folder   (default: ~/.wae/vault)
  WAE_MODEL   Ollama model name       (default: gemma3)
`);
}

async function main() {
  const { flags, command } = parseArgs(process.argv.slice(2));

  if (flags.has('--mcp')) {
    // stdio JSON-RPC only
    await import('./mcpServer.js');
    return;
  }

  if (flags.has('--help') || flags.has('-h') || command.length === 0) {     // --help cmds
    printUsage();
    return;
  }

  initDB();

  const sessionId =  `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createSession(sessionId, command.join(' '));
  console.log(` [wae] Flight recorder active (${sessionId})`);

  const exitCode = await spawnPTY(command[0], command.slice(1), sessionId);

  // onn detach worker
  const workerPath = path.resolve(__dirname, 'summarizer.js');
  const child = fork(workerPath, [sessionId], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();  //instant detach

  process.exit(exitCode ?? 0);
}

main().catch((err) => {
  console.error('[wae] Fatal error:', err.message);
  process.exit(1);
});
