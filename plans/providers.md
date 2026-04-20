# providers

Replace the single-branch `SubmoduleAgentRuntimeProvider` with a registry-driven system that supports every Vercel AI SDK provider (official + community, including Codex CLI / Claude Code CLI) plus the Vercel AI Gateway, with per-provider factory settings and per-call `providerOptions` configurable through config file, HTTP, client SDK, and CLI.

---

## Dependency strategy

Only two packages ship as hard deps: `@ai-sdk/openai` (current default) and the gateway (built into `ai@^6`, no install). Everything else goes into `optionalDependencies` in `package.json`:

```jsonc
// package.json
"optionalDependencies": {
  "@ai-sdk/anthropic": "^2",
  "@ai-sdk/google": "^2",
  "@ai-sdk/google-vertex": "^2",
  "@ai-sdk/azure": "^2",
  "@ai-sdk/amazon-bedrock": "^2",
  "@ai-sdk/groq": "^2",
  "@ai-sdk/mistral": "^2",
  "@ai-sdk/xai": "^2",
  "@ai-sdk/deepseek": "^2",
  "@ai-sdk/perplexity": "^2",
  "@ai-sdk/cohere": "^2",
  "@ai-sdk/togetherai": "^2",
  "@ai-sdk/fireworks": "^2",
  "@ai-sdk/cerebras": "^2",
  "@ai-sdk/openai-compatible": "^2",
  "ai-sdk-provider-claude-code": "*",
  "ai-sdk-provider-codex-cli": "*",
  "ai-sdk-provider-gemini-cli": "*",
  "ollama-ai-provider": "*",
  "@openrouter/ai-sdk-provider": "*"
}
```

Each provider is loaded via `await import(pkg)` inside its factory. A missing package raises `ProviderNotInstalledError` with the exact `npm i <pkg>` hint. TypeScript uses `@ts-expect-error` on the dynamic imports (type-only references elsewhere use `import type`, guarded by `declare module` stubs under `src/types/optional-providers.d.ts` that re-export nothing unless the package is present).

---

## Config schema

Replace the flat `provider: 'openai'` field in `AppConfig` with a discriminated `ProviderConfig` and a freeform `providerOptions` bag forwarded verbatim to `streamText`.

```ts
// src/server/types.ts
export type ProviderId =
  | 'openai' | 'anthropic' | 'google' | 'google-vertex' | 'azure'
  | 'amazon-bedrock' | 'groq' | 'mistral' | 'xai' | 'deepseek'
  | 'perplexity' | 'cohere' | 'togetherai' | 'fireworks' | 'cerebras'
  | 'openai-compatible' | 'gateway'
  | 'claude-code' | 'codex-cli' | 'gemini-cli' | 'ollama' | 'openrouter';

export interface ProviderSettingsBase {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

export type ProviderConfig =
  | ({ id: 'openai' } & ProviderSettingsBase & { organization?: string; project?: string })
  | ({ id: 'anthropic' } & ProviderSettingsBase)
  | ({ id: 'google' } & ProviderSettingsBase)
  | ({ id: 'google-vertex' } & ProviderSettingsBase & { project: string; location: string })
  | ({ id: 'azure' } & ProviderSettingsBase & { resourceName: string; apiVersion?: string })
  | ({ id: 'amazon-bedrock' } & { region: string; accessKeyId?: string; secretAccessKey?: string; sessionToken?: string })
  | ({ id: 'groq' | 'mistral' | 'xai' | 'deepseek' | 'perplexity'
        | 'cohere' | 'togetherai' | 'fireworks' | 'cerebras' } & ProviderSettingsBase)
  | ({ id: 'openai-compatible' } & ProviderSettingsBase & { name: string })
  | ({ id: 'gateway' } & ProviderSettingsBase)
  | ({ id: 'claude-code' | 'codex-cli' | 'gemini-cli' } & { binPath?: string })
  | ({ id: 'ollama' } & ProviderSettingsBase)
  | ({ id: 'openrouter' } & ProviderSettingsBase);

export interface AppConfig {
  model: string;
  provider: ProviderConfig;
  providerOptions: Record<string, Record<string, unknown>>;  // forwarded as-is
  callOptions: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    seed?: number;
  };
  cwd: string;
  telegram: TelegramConfig;
}
```

