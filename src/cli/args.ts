export interface AgentArgs {
  name: string;
  port?: number;
}

export function fail(message: string): never {
  throw new Error(message);
}

export function printHeader(message: string): void {
  console.log(`== ${message}`);
}

export function parseAgentArgs(rest: string[]): AgentArgs {
  let name: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--name' || token === '-n') {
      name = requireValue(token, rest[++i]);
      continue;
    }
    if (token === '--port' || token === '-p') {
      port = Number(requireValue(token, rest[++i]));
      continue;
    }
    if (token.startsWith('-')) fail(`unknown flag: ${token}`);
    if (name === undefined) {
      name = token;
      continue;
    }
    fail(`unexpected positional: ${token}`);
  }

  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) fail('invalid port');
  if (name !== undefined && !/^[a-zA-Z0-9._-]+$/.test(name)) fail('invalid agent name');
  return { name: name ?? process.env.FASTYCLAW_AGENT_NAME ?? 'fastyclaw', port };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) fail(`missing value for ${flag}`);
  return value;
}
