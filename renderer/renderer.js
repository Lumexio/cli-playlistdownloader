const urlInput = document.getElementById("url-input");
const downloadBtn = document.getElementById("download-btn");
const progressSection = document.getElementById("progress-section");
const playlistNameEl = document.getElementById("playlist-name");
const outputPathEl = document.getElementById("output-path");
const overallFill = document.getElementById("overall-fill");
const overallCounter = document.getElementById("overall-counter");
const trackFill = document.getElementById("track-fill");
const trackNameEl = document.getElementById("track-name");
const trackPercentEl = document.getElementById("track-percent");
const statusMsg = document.getElementById("status-msg");

let totalTracks = 0;

function setStatus(text, type = "info") {
 statusMsg.textContent = text;
 statusMsg.className = `status ${type}`;
 statusMsg.classList.remove("hidden");
}

function setOverall(done, total) {
 const pct = total > 0 ? (done / total) * 100 : 0;
 overallFill.style.width = `${pct}%`;
 overallCounter.textContent = `${done} / ${total}`;
}

function setTrackProgress(pct, name) {
 trackFill.style.width = `${Math.min(pct, 100)}%`;
 trackPercentEl.textContent = `${Math.floor(pct)}%`;
 if (name !== undefined) trackNameEl.textContent = name;
}

downloadBtn.addEventListener("click", async () => {
 const url = urlInput.value.trim();
 if (!url) return;

 // Reset UI state
 downloadBtn.disabled = true;
 progressSection.classList.remove("hidden");
 playlistNameEl.textContent = "—";
 outputPathEl.textContent = "—";
 setOverall(0, 0);
 setTrackProgress(0, "Starting…");
 setStatus("Fetching playlist info…", "info");

 window.api.removeDownloadListeners();

 window.api.onDownloadEvent((event) => {
  switch (event.type) {
   case "init":
    totalTracks = event.totalTracks;
    playlistNameEl.textContent = event.playlistName;
    outputPathEl.textContent = event.outputPath;
    setOverall(0, totalTracks);
    setStatus(
     `Downloading ${totalTracks} track${totalTracks !== 1 ? "s" : ""}…`,
     "info",
    );
    break;

   case "track-start":
    setOverall(event.num - 1, totalTracks);
    setTrackProgress(0, `Track ${event.num} of ${event.total}`);
    break;

   case "track-name":
    // Strip file extension for display
    trackNameEl.textContent = event.name.replace(/\.[^.]+$/, "");
    break;

   case "progress":
    setTrackProgress(event.percent);
    break;

   case "complete":
    setOverall(totalTracks, totalTracks);
    setTrackProgress(100);
    setStatus("Download complete!", "success");
    downloadBtn.disabled = false;
    break;

   case "error":
    setStatus(`Error: ${event.message}`, "error");
    downloadBtn.disabled = false;
    break;
  }
 });

 try {
  await window.api.startDownload(url);
 } catch (err) {
  setStatus(`Error: ${err.message}`, "error");
  downloadBtn.disabled = false;
 }
});

// Submit on Enter
urlInput.addEventListener("keydown", (e) => {
 if (e.key === "Enter") downloadBtn.click();
});
