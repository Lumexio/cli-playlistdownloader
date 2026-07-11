import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import { DownloadPlaylist } from "./core-download.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
 await DownloadPlaylist(url, (evt) => {
  win.webContents.send("download-event", evt);
 });
});
