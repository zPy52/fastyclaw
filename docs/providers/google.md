# Google (Gemini and Vertex)

Two providers cover Google's models: `google` for the Generative AI API (API key), and `google-vertex` for Vertex AI (GCP project).

## google — Generative AI API

### Install

```bash
npm install @ai-sdk/google
```

### Configure

```bash
fastyclaw provider set google \
  --model gemini-2.5-pro \
  --key apiKey=$GOOGLE_GENERATIVE_AI_API_KEY
```

### Client SDK

```ts
await client.providers.set({
  provider: { id: 'google', apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! },
  model: 'gemini-2.5-pro',
});
```

### Models

| Model | Notes |
|---|---|
| `gemini-2.5-pro` | Default — strongest Gemini model |
| `gemini-2.5-flash` | Faster, lower cost |
| `gemini-2.0-flash` | Previous generation flash |

### Provider options

```bash
fastyclaw provider option set google structuredOutputs true
fastyclaw provider option set google safetySettings '[{"category":"HARM_CATEGORY_HATE_SPEECH","threshold":"BLOCK_NONE"}]'
```

## google-vertex — Vertex AI

### Install

```bash
npm install @ai-sdk/google-vertex
```

### Configure

```bash
fastyclaw provider set google-vertex \
  --model gemini-2.5-pro \
  --key project=my-gcp-project \
  --key location=us-central1
```

Vertex uses Application Default Credentials. Make sure `gcloud auth application-default login` has been run, or that the `GOOGLE_APPLICATION_CREDENTIALS` env var points to a service account key.

### Client SDK

```ts
await client.providers.set({
  provider: {
    id: 'google-vertex',
    project: 'my-gcp-project',
    location: 'us-central1',
  },
  model: 'gemini-2.5-pro',
});
```
