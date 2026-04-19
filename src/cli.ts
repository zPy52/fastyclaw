#!/usr/bin/env node
import { FastyclawServer } from '@/server/index';

const [, , cmd, portArg] = process.argv;

if (cmd === 'start') {
  let port: number | undefined;
  if (portArg !== undefined) {
    port = Number(portArg);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`invalid port: ${portArg}`);
      process.exit(1);
    }
  }
  FastyclawServer.start(port).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error('usage: fastyclaw start [port]');
  process.exit(1);
}
