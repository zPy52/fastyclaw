# Providers

fastyclaw can run against multiple Vercel AI SDK providers. If you only need the quick switch flow, start with [quickstart.md](quickstart.md); this page is the full reference for provider setup, model selection, and provider-specific options.

## Mental Model

- `provider` picks the backend.
- `model` picks the model on that backend.
- `providerOptions` is a namespaced JSON bag that fastyclaw forwards to `streamText` as-is.

The active config lives at `~/.fastyclaw/config.json`, but the usual way to manage it is through `fastyclaw provider ...`.

## Inspect

```bash
fastyclaw provider list
fastyclaw provider show
fastyclaw provider models <id>
fastyclaw provider probe
```

- `list` shows whether each provider package is installed and whether it is active.
- `show` prints the current config, with secrets masked.
- `models` only returns live ids for providers that implement model listing.
- `probe` sends a one-token request with the current credentials and model.

## First Boot

On a clean config, fastyclaw auto-detects the provider from env in this order:

1. `AI_GATEWAY_API_KEY` -> `gateway`, default model `openai/gpt-5.4-mini`
2. `ANTHROPIC_API_KEY` -> `anthropic`, default model `claude-sonnet-4-5`
3. `GROQ_API_KEY` -> `groq`, default model `llama-3.3-70b-versatile`
4. `GOOGLE_GENERATIVE_AI_API_KEY` -> `google`, default model `gemini-2.5-pro`
5. Otherwise `openai`, default model `gpt-5.4-mini`

That resolved config is written to disk on first boot. Later env changes do not replace the saved config unless you reset it through the API.

## Supported Providers

If `fastyclaw provider list` shows `installed: false`, install the package from the table and try again.

At the moment, `provider models` is implemented for OpenAI, Anthropic, Groq, and Ollama.

### API Providers

| Provider | Package | Configure it with | Model notes |
|---|---|---|---|
| `openai` | `@ai-sdk/openai` | `apiKey`; optional `organization`, `project`, `baseURL`, `headers` | Starter model: `gpt-5.4-mini`. Model listing is supported. |
| `anthropic` | `@ai-sdk/anthropic` | `apiKey`; optional `baseURL`, `headers` | Starter model: `claude-sonnet-4-5`. Model listing is supported. |
| `google` | `@ai-sdk/google` | `apiKey`; optional `baseURL`, `headers` | Starter model: `gemini-2.5-pro`. |
| `google-vertex` | `@ai-sdk/google-vertex` | `project`, `location`; optional `baseURL`, `headers` | Use a Vertex Gemini model id for your project. |
| `azure` | `@ai-sdk/azure` | `apiKey`, `resourceName`; optional `apiVersion`, `baseURL`, `headers` | `model` is your Azure deployment name. |
| `amazon-bedrock` | `@ai-sdk/amazon-bedrock` | `region`; optional `accessKeyId`, `secretAccessKey`, `sessionToken` | Use a Bedrock model id. |
| `groq` | `@ai-sdk/groq` | `apiKey`; optional `baseURL`, `headers` | Starter model: `llama-3.3-70b-versatile`. Model listing is supported. |
| `mistral` | `@ai-sdk/mistral` | `apiKey`; optional `baseURL`, `headers` | Use a Mistral model id. |
| `xai` | `@ai-sdk/xai` | `apiKey`; optional `baseURL`, `headers` | Use an xAI model id. |
| `deepseek` | `@ai-sdk/deepseek` | `apiKey`; optional `baseURL`, `headers` | Use a DeepSeek model id. |
| `perplexity` | `@ai-sdk/perplexity` | `apiKey`; optional `baseURL`, `headers` | Use a Perplexity model id. |
| `cohere` | `@ai-sdk/cohere` | `apiKey`; optional `baseURL`, `headers` | Use a Cohere model id. |
| `togetherai` | `@ai-sdk/togetherai` | `apiKey`; optional `baseURL`, `headers` | Use a Together AI model id. |
| `fireworks` | `@ai-sdk/fireworks` | `apiKey`; optional `baseURL`, `headers` | Use a Fireworks model id. |
| `cerebras` | `@ai-sdk/cerebras` | `apiKey`; optional `baseURL`, `headers` | Use a Cerebras model id. |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `name`; optional `apiKey`, `baseURL`, `headers` | Use the backend's model ids. `name` becomes the `providerOptions` namespace. |
| `gateway` | built into `ai` | `apiKey`; optional `baseURL`, `headers` | Use `provider/model` ids such as `anthropic/claude-sonnet-4-5`. |
| `openrouter` | `@openrouter/ai-sdk-provider` | `apiKey`; optional `baseURL`, `headers` | Use OpenRouter model ids. |

