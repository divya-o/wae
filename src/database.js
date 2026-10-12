import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { resolveOutputDir } from './config.js';

const dbDir = path.join(os.homedir(), '.wae');
fs.mkdirSync(dbDir, { recursive: true });

export const dbDirectory = dbDir;
export const outputDirectory = resolveOutputDir();
export const db = new Database(path.join(dbDir, 'wae_vault.db'));

//concurrency settings- writer (PTY) and the reader (summarizer) never block each other
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL') ;
db.pragma('busy_timeout= 5000');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      command TEXT
    );

    CREATE TABLE IF NOT EXISTS terminal_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      log_data TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_terminal_logs_session ON terminal_logs(session_id);
  `);
}

export function createSession(sessionId, command) {
  db.prepare('INSERT INTO sessions (id, command) VALUES (?, ?)').run(sessionId,command);
}

export function writeChunk(sessionId, cleanText) {
  if (!cleanText) return ;
  db.prepare('INSERT INTO terminal_logs (session_id, log_data) VALUES (?, ?)').run(sessionId, cleanText);
}
