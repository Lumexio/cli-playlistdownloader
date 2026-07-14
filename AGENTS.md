# Playlist Downloader — Agent Instructions

Dual-mode Node.js/Electron app that downloads YouTube playlists as MP3 files using a bundled `yt-dlp` binary. Offers a CLI mode and an Electron desktop GUI sharing the same download engine.

## Build & Test Commands

| Command                  | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `npm start`              | Launch Electron GUI                                            |
| `npm run cli`            | Run CLI mode                                                   |
| `npm test`               | Run Jest test suite (uses `--experimental-vm-modules` for ESM) |
| `npm run build`          | Package for Linux (AppImage) + Windows (NSIS)                  |
| `npm run build:linux`    | AppImage only                                                  |
| `npm run build:win`      | NSIS installer only                                            |
| `npm run download-ytdlp` | Manually re-download yt-dlp binaries to `bin/`                 |

All commands run from `cli-playlistdownloader/`.

## Architecture

```
cli-playlistdownloader/
├── core-download.js      # Shared download engine — event-callback API, spawns yt-dlp
├── main.js               # CLI entry point — uses cli-progress bars
├── electron-main.js      # Electron main process — IPC handlers, window lifecycle, binary resolution
├── preload.cjs           # IPC bridge — contextBridge exposes window.api (must stay CommonJS)
├── renderer/             # GUI — plain HTML/CSS/JS, no framework
│   ├── index.html
│   ├── renderer.js
│   └── style.css
├── bin/                  # Bundled yt-dlp binaries (yt-dlp, yt-dlp.exe)
├── tests/                # Jest test suite
└── scripts/
    └── download-ytdlp.mjs  # Postinstall binary downloader
```

**`core-download.js`** is the shared engine used by both CLI and Electron. Its only export:

```js
DownloadPlaylist(link, onEvent, ytdlpBin);
```

It emits structured events via `onEvent(event)`:

| Event type    | Payload fields                              |
| ------------- | ------------------------------------------- |
| `init`        | `playlistName`, `totalTracks`, `outputPath` |
| `track-start` | `num`, `total`                              |
| `track-name`  | `name`                                      |
| `progress`    | `percent`                                   |
| `complete`    | `outputPath`                                |
| `error`       | `message`                                   |

## Module System

- `"type": "module"` — ESM throughout the project
- **Exception:** `preload.cjs` **must remain CommonJS** — Electron requires the preload script to be CJS. Do not convert it to ESM.
- Jest runs with `--experimental-vm-modules`; mock with `jest.unstable_mockModule` (not `jest.mock`)

## IPC Pattern (Electron)

```
Renderer (renderer.js)
  └─ window.api.startDownload(url)           [contextBridge]
       └─ ipcRenderer.invoke("start-download", url)
Main Process (electron-main.js)
  └─ ipcMain.handle("start-download", handler)
       └─ DownloadPlaylist(url, callback, ytdlpBin)
            └─ for each event: win.webContents.send("download-event", event)
Renderer (listening)
  └─ window.api.onDownloadEvent(callback)    [contextBridge]
```

- New IPC channels → `electron-main.js`
- New `window.api.*` methods → `preload.cjs`
- New renderer pages → add `<section id="...">` in `index.html`, logic in `renderer.js`

## Security Constraints

- `contextIsolation: true` and `nodeIntegration: false` — **never change these**
- Never expose raw `ipcRenderer` to the renderer — all IPC goes through `contextBridge`
- Never pass user-supplied input (URLs, names) to `exec()`/shell strings — use `spawn()` with args array
- Validate and sanitize `url` inputs in the main process before passing to `DownloadPlaylist`
- Stripe secret keys and JWT secrets must never reach the renderer or be bundled into the app — keep in local backend server only

## Binary Strategy

`yt-dlp` is bundled in `bin/` — no system dependency required. Resolution via `getYtDlpPath()` in `electron-main.js`:

- **Production (packaged):** `process.resourcesPath/bin/yt-dlp[.exe]`
- **Development:** `./bin/yt-dlp[.exe]`

On Linux, the main process ensures the binary has `0o755` permissions on `app-ready`.

## Design Tokens (Dark Theme)

Match the existing UI when adding or modifying renderer code:

| Variable       | Value     | Use                         |
| -------------- | --------- | --------------------------- |
| `--bg`         | `#0f1117` | Page background             |
| `--surface`    | `#1a1d27` | Card/section background     |
| `--border`     | `#2a2d3e` | Input borders               |
| `--text`       | `#e2e8f0` | Primary text                |
| `--text-muted` | `#64748b` | Secondary text              |
| `--accent`     | `#6c63ff` | Buttons, track progress bar |
| `--green`      | `#4ade80` | Overall progress bar        |
| `--radius`     | `10px`    | Border radius               |

Status banners use `.status.success`, `.status.error`, `.status.info` modifier classes.

## Specialized Agents

For complex tasks, load the relevant specialized agent:

- **Feature development** (new tabs, IPC handlers, membership plans, Stripe, auth, queue manager): [`.github/agents/feature-developer.agent.md`](.github/agents/feature-developer.agent.md)
- **Security audits & Jest tests** (command injection, path traversal, OWASP review, test coverage): [`.github/agents/test-security.agent.md`](.github/agents/test-security.agent.md)
