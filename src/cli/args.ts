export interface ServerArgs {
  port?: number;
}

export function fail(message: string): never {
  throw new Error(message);
}

export function printHeader(message: string): void {
  console.log(`== ${message}`);
}

export function parseServerArgs(rest: string[]): ServerArgs {
  let port: number | undefined;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--name' || token === '-n') {
      fail(`${token} is no longer supported`);
    }
    if (token === '--port' || token === '-p') {
      port = Number(requireValue(token, rest[++i]));
      continue;
    }
    if (token.startsWith('-')) fail(`unknown flag: ${token}`);
    fail(`unexpected positional: ${token}`);
  }

  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) fail('invalid port');
  return { port };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) fail(`missing value for ${flag}`);
  return value;
}
