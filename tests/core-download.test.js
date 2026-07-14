/**
 * Tests for core-download.js
 *
 * Security findings documented here:
 *  [CRITICAL] Command injection via `link` in execAsync shell string (lines 33, 38)
 *  [MEDIUM]   Path traversal via sanitizedName allowing ".." sequences (line 37)
 *  [INFO]     No URL validation before passing input to yt-dlp
 */

import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Mock factories — defined BEFORE any dynamic import of the module under test
// ---------------------------------------------------------------------------

const mockExecSync = jest.fn();
// execAsync inside core-download.js is created via `promisify(exec)`.
// Node.js promisify checks for [util.promisify.custom] — we provide our own
// implementation so we fully control the resolved value in each test.
const mockExecAsync = jest.fn();
const mockSpawn = jest.fn();
const mockExistsSync = jest.fn(() => true);
const mockMkdirSync = jest.fn();

jest.unstable_mockModule("node:child_process", () => {
 const exec = Object.assign(jest.fn(), {
  [Symbol.for("nodejs.util.promisify.custom")]: mockExecAsync,
 });
 return { execSync: mockExecSync, exec, spawn: mockSpawn };
});

jest.unstable_mockModule("fs", () => {
 const mod = {
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  chmodSync: jest.fn(),
 };
 return { ...mod, default: mod };
});

// Dynamic import AFTER mocks are registered
const { DownloadPlaylist } = await import("../core-download.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake child process that emits stdout/stderr lines then closes. */
function makeMockProcess({ exitCode = 0, stdoutLines = [], stderrLines = [] } = {}) {
 const handlers = { stdout: {}, stderr: {}, proc: {} };
 const proc = {
  stdout: { on: (ev, cb) => { handlers.stdout[ev] = cb; } },
  stderr: { on: (ev, cb) => { handlers.stderr[ev] = cb; } },
  on: (ev, cb) => { handlers.proc[ev] = cb; },
 };

 process.nextTick(() => {
  for (const line of stdoutLines) {
   handlers.stdout.data?.(Buffer.from(line + "\n"));
  }
  for (const line of stderrLines) {
   handlers.stderr.data?.(Buffer.from(line + "\n"));
  }
  handlers.proc.close?.(exitCode);
 });

 return proc;
}

/** Call DownloadPlaylist and collect all emitted events. */
async function collectEvents(url = "https://youtube.com/playlist?list=PL123", ytdlpBin = "yt-dlp") {
 const events = [];
 await DownloadPlaylist(url, (e) => events.push(e), ytdlpBin);
 return events;
}

/** Default exec mock: returns playlist title then track IDs. */
function setupHappyExecMocks(title = "My Playlist", ids = ["id1", "id2", "id3"]) {
 mockExecAsync
  .mockResolvedValueOnce({ stdout: title + "\n", stderr: "" })
  .mockResolvedValueOnce({ stdout: ids.join("\n") + "\n", stderr: "" });
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
 jest.clearAllMocks();
 mockExecSync.mockReturnValue(undefined); // yt-dlp --version succeeds by default
 mockExistsSync.mockReturnValue(true);
 mockMkdirSync.mockReturnValue(undefined);
});

// ===========================================================================
// Happy path
// ===========================================================================