### CLI and Local Providers

| Provider | Package | Configure it with | Model notes |
|---|---|---|---|
| `claude-code` | `ai-sdk-provider-claude-code` | Optional `binPath` if the executable is not on `PATH` | Use a Claude Code CLI model id. |
| `codex-cli` | `ai-sdk-provider-codex-cli` | Optional `binPath` if the executable is not on `PATH` | Use a Codex CLI model id. |
| `gemini-cli` | `ai-sdk-provider-gemini-cli` | No adapter-specific keys required | Uses the package's current default auth flow. |
| `ollama` | `ollama-ai-provider` | Optional `baseURL`, `headers` | Local model names like `llama3.1`. Model listing is supported. |

## Common Setups

### OpenAI

```bash
fastyclaw provider set openai --model gpt-5.4-mini --key apiKey=$OPENAI_API_KEY
fastyclaw provider option set openai reasoningEffort high
```

### Anthropic

```bash
fastyclaw provider set anthropic --model claude-sonnet-4-5 --key apiKey=$ANTHROPIC_API_KEY
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
```

### Google and Vertex

```bash
fastyclaw provider set google --model gemini-2.5-pro --key apiKey=$GOOGLE_GENERATIVE_AI_API_KEY
fastyclaw provider set google-vertex --model gemini-2.5-pro --key project=my-project --key location=us-central1
```

### OpenAI-Compatible Backends

`openai-compatible` is for anything that speaks the OpenAI-style API. Set a human-readable `name`, point `baseURL` at your server, and then use that same `name` under `providerOptions`.
If the configured name contains hyphens, use the camelCased form under `providerOptions`, for example `provider-name` becomes `providerName`.

```bash
fastyclaw provider set openai-compatible \
  --key name=lmstudio \
  --key baseURL=http://localhost:1234/v1 \
  --model qwen-3

fastyclaw provider option set lmstudio reasoningEffort high
```

### AI Gateway

`gateway` is built into `ai`, so there is no package to install. Use the `provider/model` format for models, and keep provider-specific options under the upstream provider name.

```bash
fastyclaw provider set gateway --model anthropic/claude-sonnet-4-5 --key apiKey=$AI_GATEWAY_API_KEY
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":12000}'
```

### CLI Providers

`claude-code` and `codex-cli` can use `binPath` when the binary is not already on `PATH`. The currently installed `gemini-cli` package version uses its own default auth flow and does not expose a `binPath` setting through this adapter.

```bash
fastyclaw provider set codex-cli --model gpt-5.1-codex --key binPath=/opt/codex/bin/codex
fastyclaw provider set claude-code --model claude-sonnet-4-5 --key binPath=/usr/local/bin/claude
fastyclaw provider set gemini-cli --model gemini-2.5-pro
```

### Ollama

```bash
fastyclaw provider set ollama --model llama3.1 --key baseURL=http://localhost:11434/api
fastyclaw provider models ollama
```

## Provider Options

The provider options bag is passed through to the AI SDK without validation, so the namespace must match the provider you are targeting.

```bash
fastyclaw provider option set openai reasoningEffort high
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
fastyclaw provider option set google structuredOutputs true
fastyclaw provider option set lmstudio user user-123
```

- `openai` supports options such as `reasoningEffort` and `parallelToolCalls`.
- `anthropic` supports `thinking`.
- `google` supports options such as `cachedContent`, `structuredOutputs`, and `safetySettings`.
- `openai-compatible` uses the configured `name` as the namespace, and supports options such as `user`, `reasoningEffort`, `textVerbosity`, and `strictJsonSchema`.
- `gateway` uses the upstream provider name as the namespace, for example `anthropic` or `openai`.
- `ollama` forwards its own provider-specific options through the same `providerOptions.ollama` bucket.

If you need to remove an option, use `fastyclaw provider option unset <provider> <key>` or send `null` through the HTTP API.

## HTTP Shape

The CLI is just a thin wrapper around `POST /config`. A direct update looks like this:

```bash
curl -s -X POST http://127.0.0.1:5177/config \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": { "id": "anthropic", "apiKey": "sk-ant-..." },
    "model": "claude-sonnet-4-5",
    "providerOptions": {
      "anthropic": {
        "thinking": { "type": "enabled", "budgetTokens": 10000 }
      }
    }
  }'
```

The same shape works from the client SDK through `setProvider()` and `setProviderOptions()`.
