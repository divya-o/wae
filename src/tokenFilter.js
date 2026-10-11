// deterministic  stripping: ANSI control bytes, cursor moves, colors
const ANSI_PATTERN = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

// OSC sequences and stray control chars (keeps \n and \t).
const OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// local first privacy perimeter: provider keys + password-style assignments
const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9_-]{32,})|((?:password|passwd|secret)\s*[=:]\s*['"]?[^\s'"]+['"]?)/gi;

const REDACTED = '[REDACTED_SECURE_TOKEN]';

export function filterLogStream(rawText) {
  return rawText
    .replace(OSC_PATTERN, '')
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n') // spinner/progress redraws become separate lines for the scanner
    .replace(CONTROL_PATTERN, '')
    .replace(SECRET_PATTERN, REDACTED);
}
