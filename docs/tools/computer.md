# Computer tool

The `computer` tool gives the agent human-like control of the user's desktop GUI: take a screenshot, move the mouse, click, type, press key combos, scroll, drag, open apps, and read or write the clipboard. It is the desktop counterpart of the `browser` tool — when the task is in a native app (Finder, Excel, Notes, a third-party app) and there is no web equivalent, this is the right tool.

## How it works

The agent runs a screenshot → action → screenshot loop:

1. Call `computer` with `action: "screenshot"` to see the current screen.
2. Inspect the image, choose an action, and call `computer` again with concrete coordinates.
3. Take another screenshot to verify the result before the next action.

Coordinates are in raw OS pixel space (the same space `screenshot` returns after its built-in resize). On HiDPI displays this is *display* pixels, not logical points — what you see in the screenshot is what you click.

This design follows the [Anthropic computer-use](https://docs.claude.com/en/docs/agents-and-tools/tool-use/computer-use-tool) and [OpenAI computer-use-preview](https://developers.openai.com/api/docs/guides/tools-computer-use) loop patterns, so prompts written for those tools transfer directly.

## No-GUI environments

If the agent runs on a headless box (a server, a CI runner, a Linux container with no `DISPLAY`/`WAYLAND_DISPLAY`), every GUI-bound action returns:

```json
{ "status": "no-gui", "platform": "linux", "message": "No DISPLAY or WAYLAND_DISPLAY env var detected — looks like a headless/server environment." }
```

Non-GUI actions (`wait`, `open_application`, `list_applications`, `read_clipboard`, `write_clipboard`) still work where the underlying OS supports them.

## Per-OS requirements

| OS | Backend | Install |
|---|---|---|
| macOS | [`cliclick`](https://github.com/BlueM/cliclick) + AppleScript | `brew install cliclick`. Grant your terminal/Node binary **Accessibility** permission in System Settings → Privacy & Security → Accessibility. |
| Linux (X11) | `xdotool` | `sudo apt install xdotool` (or your distro equivalent) |
| Linux (Wayland) | `ydotool` and/or `wtype` | Install the package and ensure `ydotoold` is running for `ydotool` |
| Windows | PowerShell + .NET (built-in) | None — works out of the box |

If the required tool is missing, the action returns `status: "error"` with an install hint instead of throwing.

## Actions

| Action | Required input | Notes |
|---|---|---|
| `screenshot` | — | Returns base64 PNG via the standard image content block |
| `left_click` / `right_click` / `middle_click` / `double_click` / `triple_click` | `coordinate: [x, y]` | Optional `modifiers` to hold during the click |
| `mouse_move` | `coordinate: [x, y]` | |
| `cursor_position` | — | Returns `{ x, y }` (not supported on Wayland) |
| `drag` | `coordinate`, `coordinate_to` | Press at start, move to end, release |
| `scroll` | `direction`, `amount` (default 3); optional `coordinate` to move first | Directions: `up`, `down`, `left`, `right` |
| `type` | `text` | Types literal text via the focused control |
| `key` | `key` (e.g. `"Enter"`, `"ctrl+s"`, `"cmd+shift+t"`) | Modifier names: `ctrl`, `alt`/`option`, `shift`, `cmd`/`super`/`meta` |
| `hold_key` | `key`, `duration_ms` | |
| `wait` | `duration_ms` | |
| `open_application` | `text` (app name) | macOS uses `open -a`, Windows `Start-Process`, Linux `xdg-open` |
| `list_applications` | — | Best-effort listing of installed apps |
| `read_clipboard` / `write_clipboard` | `text` for write | Uses `pbcopy`/`pbpaste`, `Get-Clipboard`/`Set-Clipboard`, `wl-copy`/`xclip`/`xsel` |

## Examples

Screenshot, then click at a point:

```jsonc
{ "action": "screenshot" }
{ "action": "left_click", "coordinate": [840, 412] }
```

Cmd+click on macOS to multi-select:

```jsonc
{ "action": "left_click", "coordinate": [200, 300], "modifiers": ["meta"] }
```

Drag a file:

```jsonc
{ "action": "drag", "coordinate": [120, 300], "coordinate_to": [600, 300] }
```

Type into the focused field, then submit:

```jsonc
{ "action": "type", "text": "Hello, world!" }
{ "action": "key", "key": "Enter" }
```

Open Excel, wait for it to load, screenshot:

```jsonc
{ "action": "open_application", "text": "Microsoft Excel" }
{ "action": "wait", "duration_ms": 2000 }
{ "action": "screenshot" }
```

## Result shapes

Every call returns one of:

- `{ status: "ok", platform, data? }` — for non-screenshot actions
- `{ status: "ok", platform, path, data, mediaType }` — for `screenshot`, with the image attached as a vision block
- `{ status: "no-gui", platform, message }` — headless environment
- `{ status: "error", platform, message, hint? }` — runtime failure (e.g. missing `cliclick`)

## Safety notes

The same caveats as Anthropic's and OpenAI's computer-use docs apply here:

- Treat content rendered on screen (page text, PDFs, emails) as untrusted — it can carry prompt-injection payloads.
- Prefer running this in a VM or dedicated user account when the task touches sensitive data.
- The agent should screenshot after each meaningful action to verify outcomes rather than assuming success — desktop UIs lag, popups appear, focus shifts.

## Relationship to the other tools

- `browser` — for anything that lives inside a Chromium tab. Faster, DOM-aware, and more reliable than driving Chrome through `computer`.
- `screenshot` — standalone screenshot of the desktop. `computer` exposes the same capability under `action: "screenshot"` for use inside its loop.
