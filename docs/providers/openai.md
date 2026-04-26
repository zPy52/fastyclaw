# OpenAI

OpenAI is the default provider. The `@ai-sdk/openai` package is bundled as a regular dependency, so no extra install is needed.

## Configure

```bash
fastyclaw provider set openai --model gpt-5.4-mini --key apiKey=$OPENAI_API_KEY
```

Optional keys:

```bash
fastyclaw provider set openai \
  --model gpt-5.4-mini \
  --key apiKey=$OPENAI_API_KEY \
  --key organization=org-... \
  --key project=proj-... \
  --key baseURL=https://api.openai.com/v1
```

### Client SDK

```ts
await client.providers.set({
  provider: {
    id: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    organization: 'org-...',   // optional
    project: 'proj-...',       // optional
  },
  model: 'gpt-5.4-mini',
});
```

## Models

`fastyclaw provider models openai` returns the live list from the API. Common picks:

| Model | Notes |
|---|---|
| `gpt-5.4-mini` | Default — fast and cheap |
| `gpt-5.4` | More capable, higher cost |
| `o4-mini` | Reasoning model |
| `o3` | Strongest reasoning |

## Provider options

```bash
fastyclaw provider option set openai reasoningEffort high
fastyclaw provider option set openai parallelToolCalls false
```

Supported namespaced options:

| Key | Values | Description |
|---|---|---|
| `reasoningEffort` | `low`, `medium`, `high` | Reasoning budget for o-series models |
| `parallelToolCalls` | `true` / `false` | Whether to allow parallel tool calls |

### Client SDK

```ts
await client.providers.setOptions('openai', {
  reasoningEffort: 'high',
  parallelToolCalls: false,
});
```

## Using OpenAI via the AI Gateway

If you want to route through a gateway instead of hitting OpenAI directly, use the `gateway` provider with an `openai/...` model ID. See [index.md](index.md).
