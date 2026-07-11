import { execSync, exec, spawn } from "node:child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

/**
 * Download a playlist as MP3 files, emitting progress events via onEvent.
 *
 * Events:
 *   { type: "init",        playlistName, totalTracks, outputPath }
 *   { type: "track-start", num, total }
 *   { type: "track-name",  name }
 *   { type: "progress",    percent }
 *   { type: "complete",    outputPath }
 *   { type: "error",       message }
 */
export async function DownloadPlaylist(link, onEvent = () => { }, ytdlpBin = "yt-dlp") {
  try {
    try {
      execSync(`"${ytdlpBin}" --version`, { stdio: "ignore" });
    } catch {
      throw new Error(`yt-dlp not found. Expected at: ${ytdlpBin}`);
    }

    const { stdout: titleOut } = await execAsync(
      `"${ytdlpBin}" --flat-playlist --print playlist_title -I 1:1 "${link}"`,
    );
    const playlistName = titleOut.trim();
    const sanitizedName = playlistName.replace(/[<>:"/\\|?*]/g, "");

    const { stdout: idsOut } = await execAsync(
      `"${ytdlpBin}" --flat-playlist --print id "${link}"`,
    );
    const totalTracks = idsOut.trim().split("\n").filter(Boolean).length;

    const defaultPath = path.join(os.homedir(), "Downloads", sanitizedName);
    if (!fs.existsSync(defaultPath)) {
      fs.mkdirSync(defaultPath, { recursive: true });
    }

    onEvent({ type: "init", playlistName, totalTracks, outputPath: defaultPath });

    await new Promise((resolve, reject) => {
      const args = [
        "-x",
        "--audio-format",
        "mp3",
        "-o",
        `${defaultPath}/%(title)s.%(ext)s`,
        link,
      ];
      const proc = spawn(ytdlpBin, args);
      let stdoutBuf = "";

      const handleLine = (line) => {
        const itemMatch = line.match(/\[download\] Downloading item (\d+) of \d+/);
        if (itemMatch) {
          onEvent({
            type: "track-start",
            num: parseInt(itemMatch[1], 10),
            total: totalTracks,
          });
          return;
        }

        const destMatch = line.match(/\[download\] Destination: .+[/\\](.+)$/);
        if (destMatch) {
          onEvent({ type: "track-name", name: destMatch[1] });
          return;
        }

        const pctMatch = line.match(/\[download\]\s+([\d.]+)%/);
        if (pctMatch) {
          onEvent({ type: "progress", percent: parseFloat(pctMatch[1]) });
          return;
        }

        if (line.includes("has already been downloaded")) {
          onEvent({ type: "progress", percent: 100 });
        }
      };

      proc.stdout.on("data", (chunk) => {
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop();
        for (const line of lines) handleLine(line);
      });

      proc.stderr.on("data", (chunk) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) handleLine(line);
        }
      });

      proc.on("close", (code) => {
        if (stdoutBuf) handleLine(stdoutBuf);
        if (code === 0) {
          onEvent({ type: "complete", outputPath: defaultPath });
          resolve();
        } else {
          const err = new Error(`yt-dlp exited with code ${code}`);
          onEvent({ type: "error", message: err.message });
          reject(err);
        }
      });
    });
  } catch (err) {
    onEvent({ type: "error", message: err.message });
  }
}

export default DownloadPlaylist;