Stored at `~/.fastyclaw/config.json`. `AppConfigStore.read()` migrates legacy `provider: 'openai'` strings into `{ id: 'openai' }`. `AppConfigStore.patch()` accepts deep-partials for `provider`, `providerOptions`, and `callOptions`; secrets in `apiKey`/`accessKeyId`/`secretAccessKey` are never returned by `GET /config` (masked `sk…last4`).

`providerOptions` keeps the same shape the AI SDK expects — e.g. `{ openai: { parallelToolCalls: false, reasoningEffort: 'high' }, anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } } }`. We store it as untyped JSON; consumers that want type safety import the SDK types (`OpenAILanguageModelResponsesOptions`, `AnthropicLanguageModelOptions`, etc.) in their own code.

---

## Provider factory map

```ts
// src/agent/provider/registry.ts
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from '@/server/types';

export interface ProviderAdapter {
  id: ProviderConfig['id'];
  create(cfg: ProviderConfig, model: string): Promise<LanguageModel>;
  pkg: string | null;   // optional dep name; null for built-in
  docsUrl: string;
}

export class SubmoduleAgentRuntimeProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();
  public register(a: ProviderAdapter): void;
  public get(id: string): ProviderAdapter | undefined;
  public list(): ProviderAdapter[];
}
```

```ts
// src/agent/provider/adapters/openai.ts
export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  pkg: '@ai-sdk/openai',
  docsUrl: 'https://ai-sdk.dev/providers/ai-sdk-providers/openai',
  async create(cfg, model) {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const { apiKey, baseURL, headers, organization, project } = cfg as Extract<ProviderConfig, { id: 'openai' }>;
    return createOpenAI({ apiKey, baseURL, headers, organization, project })(model);
  },
};
```

One adapter file per provider under `src/agent/provider/adapters/`. Registered in `SubmoduleAgentRuntimeProvider`:

```ts
// src/agent/provider/index.ts
export class SubmoduleAgentRuntimeProvider {
  public readonly registry = new SubmoduleAgentRuntimeProviderRegistry();
  public constructor() {
    this.registry.register(openaiAdapter);
    this.registry.register(anthropicAdapter);
    // ...all 20+ adapters
  }
  public async model(cfg: AppConfig): Promise<LanguageModel> {
    const adapter = this.registry.get(cfg.provider.id);
    if (!adapter) throw new Error(`Unknown provider: ${cfg.provider.id}`);
    try { return await adapter.create(cfg.provider, cfg.model); }
    catch (e: any) {
      if (e?.code === 'ERR_MODULE_NOT_FOUND' && adapter.pkg)
        throw new Error(`Provider '${adapter.id}' requires '${adapter.pkg}'. Run: npm i ${adapter.pkg}`);
      throw e;
    }
  }
}
```

Gateway adapter is special — uses the built-in `gateway` from `"ai"`; supports the `provider/model` slash syntax directly:

```ts
export const gatewayAdapter: ProviderAdapter = {
  id: 'gateway', pkg: null,
  docsUrl: 'https://ai-sdk.dev/docs/ai-sdk-core/provider-management',
  async create(cfg, model) {
    const { createGateway } = await import('ai');
    return createGateway({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, headers: cfg.headers })(model);
  },
};
```

Bedrock, Vertex, Azure, CLI providers each have the adapter field shape the research report documented (Bedrock passes all AWS fields explicitly even if `undefined`; Vertex requires `project` + `location`; Azure uses `resourceName` + deployment name as `model`; CLI providers take only optional `binPath`).

---

