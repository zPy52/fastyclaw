# Ollama

Run models locally with [Ollama](https://ollama.ai). No API key required.

## Install

```bash
# Install Ollama from https://ollama.ai, then:
ollama pull llama3.1

npm install ollama-ai-provider
```

## Configure

```bash
fastyclaw provider set ollama \
  --model llama3.1 \
  --key baseURL=http://localhost:11434/api
```

If Ollama is on the default port you can omit `baseURL`:

```bash
fastyclaw provider set ollama --model llama3.1
```

### Client SDK

```ts
await client.providers.set({
  provider: {
    id: 'ollama',
    baseURL: 'http://localhost:11434/api',
  },
  model: 'llama3.1',
});
```

## List available models

```bash
fastyclaw provider models ollama
```

This calls the Ollama REST API and returns models currently pulled on your machine.

## Popular models

| Model | Pull command | Notes |
|---|---|---|
| `llama3.1` | `ollama pull llama3.1` | Good general-purpose default |
| `llama3.2` | `ollama pull llama3.2` | Smaller, faster |
| `qwen3` | `ollama pull qwen3` | Strong reasoning |
| `mistral` | `ollama pull mistral` | Fast instruction following |
| `codellama` | `ollama pull codellama` | Code-focused |
| `phi4` | `ollama pull phi4` | Microsoft Phi-4 |

## Provider options

Ollama-specific options go under the `ollama` namespace:

```bash
fastyclaw provider option set ollama numCtx 8192
```

### Client SDK

```ts
await client.providers.setOptions('ollama', { numCtx: 8192 });
```

## Remote Ollama

If Ollama runs on another machine on your network:

```bash
fastyclaw provider set ollama \
  --model llama3.1 \
  --key baseURL=http://192.168.1.50:11434/api
```
