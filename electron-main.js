import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { DownloadPlaylist } from "./core-download.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 createWindow();
 app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
 });
});

app.on("window-all-closed", () => {
 if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("start-download", async (event, url) => {
 const win = BrowserWindow.fromWebContents(event.sender);
 const ytdlpBin = getYtDlpPath();
 await DownloadPlaylist(url, (evt) => {
  win.webContents.send("download-event", evt);
 }, ytdlpBin);
});
