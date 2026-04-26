# OpenAI-compatible backends

The `openai-compatible` provider connects fastyclaw to any server that speaks the OpenAI chat completions API — LM Studio, Jan, vLLM, Llama.cpp, and many others.

## Install

```bash
npm install @ai-sdk/openai-compatible
```

## Configure

You must give the backend a short `name`. That name is used as the `providerOptions` namespace for any backend-specific options.

```bash
fastyclaw provider set openai-compatible \
  --key name=lmstudio \
  --key baseURL=http://localhost:1234/v1 \
  --model qwen-3
```

```bash
fastyclaw provider set openai-compatible \
  --key name=vllm \
  --key baseURL=http://localhost:8000/v1 \
  --key apiKey=none \
  --model meta-llama/Meta-Llama-3-8B-Instruct
```

### Client SDK

```ts
await client.providers.set({
  provider: {
    id: 'openai-compatible',
    name: 'lmstudio',
    baseURL: 'http://localhost:1234/v1',
  },
  model: 'qwen-3',
});
```

## Provider options

Use the configured `name` as the namespace. If the name contains hyphens, use the camelCased form:

```bash
# name=lmstudio → namespace lmstudio
fastyclaw provider option set lmstudio reasoningEffort high

# name=my-backend → namespace myBackend
fastyclaw provider option set myBackend textVerbosity minimal
```

### Client SDK

```ts
await client.providers.setOptions('lmstudio', { reasoningEffort: 'high' });
```

## Common setups

### LM Studio

1. Open LM Studio, load a model, and start the local server (default: `http://localhost:1234`).
2. Switch fastyclaw to it:

```bash
fastyclaw provider set openai-compatible \
  --key name=lmstudio \
  --key baseURL=http://localhost:1234/v1 \
  --model <model-name-from-lm-studio>
```

### Jan

1. Open Jan, go to Local API Server, and start it (default: `http://localhost:1337`).

```bash
fastyclaw provider set openai-compatible \
  --key name=jan \
  --key baseURL=http://localhost:1337/v1 \
  --model <model-id>
```

### vLLM

```bash
fastyclaw provider set openai-compatible \
  --key name=vllm \
  --key baseURL=http://localhost:8000/v1 \
  --key apiKey=none \
  --model meta-llama/Meta-Llama-3-8B-Instruct
```

## OpenRouter

OpenRouter is a hosted router over many providers. Use the dedicated `openrouter` provider ID instead:

```bash
npm install @openrouter/ai-sdk-provider

fastyclaw provider set openrouter \
  --model anthropic/claude-sonnet-4-5 \
  --key apiKey=$OPENROUTER_API_KEY
```

## AI Gateway

The built-in `gateway` provider (no extra package needed) works similarly for Vercel's AI Gateway:

```bash
fastyclaw provider set gateway \
  --model anthropic/claude-sonnet-4-5 \
  --key apiKey=$AI_GATEWAY_API_KEY
```

Use `provider/model` style IDs. Provider options go under the upstream provider name:

```bash
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
```
