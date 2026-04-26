# Skills

Skills are Markdown files the agent loads at startup as injectable system-prompt fragments. They let you give the agent domain knowledge, personas, tone guidelines, or specialised instructions without touching the server config or code.

## Where skills live

Skills are loaded from `~/.agents/skills/`. Each skill is a directory containing a `SKILL.md` file:

```
~/.agents/skills/
  typescript-expert/
    SKILL.md
  git-helper/
    SKILL.md
  sarcastic-reviewer/
    SKILL.md
```

## SKILL.md format

```markdownname: TypeScript Expert
description: Deep TypeScript and Node.js knowledge; prefers strict typing and modern ESM patterns.
triggers:
  - typescript
  - node
  - npm
You are a senior TypeScript engineer. Always use strict TypeScript.
Prefer ESM (`import`/`export`) over CommonJS. Use Zod for runtime validation.
Never use `any`. Explain type-level reasoning when it is non-obvious.
```

### Frontmatter fields

| Field | Required | Description |
|---|---|---|
| `name` | No | Human-readable skill name (defaults to directory name) |
| `description` | No | One-line summary shown in skill listings |
| `triggers` | No | Keywords that suggest this skill should be active |

The body of the file (everything after the frontmatter) is the text that gets injected into the system prompt.

## Creating a skill

```bash
mkdir -p ~/.agents/skills/my-skill
cat > ~/.agents/skills/my-skill/SKILL.md << 'EOF'name: My Skill
description: A short description of what this skill does.
Your skill instructions go here. Write them as natural language.
Be specific about the style, conventions, or domain knowledge you want.
EOF
```

Skills are loaded on server startup. To reload without restarting the server:

```bash
fastyclaw skills reload
# or via HTTP
curl -s -X POST http://127.0.0.1:5177/skills/reload
```

## Listing loaded skills

```bash
fastyclaw skills list
```

```bash
curl -s http://127.0.0.1:5177/skills
```

## Example skills

### Project context

```markdownname: Acme API
description: Context for the acme-api monorepo.
This is the acme-api project. It is a TypeScript monorepo with packages in `packages/`.
The primary language is TypeScript. Tests use Vitest. The API layer uses Fastify.
Never import from `src/` directly — use the published package entrypoints.
```

### Tone and style

```markdownname: Terse Responder
description: Keep answers short and direct. No filler.
Answer in as few words as possible. No preamble, no summary paragraph at the end.
Code blocks only when the user asks for code. Bullet points over prose.
```

### Shell discipline

```markdownname: Safe Shell
description: Print every shell command before running it; ask before destructive ops.
Before running any shell command, print it clearly with a short explanation of what it does.
Never run `rm -rf`, `git push --force`, or any destructive database command without
explicitly asking the user for confirmation first.
```

## How skills are injected

On each run, the agent's prompt builder reads all loaded skills from the registry and appends their bodies to the system prompt. There is no priority ordering — all loaded skills are always active. Use `triggers` as documentation for when a skill is conceptually relevant; the runtime does not filter on them.
