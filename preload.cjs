const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
 startDownload: (url) => ipcRenderer.invoke("start-download", url),
 onDownloadEvent: (callback) => {
  ipcRenderer.on("download-event", (_, event) => callback(event));
 },
 removeDownloadListeners: () => {
  ipcRenderer.removeAllListeners("download-event");
 },
});