## Call-site wiring

```ts
// src/agent/loop.ts — replace the streamText call
const adapter = AgentRuntime.provider.registry.get(run.config.provider.id)!;
const model = await AgentRuntime.provider.model(run.config);

const result = streamText({
  model,
  system: AgentRuntime.prompt.build(run),
  messages: convertToModelMessages(run.thread.messages),
  tools: AgentTools.all(run),
  stopWhen: stepCountIs(Number.MAX_SAFE_INTEGER),
  abortSignal: run.abort.signal,
  ...run.config.callOptions,
  providerOptions: run.config.providerOptions,
});
```

`callOptions` fields are spread directly (SDK ignores undefined). `providerOptions` is passed verbatim — no validation; the SDK rejects unknown keys for the active provider.

---

## Auto-detection fallback

On `AppConfigStore.read()`, if the stored config has no explicit `provider.id` (fresh install, first run), resolve one from env in this order:

1. `AI_GATEWAY_API_KEY` → `{ id: 'gateway' }`, `model` defaults to `'openai/gpt-5.4-mini'`.
2. `ANTHROPIC_API_KEY` → `{ id: 'anthropic' }`, `model` defaults to `'claude-sonnet-4-5'`.
3. `GROQ_API_KEY` → `{ id: 'groq' }`, `model` defaults to `'llama-3.3-70b-versatile'`.
4. `GOOGLE_GENERATIVE_AI_API_KEY` → `{ id: 'google' }`, `model` `'gemini-2.5-pro'`.
5. Else `{ id: 'openai' }`, `model` `Const.defaultModel`.

The resolved config is written to disk on first boot. Subsequent runs use the persisted value; env changes do not override user-set config unless the user calls `POST /config/reset`.

---

## HTTP routes

Mounted by `SubmoduleFastyclawServerRoutes`:

| Method | Path                             | Body / response                                                                 |
|--------|----------------------------------|---------------------------------------------------------------------------------|
| GET    | `/config`                        | Returns `AppConfig` with all secrets masked.                                    |
| POST   | `/config`                        | Deep-partial patch of `model`, `provider`, `providerOptions`, `callOptions`, `cwd`. |
| POST   | `/config/reset`                  | Clears and re-runs auto-detection.                                              |
| GET    | `/providers`                     | `Array<{ id, pkg, installed: boolean, docsUrl }>` from `registry.list()`.       |
| GET    | `/providers/:id/models`          | Best-effort: returns `{ models: string[] }` when the provider exposes a `listModels` API; else `{ models: [], note: 'not supported' }`. |
| POST   | `/providers/:id/probe`           | Body `{ settings, model }`. Instantiates the adapter and runs a 1-token `generateText` to validate credentials. |

`/providers/:id/models` implementations (hand-curated, non-exhaustive): OpenAI → `GET /v1/models`; Anthropic → `GET /v1/models`; Groq → `GET /openai/v1/models`; Ollama → `GET /api/tags`; Gateway → hardcoded list from docs; everything else → `[]`.

---

## Client SDK

```ts
// client-sdk/src/providers.ts
export class FastyclawClientProviders {
  public constructor(private readonly baseUrl: string) {}
  public async list(): Promise<ProviderInfo[]>;
  public async models(id: ProviderId): Promise<string[]>;
  public async probe(id: ProviderId, settings: object, model: string): Promise<{ ok: boolean; error?: string }>;
}

// client-sdk/src/client.ts — extend existing methods
public async setProvider(provider: ProviderConfig): Promise<void>;        // replaces setProvider(name)
public async setProviderOptions(options: Record<string, Record<string, unknown>>): Promise<void>;
public async setCallOptions(options: AppConfig['callOptions']): Promise<void>;
public readonly providers = new FastyclawClientProviders(this.baseUrl);
```

