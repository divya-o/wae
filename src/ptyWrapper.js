import pty from 'node-pty';
import { filterLogStream } from './tokenFilter.js';
import { writeChunk } from './database.js';

const MAX_BUFFER = 1000; // hard RAM cap 
const MODE_SWITCH = /\x1b\[\?(?:9001|1004)[hl]/g;

export function spawnPTY(command, args, sessionId) {
  return new Promise((resolve, reject) => {
    let term;
    try {
      term = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: process.cwd(),
        env: process.env
      });
    } 
    catch (err) {
      reject(new Error(`Could not launch "${command}": ${err.message}`));
      return;
    }

    let buffer = '';

    //full buffer to storage and clear RAM immediataely Sanitize here before disk.
    const flush = () => {
      if (!buffer) return;
      const chunk = buffer;
      buffer = '';
      setImmediate(() => writeChunk(sessionId, filterLogStream(chunk)));
    };

    // zero -lag input
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    const onInput= (data) => term.write(data);
    process.stdin.on('data', onInput);

    const onResize = () => {
      try { term.resize(process.stdout.columns, process.stdout.rows); } catch { /* pty gone */ }
    };
    process.stdout.on('resize', onResize);

    // write only mirror
    term.onData((data) => {
      // process.stdout.write(data);
      process.stdout.write(
        data.includes('\x1b[?9001') || data.includes('\x1b[?1004') ? data.replace(MODE_SWITCH, '') : data
      );
      buffer += data;
      if (buffer.length > MAX_BUFFER) flush();
    });

    term.onExit(({ exitCode }) => {
      process.stdin.off('data', onInput);
      process.stdout.off('resize', onResize);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();

      // 
      if (process.stdout.isTTY) process.stdout.write('\x1b[?9001l\x1b[?1004l\x1b[?2004l\x1b[?25h');

      flush();
      // exit marker so the summarizer can spot non-zero exits
      setImmediate(() => writeChunk(sessionId, `\n[wae] exit status: ${exitCode}\n`));

      //run FIFO- means every write has done
      setImmediate(() => resolve(exitCode));
    });
  });
}
