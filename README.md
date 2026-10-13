#  *wae* 

> **Status: Functional Prototype** - as the standard (default) + temporal durable (optional) mode , evolving for the sensitive sessions, with next focus on more reliability, security, and usability.

--- 

*wae* - a zero-config human-agent session anchor or flight recorder for terminal sessions. It records your session, strips terminal noise and secrets, and when you exit, a local open-weight model writes a short **Actions / Errors / State** note into any vault or folder you choose. Everything runs on your machine.

- **Instant exit.** Summarizes in the detached background,  prompt returns immediately.
- **Local only.** No ports opened; communicates with Ollama on 127.0.0.1. ollama(used for current demo)
- **Crash-tolerant capture.** Output is written to SQLite (WAL mode) in small batches, so after a crash or hard kill you should lose at most the last unflushed buffer (up to 1000 characters).
- **Context-safe.** The model never sees raw logs, only a filtered set of high-value lines.
- **Optional durability.** `wae --durable` hands the summary to a Temporal workflow that retries if Ollama is unavailable



## How it works

```
 wae <command>
      │
      ▼
 PTY wrapper ──► screen(mirrored instantly)
      │
      ▼  (1000-char buffer → filter → store)
 tokenFilter ──► SQLite (WAL)  ◄──── session_id is the only link between modules
                      │
   exit: prompt returns instantly
                      │
        detached fork ─┬─ default:   summarizer.js ──┐
                       └─ --durable: temporalClient.js ► Temporal ► temporalWorker.js
                                                       │
                          Ollama (127.0.0.1) ◄─────────┘
                                │
                  3-bullet Markdown note ► your output folder ► raw logs deleted
```


## Requirements

- **Node.js 18+**
- **Ollama** running locally with a model pulled (`ollama pull gemma3`)
- Native modules (`node-pty`, `better-sqlite3`) install prebuilt on common platforms. Elsewhere you need a C++ build toolchain.
- On Windows, use **Git Bash**.
- *Durable mode only:* the [Temporal CLI](https://docs.temporal.io/cli)



## Install

```bash
npm install -g github:divya-o/wae
wae --help
```

The wae command is now on your PATH. Requires Node.js 18+ and git. Add `--omit=optional` to skip the Temporal packages if not need durable mode.

Then pull a model for local summaries ( Ollama should be  running):

```bash
ollama pull gemma3
```

To update later, run the same install command again. To remove it: `npm uninstall -g wae`.


<details>
<summary>Developing or contributing</summary>

```bash
git clone https://github.com/divya-o/wae.git wae && cd wae
npm install
npm link             # puts your working copy on your PATH as `wae`
```

</details>




## Quick start

```bash
wae --set-output ~/Documents/summaries   # choose where notes are saved (any folder)
wae bash                                 # record a session; type commands, then exit
```


A few seconds after you exit, a note appears in your output folder:

```
wae-flight-log-<timestamp>_<id>.md
```


It contains : **Actions**, **Errors**, **State**. You can record any command, for ex- wae claude, wae git status or wae uv run app.py.

## Commands

- **`wae <command> [args...]`**: Records the command and summarizes its output when the command exits.
- **`wae --durable <command>`**: Runs the command and summarizes it using the Temporal worker. The `--durable` flag must appear **before** the command.
- **`wae --output`**: Displays the current output folder.
- **`wae --set-output [path]`**: Sets the output folder.
- **`wae --mcp`**: Starts the MCP server over standard input/output (stdio).
- **`wae --help`**: Displays usage instructions and available options.


## Configuration

- **Output folder** (~/.wae/summaries): Set via wae --set-output or WAE_OUTPUT_DIR.
- **WAE_MODEL** (gemma3): Any pulled Ollama model.
- **TEMPORAL_ADDRESS** (localhost:7233): Temporal server address; durable mode only.
- **WAE_TASK_QUEUE** (wae-summaries): Temporal task queue; durable mode only.

wae stores its own files in ~/.wae/: `wae_vault.db` (session logs until summarized), config.json (saved output folder) and summarizer.log (errors)


## What gets summarized

Filters terminal output before summarization, keeping up to 50 deduplicated lines (300 characters each) :

- **Environment changes:** npm install, pip install, uv run, etc
- **File changes:** Created, modified, or deleted.
- **Git activity:** commit, push, add, checkout
- **Errors:** Failures and non-zero exit statuses

If no matches are found, it uses the session's end part. API keys and password=/ secret= are redacted as `[REDACTED_SECURE_TOKEN]` before disk writes.



## Durable mode (Temporal)

Durable mode retries failed summaries up to 5 times with backoff in time of crashes. Each workflow uses the session ID to prevent duplicate summaries

```bash
temporal server start-dev --db-filename wae-temporal.db   # terminal 1
npm run worker                                            # terminal 2 (keep running)
wae --durable bash                                        # terminal 3
```

- **Monitor workflows:** Open http://localhost:8233.
- **Durable fallback:** If Temporal is unreachable, falls back after ~5 seconds and logs to ~/.wae/summarizer.log.
- **Output changes:** Restart the worker after changing the output folder.
- **Worker config:** Match WAE_MODEL and WAE_OUTPUT_DIR with your shell settings.



## MCP server

Lets an agent read its own recent summaries. It uses stdio only, with no ports.

```json
{ "mcpServers": { "wae": { "command": "wae", "args": ["--mcp"] } } }
```

Tool: `wae_recent_summaries` (optional `count`, 1 to 10) returns the latest notes from your output folder.


## Troubleshooting

- **No note:** Check `~/.wae/summarizer.log`; ensure Ollama is running and the model is pulled.
- **Wrong folder:** Check `wae --output` and `WAE_OUTPUT_DIR`.
- **Durable not installed:** Run `npm install` without `--omit=optional`.
- **Workflow stuck:** Start the worker with `npm run worker`.
- **Connection failed:** Run `temporal server start-dev`.

