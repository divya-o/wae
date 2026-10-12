import fs from 'fs';
import os from 'os';
import path from 'path';

const configDir = path.join(os.homedir(), '.wae');
const configFile = path.join(configDir, 'config.json');
const defaultOutputDir = path.join(configDir, 'summaries');

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
}

// Priority- WAE_OUTPUT_DIR env var > saved config > default.
export function resolveOutputDir() {
  return process.env.WAE_OUTPUT_DIR || readConfig().outputDir || defaultOutputDir;
}

export function setOutputDir(input) {
  const expanded = input.trim().replace(/^['"]|['"]$/g, '').replace(/^~(?=$|[\\/])/, os.homedir());
  const abs = path.resolve(expanded);
  fs.mkdirSync(abs, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify({ ...readConfig(), outputDir: abs }, null, 2));
  return abs;
}