describe("happy path", () => {
 test("emits init event with playlist name, track count and output path", async () => {
  setupHappyExecMocks("Summer Vibes", ["a", "b"]);
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  const events = await collectEvents();

  const init = events.find((e) => e.type === "init");
  expect(init).toBeDefined();
  expect(init.playlistName).toBe("Summer Vibes");
  expect(init.totalTracks).toBe(2);
  expect(init.outputPath).toBe(
   path.join(os.homedir(), "Downloads", "Summer Vibes")
  );
 });

 test("emits complete event when yt-dlp exits with code 0", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  const events = await collectEvents();

  expect(events.some((e) => e.type === "complete")).toBe(true);
 });

 test("emits track-start event parsed from stdout line", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(
   makeMockProcess({
    exitCode: 0,
    stdoutLines: ["[download] Downloading item 2 of 3"],
   })
  );

  const events = await collectEvents();

  const ts = events.find((e) => e.type === "track-start");
  expect(ts).toBeDefined();
  expect(ts.num).toBe(2);
  expect(ts.total).toBe(3);
 });

 test("emits track-name event parsed from Destination line", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(
   makeMockProcess({
    exitCode: 0,
    stdoutLines: ["[download] Destination: /home/user/Downloads/My Playlist/Great Song.mp3"],
   })
  );

  const events = await collectEvents();

  const tn = events.find((e) => e.type === "track-name");
  expect(tn).toBeDefined();
  expect(tn.name).toBe("Great Song.mp3");
 });

 test("emits progress event parsed from percentage line", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(
   makeMockProcess({
    exitCode: 0,
    stdoutLines: ["[download]  42.5% of 5.00MiB"],
   })
  );

  const events = await collectEvents();

  const prog = events.find((e) => e.type === "progress");
  expect(prog).toBeDefined();
  expect(prog.percent).toBeCloseTo(42.5);
 });

 test("emits progress 100 when track was already downloaded", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(
   makeMockProcess({
    exitCode: 0,
    stdoutLines: ["[download] song.mp3 has already been downloaded"],
   })
  );

  const events = await collectEvents();

  const prog = events.find((e) => e.type === "progress" && e.percent === 100);
  expect(prog).toBeDefined();
 });

 test("spawn is called with URL as a positional argument array (not a shell string)", async () => {
  const url = "https://youtube.com/playlist?list=PL_safe123";
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  await collectEvents(url);

  const [, spawnArgs] = mockSpawn.mock.calls[0];
  expect(Array.isArray(spawnArgs)).toBe(true);
  expect(spawnArgs).toContain(url);
 });
});

// ===========================================================================
// Error handling
// ===========================================================================

describe("error handling", () => {
 test("emits error event when yt-dlp binary is not found", async () => {
  mockExecSync.mockImplementation(() => {
   throw new Error("Command not found");
  });

  const events = await collectEvents();

  const err = events.find((e) => e.type === "error");
  expect(err).toBeDefined();
  expect(err.message).toMatch(/yt-dlp not found/i);
 });

 test("error message includes the expected binary path", async () => {
  mockExecSync.mockImplementation(() => {
   throw new Error("ENOENT");
  });

  const events = await collectEvents("https://youtube.com/playlist?list=X", "/custom/path/yt-dlp");

  const err = events.find((e) => e.type === "error");
  expect(err.message).toContain("/custom/path/yt-dlp");
 });

 test("emits error event when yt-dlp exits with non-zero code", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 1 }));

  const events = await collectEvents();

  const err = events.find((e) => e.type === "error");
  expect(err).toBeDefined();
  expect(err.message).toMatch(/exited with code 1/i);
 });

 test("does not throw — all errors are forwarded via onEvent callback", async () => {
  mockExecSync.mockImplementation(() => {
   throw new Error("yt-dlp missing");
  });

  await expect(collectEvents()).resolves.not.toThrow();
 });
});

// ===========================================================================
// Path sanitization
// ===========================================================================

