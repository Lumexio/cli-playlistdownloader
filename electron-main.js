import { app, BrowserWindow, ipcMain, shell, safeStorage } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { queueDownload } from "./queue-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Backend process management ──────────────────────────────────────────────

let backendProcess = null;
let backendPort = null;
let authToken = null;

const AUTH_FILE = () => path.join(app.getPath("userData"), "auth.json");

function saveToken(token) {
 if (!safeStorage.isEncryptionAvailable()) return;
 const encrypted = safeStorage.encryptString(token).toString("base64");
 fs.writeFileSync(AUTH_FILE(), JSON.stringify({ token: encrypted }), "utf8");
}

function loadToken() {
 if (!safeStorage.isEncryptionAvailable()) return null;
 try {
  const raw = fs.readFileSync(AUTH_FILE(), "utf8");
  const { token } = JSON.parse(raw);
  return safeStorage.decryptString(Buffer.from(token, "base64"));
 } catch {
  return null;
 }
}

function clearToken() {
 try { fs.unlinkSync(AUTH_FILE()); } catch { }
}

function spawnBackend() {
 const isPackaged = app.isPackaged;
 const backendDir = isPackaged
  ? path.join(process.resourcesPath, "backend")
  : path.join(__dirname, "..", "playlist-downloader-backend");

 const scriptPath = path.join(backendDir, "dist", "index.js");
 if (!fs.existsSync(scriptPath)) {
  console.warn("[electron] Backend not found at", scriptPath, "— skipping spawn.");
  return;
 }

 const nodeExecutable = isPackaged ? process.execPath : "node";
 const dbPath = path.join(app.getPath("userData"), "playlist-downloader.db");

 backendProcess = spawn(nodeExecutable, [scriptPath], {
  cwd: backendDir,
  env: { ...process.env, DB_PATH: dbPath },
  stdio: ["ignore", "pipe", "pipe"],
 });

 backendProcess.stdout.on("data", (data) => {
  const text = data.toString();
  const match = text.match(/LISTENING:(\d+)/);
  if (match) {
   backendPort = parseInt(match[1], 10);
   authToken = loadToken();
   console.log(`[electron] Backend ready on port ${backendPort}`);
  }
 });

 backendProcess.stderr.on("data", (data) => {
  console.error("[backend]", data.toString().trim());
 });

 backendProcess.on("close", (code) => {
  console.log(`[electron] Backend exited (code ${code})`);
  backendPort = null;
  backendProcess = null;
 });
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function backendFetch(urlPath, options = {}) {
 if (!backendPort) throw Object.assign(new Error("Backend not available"), { status: 503 });
 const url = `http://127.0.0.1:${backendPort}${urlPath}`;
 const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
 if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
 const res = await fetch(url, { ...options, headers });
 if (res.status === 204) return null;
 const body = await res.json();
 if (!res.ok) throw Object.assign(new Error(body.error ?? "Request failed"), { status: res.status });
 return body;
}

/**
 * Resolve the bundled yt-dlp binary.
 * - In production (packaged): use process.resourcesPath/bin/
 * - In development: use project root bin/
 */
function getYtDlpPath() {
 const bin = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
 const base = app.isPackaged ? process.resourcesPath : __dirname;
 return path.join(base, "bin", bin);
}

function createWindow() {
 const win = new BrowserWindow({
  width: 680,
  height: 480,
  minWidth: 500,
  minHeight: 380,
  autoHideMenuBar: true,
  webPreferences: {
   preload: path.join(__dirname, "preload.cjs"),
   contextIsolation: true,
   nodeIntegration: false,
  },
 });

 win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
 // Ensure the bundled Linux binary is executable
 if (process.platform !== "win32") {
  const bin = getYtDlpPath();
  if (fs.existsSync(bin)) {
   try { fs.chmodSync(bin, 0o755); } catch (_) { }
  }
 }
 spawnBackend();
 createWindow();
 app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
 });
});

app.on("before-quit", () => {
 if (backendProcess) backendProcess.kill();
});

app.on("window-all-closed", () => {
 if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("start-download", async (event, url) => {
 const win = BrowserWindow.fromWebContents(event.sender);
 const ytdlpBin = getYtDlpPath();
 await queueDownload(
  url,
  (evt) => { win.webContents.send("download-event", evt); },
  ytdlpBin,
  { backendPort, token: authToken }
 );
});

// ─── Auth IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle("auth:register", async (_, data) =>
 backendFetch("/auth/register", { method: "POST", body: JSON.stringify(data) })
);

ipcMain.handle("auth:login", async (_, data) => {
 const result = await backendFetch("/auth/login", { method: "POST", body: JSON.stringify(data) });
 authToken = result.token;
 saveToken(authToken);
 return result;
});

ipcMain.handle("auth:logout", async () => {
 await backendFetch("/auth/logout", { method: "POST" }).catch(() => { });
 authToken = null;
 clearToken();
});

ipcMain.handle("auth:me", async () => backendFetch("/auth/me"));

// ─── Plans IPC ────────────────────────────────────────────────────────────────

ipcMain.handle("plans:list", async () => backendFetch("/plans"));

// ─── Stripe IPC ───────────────────────────────────────────────────────────────

ipcMain.handle("stripe:checkout", async (_, data) => {
 const result = await backendFetch("/stripe/checkout", {
  method: "POST",
  body: JSON.stringify(data),
 });
 // Open Stripe Checkout in the user's default browser
 if (result?.url) shell.openExternal(result.url);
 return result;
});

ipcMain.handle("stripe:subscription", async () => backendFetch("/stripe/subscription"));

ipcMain.handle("stripe:cancel", async () =>
 backendFetch("/stripe/cancel", { method: "POST" })
);

// ─── Downloads IPC ────────────────────────────────────────────────────────────

ipcMain.handle("downloads:record", async (_, data) =>
 backendFetch("/downloads/record", { method: "POST", body: JSON.stringify(data) })
);

ipcMain.handle("downloads:history", async (_, opts = {}) => {
 const { page = 1, limit = 20 } = opts;
 return backendFetch(`/downloads/history?page=${page}&limit=${limit}`);
});

ipcMain.handle("downloads:plan-status", async () =>
 backendFetch("/downloads/plan-status")
);
