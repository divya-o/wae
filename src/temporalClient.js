// Forked by `wae --durable`. Receives session_id as argv[2], starts the workflow, exits.
// If Temporal is unreachable or not installed, it falls back to the standard summarizer.
import fs from 'fs';
import path from 'path';
import { dbDirectory } from './database.js';

const sessionId = process.argv[2];
if (!sessionId) process.exit(1);

const ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
const TASK_QUEUE = process.env.WAE_TASK_QUEUE || 'wae-summaries';

function logFailure(message) {
  try {
    fs.appendFileSync(path.join(dbDirectory, 'summarizer.log'), `${new Date().toISOString()} ${sessionId} [durable] ${message}\n`);
  } catch { /* nothing else to do */ }
}

async function startWorkflow() {
  const { Connection, Client } = await import('@temporalio/client'); // optional dependency
  const connection = await Connection.connect({ address: ADDRESS, connectTimeout: '5s' });
  try {
    const client = new Client({ connection });
    // workflowId = session_id → starting twice for the same session is rejected, never duplicated.
    await client.workflow.start('summarizeSession', {
      workflowId: sessionId,
      taskQueue: TASK_QUEUE,
      args: [sessionId]
    });
  } finally {
    await connection.close();
  }
}

try {
  await startWorkflow();
  process.exit(0);
} catch (err) {
  if (err?.name === 'WorkflowExecutionAlreadyStartedError') process.exit(0);
  logFailure(`${err.message}; falling back to standard summarizer`);
  await import('./summarizer.js'); // same argv[2], runs and exits on its own
}