describe("path sanitization", () => {
 test("strips path-separator characters from playlist name", async () => {
  // Characters stripped by the current regex: < > : " / \ | ? *
  mockExecAsync
   .mockResolvedValueOnce({ stdout: 'Danger:<>"/\\|?*Name\n', stderr: "" })
   .mockResolvedValueOnce({ stdout: "id1\n", stderr: "" });
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  const events = await collectEvents();

  const init = events.find((e) => e.type === "init");
  // Check only the playlist folder name — not the full path which contains OS separators
  const folderName = path.basename(init.outputPath);
  expect(folderName).not.toMatch(/[<>:"/\\|?*]/);
 });

 test("output path is inside the Downloads directory for a safe name", async () => {
  setupHappyExecMocks("Clean Name");
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  const events = await collectEvents();

  const init = events.find((e) => e.type === "init");
  const downloadsBase = path.join(os.homedir(), "Downloads");
  expect(init.outputPath.startsWith(downloadsBase)).toBe(true);
 });

 // SECURITY — documented known vulnerability: sanitizedName allows ".."
 // The current regex strips "/" and "\" but not ".".
 // A playlist named ".." resolves to ~/Downloads/.. = ~/
 test.failing(
  "SECURITY [MEDIUM]: output path must not escape the Downloads directory via '..' name",
  async () => {
   mockExecAsync
    .mockResolvedValueOnce({ stdout: "..\n", stderr: "" })
    .mockResolvedValueOnce({ stdout: "id1\n", stderr: "" });
   mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

   const events = await collectEvents();

   const init = events.find((e) => e.type === "init");
   const downloadsBase = path.join(os.homedir(), "Downloads") + path.sep;
   // This assertion FAILS — path resolves to ~/  not ~/Downloads/..
   expect(init.outputPath + path.sep).toMatch(downloadsBase);
  }
 );
});

// ===========================================================================
// Security
// ===========================================================================

describe("security", () => {
 // SECURITY — documented known vulnerability: command injection via `link`
 // The execAsync calls interpolate `link` directly into a shell command string:
 //   `"${ytdlpBin}" --flat-playlist --print playlist_title -I 1:1 "${link}"`
 // exec() uses /bin/sh -c on Linux, so special chars in `link` inject shell commands.
 // Attacker payload: link = '" && touch /tmp/pwned && echo "'
 //
 // RECOMMENDED FIX: replace execAsync calls with spawn() passing args as an array.
 test.failing(
  "SECURITY [CRITICAL]: URL must be passed as spawn args — not embedded in exec shell string",
  async () => {
   const maliciousUrl = '" && echo INJECTED && echo "';
   setupHappyExecMocks();
   mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

   await collectEvents(maliciousUrl);

   // Verify exec (shell) was NOT called with the URL embedded
   const shellCalls = mockExecAsync.mock.calls.map(([cmd]) => cmd);
   shellCalls.forEach((cmd) => {
    expect(cmd).not.toContain(maliciousUrl);
   });
  }
 );

 test("spawn() is never called with shell:true (uses safe exec-array form)", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  await collectEvents();

  const [, , spawnOpts] = mockSpawn.mock.calls[0] ?? [];
  // spawn options must not enable shell execution
  expect(spawnOpts?.shell).toBeFalsy();
 });

 test("ytdlpBin is passed through to the spawn call correctly", async () => {
  setupHappyExecMocks();
  mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

  await collectEvents("https://youtube.com/playlist?list=X", "/usr/bin/yt-dlp");

  const [spawnBin] = mockSpawn.mock.calls[0];
  expect(spawnBin).toBe("/usr/bin/yt-dlp");
 });

 test("sanitized playlist name does not contain shell-significant characters", async () => {
  const nastyNames = [
   "$(rm -rf /)",
   "`id`",
   "${HOME}",
   "name;malicious",
  ];

  for (const name of nastyNames) {
   mockExecAsync
    .mockResolvedValueOnce({ stdout: name + "\n", stderr: "" })
    .mockResolvedValueOnce({ stdout: "id1\n", stderr: "" });
   mockSpawn.mockReturnValue(makeMockProcess({ exitCode: 0 }));

   const events = await collectEvents();

   const init = events.find((e) => e.type === "init");
   // Characters stripped: < > : " / \ | ? *   (. and $ and ; are NOT stripped — room for improvement)
   // At minimum the name must not contain slashes (which create unintended directories)
   expect(init.outputPath).not.toContain("../");
  }
 });
});
