import { exec, execSync } from "node:child_process";
import readline from "node:readline";
import fs from "fs";
import path from "path";
import os from "os";
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
//Check if yt-dlp is installed
function DependencyCheck() {
  const checkCommand = "yt-dlp --version";
  exec(checkCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(
        "yt-dlp is not installed. Please install yt-dlp to use this feature.",
      );
      return;
    }
  });
}
export function DownloadPlaylist(link) {
  DependencyCheck();
  const getTitleCmd = `yt-dlp --flat-playlist --print playlist_title -I 1:1 "${link}"`;

  const playlistName = execSync(getTitleCmd).toString().trim();

  // 2. Sanitize the name (remove characters that OS doesn't allow in folder names)
  const sanitizedName = playlistName.replace(/[<>:"/\\|?*]/g, "");
  // 3. Check if directory exists, if not asign an existing one
  const downloadsPath = path.join(os.homedir(), "Downloads");
  const defaultPath = path.join(downloadsPath, sanitizedName);

  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
    console.log(`Created directory: ${defaultPath}`);
  } else {
    console.log(`Directory already exists: ${defaultPath}`);
  }
  // 4. Download the playlist into that directory
  const command = `yt-dlp -x --audio-format mp3 -o "${defaultPath}/%(title)s.%(ext)s" ${link}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    console.log("Download Complete!");
  });
}

export default DownloadPlaylist;
