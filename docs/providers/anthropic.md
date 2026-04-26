# Anthropic

Anthropic's Claude models are available via the `@ai-sdk/anthropic` optional dependency.

## Install

```bash
npm install @ai-sdk/anthropic
```

## Configure

```bash
fastyclaw provider set anthropic \
  --model claude-sonnet-4-5 \
  --key apiKey=$ANTHROPIC_API_KEY
```

### Client SDK

```ts
await client.providers.set({
  provider: { id: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! },
  model: 'claude-sonnet-4-5',
});
```

## Models

`fastyclaw provider models anthropic` returns the live list. Common picks:

| Model | Notes |
|---|---|
| `claude-sonnet-4-5` | Default — strong balance of speed and capability |
| `claude-opus-4-7` | Most capable |
| `claude-haiku-4-5-20251001` | Fastest and cheapest |

## Extended thinking

Enable Claude's extended thinking mode:

```bash
fastyclaw provider option set anthropic thinking '{"type":"enabled","budgetTokens":10000}'
```

### Client SDK

```ts
await client.providers.setOptions('anthropic', {
  thinking: { type: 'enabled', budgetTokens: 10000 },
});
```

Disable:

```bash
fastyclaw provider option unset anthropic thinking
```

## Custom base URL

For Anthropic-compatible proxies:

```bash
fastyclaw provider set anthropic \
  --model claude-sonnet-4-5 \
  --key apiKey=$ANTHROPIC_API_KEY \
  --key baseURL=https://my-proxy.example.com/v1
```
