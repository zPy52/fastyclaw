# Providers

fastyclaw is built on the [Vercel AI SDK](https://sdk.vercel.ai) and inherits its full provider ecosystem. This page is the complete reference. For provider-specific setup details, see the dedicated pages linked in the table below.

## Mental model

- **provider** picks the backend (OpenAI, Anthropic, etc.)
- **model** picks the model on that backend
- **providerOptions** is a namespaced JSON bag forwarded to `streamText` as-is
- **callOptions** sets cross-provider options like `temperature` and `maxTokens`

The active config lives at `~/.fastyclaw/config.json`. The usual way to manage it is through the CLI or the client SDK — editing the file directly also works (restart the server after manual edits).

## Inspecting the current provider

```bash
fastyclaw provider list          # all providers, install status, active flag
fastyclaw provider show          # current config (secrets masked)
fastyclaw provider models <id>   # live model list (OpenAI, Anthropic, Groq, Ollama)
fastyclaw provider probe         # one-token test with current credentials
```

### Client SDK

```ts
const providers = await client.providers.list();
const models = await client.providers.listModels('openai');
await client.providers.probe();
```

## Switching provider

```bash
fastyclaw provider set <id> --model <model> --key <key>=<value> [--key ...]
```

Examples:

```bash
fastyclaw provider set openai --model gpt-5.4-mini --key apiKey=$OPENAI_API_KEY
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=$ANTHROPIC_API_KEY
fastyclaw provider set groq --model llama-3.3-70b-versatile --key apiKey=$GROQ_API_KEY
```

### Client SDK

```ts
await client.providers.set({
  provider: { id: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
  model: 'claude-sonnet-4-5',
});
```

## Provider options

Provider-specific options are forwarded to the AI SDK without validation. The namespace must match the provider ID (or the `name` you gave an `openai-compatible` backend):

```bash
fastyclaw provider option set openai reasoningEffort high
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
fastyclaw provider option set google structuredOutputs true
fastyclaw provider option unset openai reasoningEffort
```

### Client SDK

```ts
await client.providers.setOptions('anthropic', {
  thinking: { type: 'enabled', budgetTokens: 10000 },
});
await client.providers.unsetOption('openai', 'reasoningEffort');
```

## Auto-detection on first boot

When there is no saved config, fastyclaw checks env in this order:

| Priority | Env var | Provider | Default model |
|---|---|---|---|
| 1 | `AI_GATEWAY_API_KEY` | `gateway` | `openai/gpt-5.4-mini` |
| 2 | `ANTHROPIC_API_KEY` | `anthropic` | `claude-sonnet-4-5` |
| 3 | `GROQ_API_KEY` | `groq` | `llama-3.3-70b-versatile` |
| 4 | `GOOGLE_GENERATIVE_AI_API_KEY` | `google` | `gemini-2.5-pro` |
| 5 | _(fallback)_ | `openai` | `gpt-5.4-mini` |

The detected config is saved to disk. Later env changes do not override it unless you reset: `fastyclaw provider reset` or `POST /config/reset`.

## Supported providers

### API providers

| Provider ID | Package | Dedicated docs |
|---|---|---|
| `openai` | `@ai-sdk/openai` (bundled) | [openai.md](openai.md) |
| `anthropic` | `@ai-sdk/anthropic` | [anthropic.md](anthropic.md) |
| `google` | `@ai-sdk/google` | [google.md](google.md) |
| `google-vertex` | `@ai-sdk/google-vertex` | [google.md](google.md) |
| `azure` | `@ai-sdk/azure` | — |
| `amazon-bedrock` | `@ai-sdk/amazon-bedrock` | — |
| `groq` | `@ai-sdk/groq` | — |
| `mistral` | `@ai-sdk/mistral` | — |
| `xai` | `@ai-sdk/xai` | — |
| `deepseek` | `@ai-sdk/deepseek` | — |
| `perplexity` | `@ai-sdk/perplexity` | — |
| `cohere` | `@ai-sdk/cohere` | — |
| `togetherai` | `@ai-sdk/togetherai` | — |
| `fireworks` | `@ai-sdk/fireworks` | — |
| `cerebras` | `@ai-sdk/cerebras` | — |
| `openai-compatible` | `@ai-sdk/openai-compatible` | [openai-compatible.md](openai-compatible.md) |
| `gateway` | built into `ai` | — |
| `openrouter` | `@openrouter/ai-sdk-provider` | — |

### Local and CLI providers

| Provider ID | Package | Dedicated docs |
|---|---|---|
| `ollama` | `ollama-ai-provider` | [ollama.md](ollama.md) |
| `claude-code` | `ai-sdk-provider-claude-code` | — |
| `codex-cli` | `ai-sdk-provider-codex-cli` | — |
| `gemini-cli` | `ai-sdk-provider-gemini-cli` | — |

Optional provider packages are listed in `optionalDependencies` in `package.json`. If `fastyclaw provider list` shows `installed: false` for a provider you want to use, install its package and try again.

## HTTP

```bash
# List providers
curl -s http://127.0.0.1:5177/providers

# Switch
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": { "id": "anthropic", "apiKey": "sk-ant-..." },
    "model": "claude-sonnet-4-5"
  }'

# Probe
curl -s -X POST http://127.0.0.1:5177/providers/anthropic/probe

# List models
curl -s http://127.0.0.1:5177/providers/openai/models
```
