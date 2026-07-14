---
name: fix-known-vulnerabilities
description: 'Fix the three pre-existing security vulnerabilities in core-download.js: command injection (CRITICAL), path traversal (MEDIUM), and missing URL validation (INFO). Use when: fixing security bugs, hardening shell command handling, addressing OWASP A01 broken access control, OWASP A03 injection, command injection, path traversal, URL validation, execAsync shell interpolation.'
argument-hint: 'Optionally specify which to fix: "injection", "traversal", or "url-validation" (default: all three)'
---

# Fix Known Vulnerabilities in `core-download.js`

All three issues are documented as `test.failing()` cases in `tests/core-download.test.js`. After applying fixes, those tests should be promoted to `test()`.

## Vulnerabilities

| #   | Severity | Location                    | Issue                                                                   |
| --- | -------- | --------------------------- | ----------------------------------------------------------------------- |
| 1   | CRITICAL | `core-download.js` ~line 33 | `link` interpolated into `execAsync` shell string → command injection   |
| 2   | MEDIUM   | `core-download.js` ~line 37 | `sanitizedName` strips `/\` but not `.` → `..` path traversal into `~/` |
| 3   | INFO     | `core-download.js` ~line 16 | No URL format validation before calling yt-dlp                          |

## Procedure

### Step 1 — Read current state

Read `cli-playlistdownloader/core-download.js` lines 1–70 to locate the exact lines before editing. Do not rely on approximate line numbers above.

### Step 2 — Fix #1: Command injection (CRITICAL)

**Root cause:** Playlist title and track count are fetched by interpolating `link` into a shell string passed to `exec` (a shell-spawning API). A URL containing shell metacharacters (e.g. `" && malicious_cmd`) executes arbitrary commands.

**Fix:** Replace both `execAsync(...)` calls with a `spawnAsync` helper that passes args as an array — the same pattern already used for the download step:

```js
// Add this helper near the top of the file (after imports)
function spawnAsync(bin, args) {
  return new Promise((resolve, reject) => {
    let out = '';
    const proc = spawn(bin, args);
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.on('close', (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`yt-dlp exited with code ${code}`)),
    );
    proc.on('error', reject);
  });
}
```

Replace the `execAsync` calls:

```js
// BEFORE (vulnerable)
const titleRaw = await execAsync(`"${ytdlpBin}" --get-title -- "${link}"`);
const idsRaw = await execAsync(
  `"${ytdlpBin}" --flat-playlist --print id -- "${link}"`,
);

// AFTER (safe — args as array, no shell)
const titleRaw = await spawnAsync(ytdlpBin, ['--get-title', '--', link]);
const idsRaw = await spawnAsync(ytdlpBin, [
  '--flat-playlist',
  '--print',
  'id',
  '--',
  link,
]);
```

You can remove the `execAsync` / `util.promisify(exec)` setup once both calls are replaced.

### Step 3 — Fix #2: Path traversal (MEDIUM)

**Root cause:** After stripping `/` and `\`, a playlist named `..` produces `~/Downloads/..` = `~/`, allowing writes outside the intended directory.

**Fix:** After building `outputPath`, assert it stays within `downloadsDir`:

```js
const sanitizedName = playlistTitle.replace(/[/\\]/g, '_');
const outputPath = path.join(downloadsDir, sanitizedName);

// Guard against traversal
const resolved = path.resolve(outputPath);
if (!resolved.startsWith(path.resolve(downloadsDir) + path.sep)) {
  onEvent({
    type: 'error',
    message: 'Invalid playlist name: path traversal detected',
  });
  return;
}
```

### Step 4 — Fix #3: URL validation (INFO)

**Root cause:** Any string, including local paths or shell metacharacters, is forwarded to yt-dlp without format checking.

**Fix:** Validate at the top of `DownloadPlaylist`, before any yt-dlp call:

```js
let parsedUrl;
try {
  parsedUrl = new URL(link);
} catch {
  onEvent({ type: 'error', message: 'Invalid URL' });
  return;
}
if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
  onEvent({ type: 'error', message: 'Only http and https URLs are supported' });
  return;
}
```

### Step 5 — Promote fixed tests

In `tests/core-download.test.js`, find each `test.failing(...)` case that covers the vulnerabilities you just fixed and change it to `test(...)`.

### Step 6 — Verify

```bash
cd cli-playlistdownloader && npm test
```

All previously-failing security tests should now pass. No existing tests should regress.
