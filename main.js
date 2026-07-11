import DownloadPlaylist from "./core-download.js";
import readline from "node:readline";
import cliProgress from "cli-progress";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function main() {
  rl.question("Enter Playlist URL: ", async (answer) => {
    rl.close();

    let multibar = null;
    let overallBar = null;
    let trackBar = null;

    await DownloadPlaylist(answer, (event) => {
      switch (event.type) {
        case "init":
          console.log(`Playlist: ${event.playlistName}`);
          console.log(`Output:   ${event.outputPath}`);
          multibar = new cliProgress.MultiBar(
            {
              clearOnComplete: false,
              hideCursor: true,
              format: " {bar} | {label} | {value}/{total}",
            },
            cliProgress.Presets.shades_classic,
          );
          overallBar = multibar.create(event.totalTracks, 0, { label: "Overall" });
          trackBar = multibar.create(100, 0, { label: "Starting..." });
          break;
        case "track-start":
          overallBar?.update(event.num - 1);
          trackBar?.update(0, { label: `Track ${event.num}/${event.total}` });
          break;
        case "track-name":
          trackBar?.update(trackBar.value, {
            label: event.name.slice(0, 40),
          });
          break;
        case "progress":
          trackBar?.update(Math.floor(event.percent));
          break;
        case "complete":
          overallBar?.update(overallBar.total);
          trackBar?.update(100);
          multibar?.stop();
          console.log("\nDownload Complete!");
          break;
        case "error":
          multibar?.stop();
          console.error(`\nError: ${event.message}`);
          break;
      }
    });
  });
}

main();
