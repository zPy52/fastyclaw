#!/usr/bin/env node
import { FastyclawServer } from './server/index.js';

const [, , cmd] = process.argv;

if (cmd === 'start') {
  FastyclawServer.start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error('usage: fastyclaw start');
  process.exit(1);
}
