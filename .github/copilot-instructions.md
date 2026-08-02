# Copilot Instructions

Read `AGENTS.md` before editing. This repository is an ESM Node.js/Electron
application with a CommonJS preload bridge and a shared playlist download
engine.

## Commands

Use the committed npm lockfile. The bundled `bin/yt-dlp` files are tracked, so
CI and agent setup use `npm ci --ignore-scripts` to avoid replacing binaries
during dependency installation.

```bash
npm ci --ignore-scripts
npm test
```

Packaging is platform-specific and heavier:

```bash
npm run build:linux
npm run build:win
```

## Security Boundaries

- Keep `contextIsolation: true` and `nodeIntegration: false`.
- Expose only narrow functions from `preload.cjs`; never expose raw
  `ipcRenderer`.
- Treat playlist URLs, titles, filenames, account data, and IPC payloads as
  untrusted.
- Pass subprocess inputs as argument arrays with `spawn`; never interpolate
  user input into shell command strings.
- Validate URLs in the Electron main process before invoking download logic.
- Bound output paths to the intended download directory after resolving them.
- Keep Stripe, JWT, and backend secrets outside the renderer, preload, source,
  logs, fixtures, and packaged application.
- Keep auth tokens in Electron `safeStorage`; do not substitute renderer
  storage.

## Architecture Rules

- `core-download.js` is shared by `main.js` and `queue-manager.js`; preserve its
  event callback contract.
- Electron IPC handlers live in `electron-main.js`, matching bridge functions
  in `preload.cjs` and callers/listeners in `renderer/renderer.js`.
- `preload.cjs` must remain CommonJS even though the rest of the project is ESM.
- Renderer changes stay framework-free in `renderer/index.html`,
  `renderer/renderer.js`, and `renderer/style.css`.
- If packaged source files or resources change, update the `build.files` or
  `build.extraResources` lists in `package.json`.
- Use `jest.unstable_mockModule` for ESM mocks and keep security regression
  tests explicit.

## Maintenance Matrix

| When changing | Also inspect and update |
| --- | --- |
| Download event or parsing | `core-download.js`, `main.js`, `queue-manager.js`, `electron-main.js`, `renderer/renderer.js`, Jest expectations |
| IPC channel | Handler in `electron-main.js`, bridge in `preload.cjs`, renderer caller/listener, validation, tests |
| URL or filesystem handling | Main-process validation, `core-download.js` spawn arguments and path bounds, security tests |
| Queue or plan limit | `queue-manager.js`, backend request contract, download IPC, renderer status, tests |
| Auth or billing flow | Backend contract, `electron-main.js`, `preload.cjs`, renderer UI, safe token storage; never package secrets |
| Renderer tab or status | `renderer/index.html`, `renderer/renderer.js`, `renderer/style.css`, preload API if IPC-backed |
| Bundled yt-dlp binaries | `bin/`, `scripts/download-ytdlp.mjs`, `package.json` resources, Linux executable handling |
| Packaged file | `package.json` `build.files`/`extraResources`, platform build commands, `CHANGELOG.md` |
| Dependency or command | `package.json`, `package-lock.json`, setup and CI workflows, `AGENTS.md`, `README.md` |
| Contributor guidance | `AGENTS.md`, this file, custom agents/skills/hooks, PR template, `README.md`, `CHANGELOG.md` |

## Existing Specialized Guidance

Use `.github/agents/feature-developer.agent.md` for feature work and
`.github/agents/test-security.agent.md` plus
`.github/skills/fix-known-vulnerabilities/SKILL.md` for the documented security
surfaces. Do not weaken their constraints.
