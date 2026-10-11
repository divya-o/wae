import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { vaultDirectory } from './database.js';

// stdio only
const server = new McpServer({ name: 'wae', version: '1.0.0' });

server.registerTool(
  'wae_recent_summaries',
  {
    description: 'Return the most recent wae session summaries (3-bullet notes) from the local vault',
    inputSchema: { count: z.number().int().min(1).max(10).optional() }
  },
  async ({ count }) => {
    const limit = count ?? 3;
    let notes = [];
    
    try{             
      notes = fs
        .readdirSync(vaultDirectory)
        .filter((f) => f.startsWith('wae-flight-log-') && f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, limit)
        .map((f) => `## ${f}\n${fs.readFileSync(path.join(vaultDirectory, f), 'utf8')}`);
    } 
    catch { /* vault does not exist yet */ }

    const text = notes.length > 0 ? notes.join('\n\n') : 'No wae summaries found yet.';
    return { content: [{ type: 'text', text }] };
  }
);

await server.connect(new StdioServerTransport());
