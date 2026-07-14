const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
 // ── Download (existing) ────────────────────────────────────────────────────
 startDownload: (url) => ipcRenderer.invoke("start-download", url),
 onDownloadEvent: (callback) => {
  ipcRenderer.on("download-event", (_, event) => callback(event));
 },
 removeDownloadListeners: () => {
  ipcRenderer.removeAllListeners("download-event");
 },

 // ── Auth ──────────────────────────────────────────────────────────────────
 auth: {
  register: (data) => ipcRenderer.invoke("auth:register", data),
  login: (data) => ipcRenderer.invoke("auth:login", data),
  logout: () => ipcRenderer.invoke("auth:logout"),
  me: () => ipcRenderer.invoke("auth:me"),
 },

 // ── Plans ─────────────────────────────────────────────────────────────────
 plans: {
  list: () => ipcRenderer.invoke("plans:list"),
 },

 // ── Stripe ────────────────────────────────────────────────────────────────
 stripe: {
  checkout: (data) => ipcRenderer.invoke("stripe:checkout", data),
  subscription: () => ipcRenderer.invoke("stripe:subscription"),
  cancel: () => ipcRenderer.invoke("stripe:cancel"),
 },

 // ── Downloads ─────────────────────────────────────────────────────────────
 downloads: {
  record: (data) => ipcRenderer.invoke("downloads:record", data),
  history: (opts) => ipcRenderer.invoke("downloads:history", opts),
  planStatus: () => ipcRenderer.invoke("downloads:plan-status"),
 },
});

