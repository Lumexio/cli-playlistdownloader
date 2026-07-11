/**
 * Downloads yt-dlp binaries for Linux and Windows into the bin/ directory.
 * Run with: node scripts/download-ytdlp.mjs
 */
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binDir = path.join(__dirname, "..", "bin");

const BINARIES = [
 {
  url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
  dest: "yt-dlp",
  executable: true,
 },
 {
  url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
  dest: "yt-dlp.exe",
  executable: false,
 },
];

function download(url, dest) {
 return new Promise((resolve, reject) => {
  const proto = url.startsWith("https") ? https : http;
  const file = fs.createWriteStream(dest);

  const req = proto.get(url, (res) => {
   // Follow redirects (GitHub uses 302)
   if (res.statusCode === 301 || res.statusCode === 302) {
    const redirectUrl = res.headers.location;
    res.resume(); // drain the redirect response
    file.destroy(); // abort current stream; new download will create a fresh one
    download(redirectUrl, dest).then(resolve).catch(reject);
    return;
   }
   if (res.statusCode !== 200) {
    file.destroy();
    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
    return;
   }

   const total = parseInt(res.headers["content-length"] || "0", 10);
   let received = 0;
   let lastPct = -1;

   res.on("data", (chunk) => {
    received += chunk.length;
    if (total > 0) {
     const pct = Math.floor((received / total) * 100);
     if (pct !== lastPct && pct % 10 === 0) {
      process.stdout.write(`\r  ${path.basename(dest)}: ${pct}%`);
      lastPct = pct;
     }
    }
   });

   res.pipe(file);
   file.on("finish", () =>
    file.close(() => {
     process.stdout.write("\n");
     resolve();
    }),
   );
  });

  req.on("error", (err) => {
   file.destroy();
   reject(err);
  });
 });
}

async function main() {
 if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
 }

 for (const { url, dest, executable } of BINARIES) {
  const destPath = path.join(binDir, dest);
  process.stdout.write(`Downloading ${dest}...\n`);
  try {
   await download(url, destPath);
   if (executable) {
    fs.chmodSync(destPath, 0o755);
   }
   console.log(`  ✓ ${dest} saved`);
  } catch (err) {
   console.error(`  ✗ Failed to download ${dest}: ${err.message}`);
   process.exitCode = 1;
  }
 }
}

main();