Re-export `ProviderConfig`, `ProviderId`, `AppConfig['callOptions']` from `client-sdk/src/types.ts` (mirror of server types). Per-provider `providerOptions` types are **not** re-exported — consumers import them directly from `@ai-sdk/<provider>` to keep the SDK bundle small.

---

## CLI

Extend `src/cli.ts` with a `provider` subcommand group. Each subcommand hits the server HTTP endpoints:

```txt
fastyclaw provider list                                   # → GET /providers
fastyclaw provider set <id> [--model <m>] [--key k=v ...] # → POST /config { provider, model }
fastyclaw provider show                                   # → GET /config (provider + model masked)
fastyclaw provider models <id>                            # → GET /providers/:id/models
fastyclaw provider probe                                  # → POST /providers/:id/probe with current config
fastyclaw provider option set <provider> <key> <value>    # → POST /config { providerOptions: { [provider]: { [key]: value } } }
fastyclaw provider option unset <provider> <key>
fastyclaw call-option set <key> <value>                   # temperature, maxOutputTokens, etc.
fastyclaw call-option unset <key>
```

`--key` accepts repeated `k=v` pairs — parsed into the provider's `ProviderSettingsBase` fields (`apiKey`, `baseURL`, `headers.*`, plus provider-specific like `region`, `project`, `resourceName`). Values are JSON-parsed when they start with `{`, `[`, `true`, `false`, or a digit; otherwise treated as strings.

Examples:

```bash
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=sk-ant-...
fastyclaw provider set gateway --model openai/gpt-5.4-mini
fastyclaw provider set amazon-bedrock --key region=us-east-1 --key accessKeyId=... --key secretAccessKey=...
fastyclaw provider set openai-compatible --key name=lmstudio --key baseURL=http://localhost:1234/v1 --model qwen-3
fastyclaw provider set codex-cli --model gpt-5.1-codex
fastyclaw provider option set openai reasoningEffort high
fastyclaw provider option set anthropic 'thinking' '{"type":"enabled","budgetTokens":10000}'
fastyclaw call-option set temperature 0.2
```

---

## Workflow

1. Fresh install, user has `ANTHROPIC_API_KEY` in env. `fastyclaw start` boots; `AppConfigStore.read()` sees no persisted provider, runs auto-detect, writes `{ provider: { id: 'anthropic' }, model: 'claude-sonnet-4-5' }` to `~/.fastyclaw/config.json`.
2. User sends a message. `AgentRuntime.loop.run` calls `AgentRuntime.provider.model(run.config)`; the Anthropic adapter `await import('@ai-sdk/anthropic')`s and returns `createAnthropic({...})('claude-sonnet-4-5')`. If the package isn't installed, loop emits an SSE `error` event with the exact `npm i` hint.
3. User wants Groq instead: `fastyclaw provider set groq --model llama-3.3-70b-versatile --key apiKey=gsk_...`. The server patches config and subsequent turns use the Groq adapter.
4. User wants reasoning mode: `fastyclaw provider option set groq reasoningEffort high`. The next `streamText` call includes `providerOptions: { groq: { reasoningEffort: 'high' } }`.
5. User wants the gateway: `fastyclaw provider set gateway --model openai/gpt-5.4-mini --key apiKey=...`. The gateway adapter routes to Vercel; `providerOptions.openai` still applies per the AI Gateway contract.
6. User wants local Ollama: `fastyclaw provider set ollama --key baseURL=http://localhost:11434/api --model llama3.1`.

---

## Out of scope (v1)

- UI for editing config (the client SDK + CLI are the interface).
- Validating `providerOptions` against exported SDK types — stored as untyped JSON.
- Per-thread provider overrides — the active `AppConfig` applies to every run.
- Automated model-list discovery for providers without a `/models` endpoint.
- Cost tracking, usage telemetry, rate-limit handling.
- Key rotation, OS-keychain storage — secrets remain in `~/.fastyclaw/config.json`.
- Embedding, image, speech, transcription pipelines — `streamText` on a `LanguageModel` only.
