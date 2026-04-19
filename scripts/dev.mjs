import { spawn } from 'node:child_process';

const children = [
  spawn('tsc', ['--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn('tsc-alias', ['-w', '-f', '-fe', '.js'], {
    stdio: 'inherit',
  }),
];

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.once('exit', (code, signal) => {
    shutdown(signal ?? 'SIGTERM');
    process.exit(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
