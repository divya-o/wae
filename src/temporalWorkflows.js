import { proxyActivities } from '@temporalio/workflow';

const { loadSessionContext, generateSummary, writeNoteToDisk, purgeSession } = proxyActivities({
  startToCloseTimeout: '3 minutes',
  retry: { initialInterval: '2s', backoffCoefficient: 2, maximumAttempts: 5 }
});

export async function summarizeSession(sessionId) {
  const ctx = await loadSessionContext(sessionId);
  if (!ctx) return 'empty-session';

  const summary = await generateSummary(ctx.context, ctx.originCommand);
  const notePath = await writeNoteToDisk(sessionId, ctx.originCommand, summary);
  await purgeSession(sessionId); // only after the note is safely on disk
  return notePath;
}