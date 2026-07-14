/**
 * queue-manager.js
 *
 * Wraps DownloadPlaylist with plan-based concurrency enforcement.
 * Consults the backend /downloads/plan-status endpoint to determine
 * how many simultaneous downloads the user's plan allows.
 * Falls back to Basic plan limits (maxQueue: 1) when backend is unavailable.
 */

import { DownloadPlaylist } from "./core-download.js";

/** Number of downloads currently running. */
let activeCount = 0;

/** Queue of pending download work items. */
const queue = [];

/** Current concurrency limit (updated on each new queueDownload call). */
let currentMaxQueue = 1;

/**
 * Fetch plan concurrency limits from the backend.
 * Returns safe defaults if the backend is unreachable or the user is unauthenticated.
 *
 * @param {number|null} backendPort
 * @param {string|null} token
 * @returns {Promise<{maxQueue: number|null, canDownload: boolean}>}
 */
async function getPlanStatus(backendPort, token) {
 if (!backendPort) return { maxQueue: 1, canDownload: true };
 try {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(
   `http://127.0.0.1:${backendPort}/downloads/plan-status`,
   { headers, signal: AbortSignal.timeout(3000) }
  );
  if (!res.ok) return { maxQueue: 1, canDownload: true };
  return await res.json();
 } catch {
  // Backend unavailable — default to Basic plan (offline-first)
  return { maxQueue: 1, canDownload: true };
 }
}

/** Drain the queue while the concurrency limit allows. */
function processQueue() {
 while (queue.length > 0) {
  if (currentMaxQueue !== null && activeCount >= currentMaxQueue) break;
  const item = queue.shift();
  activeCount++;
  item
   .run()
   .finally(() => {
    activeCount--;
    processQueue();
   });
 }
}

/**
 * Queue a playlist download, enforcing the user's plan concurrency limit.
 *
 * @param {string} url - YouTube playlist URL
 * @param {function} onEvent - event callback (same API as DownloadPlaylist)
 * @param {string} ytdlpBin - path to yt-dlp binary
 * @param {{ backendPort?: number, token?: string }} options
 * @returns {Promise<void>}
 */
export async function queueDownload(url, onEvent, ytdlpBin, options = {}) {
 const { backendPort = null, token = null } = options;

 const status = await getPlanStatus(backendPort, token);
 currentMaxQueue = status.maxQueue ?? null; // null = unlimited

 if (!status.canDownload) {
  onEvent({
   type: "error",
   message: "Monthly download limit reached. Upgrade your plan to continue.",
  });
  return;
 }

 return new Promise((resolve, reject) => {
  queue.push({
   run: () => DownloadPlaylist(url, onEvent, ytdlpBin).then(resolve).catch(reject),
  });
  processQueue();
 });
}
