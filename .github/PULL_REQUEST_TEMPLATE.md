## Summary

Describe the user-facing change and the CLI, Electron, or backend surfaces it
affects.

## Changes

- Describe the main change.

## Validation

- [ ] `npm test`
- [ ] Relevant CLI or renderer flow was exercised manually
- [ ] Platform packaging was run if package contents changed

## Security and maintenance checklist

- [ ] User input is validated and subprocess arguments do not use shell interpolation
- [ ] Output paths and filenames remain bounded and sanitized
- [ ] `contextIsolation` remains enabled and `nodeIntegration` remains disabled
- [ ] Raw `ipcRenderer`, secrets, and auth tokens are not exposed to the renderer
- [ ] Download events remain aligned across core, CLI, IPC, renderer, and tests
- [ ] `preload.cjs` remains CommonJS
- [ ] `package.json` packaging lists and `CHANGELOG.md` were updated when needed

Assisted by [ai-ready](https://github.com/johnpapa/ai-ready)
