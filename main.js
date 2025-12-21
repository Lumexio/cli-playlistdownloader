//const { RedirectHandler } = require("undici-types");
import DownloadPlaylist from "./core-download.js";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function main() {
  let url = "";
  rl.question("Enter Playlist URL: ", (answer) => {
    url = answer;
    rl.close();
    DownloadPlaylist(url);
  });
}

main();
