# Browser tool

The `browser` tool gives the agent a full Playwright-controlled browser session. It can navigate to pages, click elements, fill forms, scroll, take screenshots, and extract content — all during an agent run.

## How it works

The browser is launched lazily on first use and kept alive for the duration of the server process. A persistent profile is stored at `~/.fastyclaw/browser-profile/` so cookies, local storage, and login sessions survive between runs.

By default it launches a visible Chrome window. To run headless:

```bash
FASTYCLAW_BROWSER_HEADLESS=true fastyclaw start
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `FASTYCLAW_BROWSER_CDP_URL` | — | Connect to an existing Chrome via CDP instead of launching one |
| `FASTYCLAW_BROWSER_CHANNEL` | `chrome` | Playwright browser channel (`chrome`, `chromium`, `msedge`, etc.) |
| `FASTYCLAW_BROWSER_HEADLESS` | `false` | Run headless |
| `FASTYCLAW_BROWSER_WIDTH` | `1280` | Viewport width in pixels |
| `FASTYCLAW_BROWSER_HEIGHT` | `720` | Viewport height in pixels |
| `FASTYCLAW_BROWSER_PROFILE` | `~/.fastyclaw/browser-profile` | Persistent profile directory |

### Connecting to an existing Chrome

If Chrome is already open on your machine, you can point fastyclaw at it via CDP:

1. Launch Chrome with `--remote-debugging-port=9222`.
2. Set `FASTYCLAW_BROWSER_CDP_URL=http://localhost:9222` before starting the server.

This lets the agent control the browser session you are already using, which is useful when you are already logged into sites.

## What the agent can do

The `browser` tool exposes a rich set of actions the agent can invoke:

| Action | Description |
|---|---|
| `navigate` | Go to a URL |
| `click` | Click an element by CSS selector or coordinate |
| `type` | Type text into an input |
| `fill` | Clear and fill a form field |
| `select` | Select an option from a `<select>` element |
| `scroll` | Scroll the page or an element |
| `evaluate` | Run arbitrary JavaScript and return the result |
| `content` | Extract the page's text content or outer HTML |
| `screenshot` | Take a screenshot (returned as an image to the model) |
| `waitFor` | Wait for an element, URL pattern, or network idle |
| `back` / `forward` | Navigate browser history |
| `close` | Close the current page |

In addition, the `screenshot` tool (separate from `browser`) takes a screenshot of the current browser page and sends it to the model as a vision input.

## Example prompts

```
"Go to https://news.ycombinator.com and summarise the top 5 stories."

"Log in to my Notion workspace at notion.so and create a new page titled 'Weekly Review'."

"Open the GitHub Actions tab for my repo and tell me which workflow failed last."

"Take a screenshot of the current state of the browser."
```

## Playwright install

Playwright needs a browser binary. On a fresh machine:

```bash
npx playwright install chrome
# or
npx playwright install chromium
```

If the binary is already installed (e.g. you have Chrome), Playwright will find it automatically when `FASTYCLAW_BROWSER_CHANNEL=chrome`.

## Sessions and the `browser` session type

In addition to direct tool calls, the agent has a concept of a **browser session** — a named browser context that can be opened and reused across multiple tool calls within a run. The `screenshot` tool always captures the currently active session.

Persistent sessions are stored in the browser profile directory, so logged-in state is available on subsequent runs.
