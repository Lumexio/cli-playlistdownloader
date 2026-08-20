import { execSync, spawn } from "node:child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cliProgress from "cli-progress";

/**
 * Strips dangerous characters and path traversal sequences from a playlist or file name.
 */
export function sanitizeFilename(name) {
  if (typeof name !== "string") return "";
  return name
    .replace(/\.\.+[/\\]/g, "") // remove path traversal ../ or ..\
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove illegal filesystem chars
    .replace(/^[\.\s]+|[\.\s]+$/g, "") // trim leading/trailing dots and whitespace
    .trim();
}

/**
 * Builds a safe argument array for yt-dlp subprocess invocation (preventing shell injection).
 */
export function buildCommandArgs({ link, outputDir, audioFormat = "mp3", audioQuality = "best" } = {}) {
  if (!link || typeof link !== "string") {
    throw new Error("A valid link string is required to build command arguments");
  }

  const template = outputDir
    ? `${outputDir}/%(title)s.%(ext)s`
    : "%(title)s.%(ext)s";

  return [
    "-x",
    "--audio-format",
    audioFormat,
    "--audio-quality",
    audioQuality,
    "-o",
    template,
    link,
  ];
}

/**
 * Parses yt-dlp stdout lines for download progress, speed, ETA, and item status.
 */
export function parseProgress(line) {
  if (typeof line !== "string") return null;

  // Track item counter: "[download] Downloading item 3 of 10"
  const itemMatch = line.match(/\[download\]\s+Downloading item\s+(\d+)\s+of\s+(\d+)/i);
  if (itemMatch) {
    return {
      type: "item",
      current: parseInt(itemMatch[1], 10),
      total: parseInt(itemMatch[2], 10),
    };
  }

  // Per-track download percentage with optional speed and ETA
  // e.g. "[download]  45.3% of ~10.50MiB at  2.50MiB/s ETA 00:05"
  const pctMatch = line.match(/\[download\]\s+([\d.]+)%(?:\s+of\s+[~\d.]+\w+)?(?:\s+at\s+([\d.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/i);
  if (pctMatch) {
    return {
      type: "percent",
      percent: parseFloat(pctMatch[1]),
      speed: pctMatch[2] || null,
      eta: pctMatch[3] || null,
    };
  }

  // Capture track title from destination line: "[download] Destination: /path/to/song.mp3"
  const destMatch = line.match(/\[download\]\s+Destination:\s+.+[/\\](.+)$/i);
  if (destMatch) {
    return {
      type: "destination",
      filename: destMatch[1].trim(),
    };
  }

  // Already downloaded tracks
  if (line.includes("has already been downloaded")) {
    return {
      type: "already_downloaded",
    };
  }

  return null;
}

// Check if yt-dlp is installed
function DependencyCheck() {
  try {
    execSync("yt-dlp --version", { stdio: "ignore" });
  } catch {
    console.error(
      "yt-dlp is not installed. Please install yt-dlp to use this feature.",
    );
    process.exit(1);
  }
}

export function DownloadPlaylist(link) {
  DependencyCheck();

  // 1. Get playlist title
  const getTitleCmd = `yt-dlp --flat-playlist --print playlist_title -I 1:1 "${link}"`;
  const playlistName = execSync(getTitleCmd).toString().trim();
  const sanitizedName = sanitizeFilename(playlistName);

  // 2. Get total track count
  const ids = execSync(`yt-dlp --flat-playlist --print id "${link}"`)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const totalTracks = ids.length;

  // 3. Ensure output directory exists
  const downloadsPath = path.join(os.homedir(), "Downloads");
  const defaultPath = path.join(downloadsPath, sanitizedName);
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
    console.log(`Created directory: ${defaultPath}`);
  } else {
    console.log(`Directory already exists: ${defaultPath}`);
  }

  // 4. Set up progress bars
  const multibar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: " {bar} | {label} | {value}/{total}",
    },
    cliProgress.Presets.shades_classic,
  );

  const overallBar = multibar.create(totalTracks, 0, {
    label: `Overall (${playlistName})`,
  });
  const trackBar = multibar.create(100, 0, { label: "Starting..." });

  // 5. Spawn yt-dlp and parse real-time output
  const args = buildCommandArgs({ link, outputDir: defaultPath });
  const proc = spawn("yt-dlp", args);

  let currentTrackNum = 0;

  const handleLine = (line) => {
    const progress = parseProgress(line);
    if (!progress) return;

    if (progress.type === "item") {
      currentTrackNum = progress.current;
      overallBar.update(currentTrackNum - 1);
      trackBar.update(0, { label: `Track ${currentTrackNum}/${totalTracks}` });
    } else if (progress.type === "percent") {
      trackBar.update(Math.floor(progress.percent));
    } else if (progress.type === "destination") {
      const shortName =
        progress.filename.length > 40
          ? progress.filename.slice(0, 37) + "..."
          : progress.filename;
      trackBar.update(0, { label: shortName });
    } else if (progress.type === "already_downloaded") {
      trackBar.update(100);
      overallBar.update(currentTrackNum);
    }
  };

  let stdoutBuf = "";
  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop(); // keep incomplete last line
    for (const line of lines) handleLine(line);
  });

  proc.on("close", (code) => {
    if (stdoutBuf) handleLine(stdoutBuf);
    trackBar.update(100);
    overallBar.update(totalTracks);
    multibar.stop();
    if (code === 0) {
      console.log("\nDownload Complete!");
    } else {
      console.error(`\nyt-dlp exited with code ${code}`);
    }
  });
}

export default DownloadPlaylist;
