import { execSync, spawn } from "node:child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cliProgress from "cli-progress";

//Check if yt-dlp is installed
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
  const sanitizedName = playlistName.replace(/[<>:"/\\|?*]/g, "");

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
  const args = [
    "-x",
    "--audio-format",
    "mp3",
    "-o",
    `${defaultPath}/%(title)s.%(ext)s`,
    link,
  ];
  const proc = spawn("yt-dlp", args);

  let currentTrackNum = 0;

  const handleLine = (line) => {
    // Track item counter: "[download] Downloading item 3 of 10"
    const itemMatch = line.match(/\[download\] Downloading item (\d+) of \d+/);
    if (itemMatch) {
      currentTrackNum = parseInt(itemMatch[1], 10);
      overallBar.update(currentTrackNum - 1);
      trackBar.update(0, { label: `Track ${currentTrackNum}/${totalTracks}` });
      return;
    }

    // Per-track download percentage: "[download]  45.3% of ..."
    const pctMatch = line.match(/\[download\]\s+([\d.]+)%/);
    if (pctMatch) {
      trackBar.update(Math.floor(parseFloat(pctMatch[1])));
      return;
    }

    // Capture track title from destination line
    const destMatch = line.match(/\[download\] Destination: .+[/\\](.+)$/);
    if (destMatch) {
      const shortName =
        destMatch[1].length > 40
          ? destMatch[1].slice(0, 37) + "..."
          : destMatch[1];
      trackBar.update(0, { label: shortName });
      return;
    }

    // Already downloaded tracks still count as complete
    if (line.includes("has already been downloaded")) {
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
