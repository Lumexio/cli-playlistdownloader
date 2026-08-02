## CLI-PLAYLIST DOWNLOADER

[![AI Ready](https://img.shields.io/badge/AI--Ready-yes-brightgreen?style=flat)](https://github.com/johnpapa/ai-ready)
A simple command-line tool to download playlists from YouTube.
### Features
- Download entire YouTube playlists with a single command.
- Supports various video formats and quality options.
- Easy-to-use command-line interface.
### Installation
1. Clone the repository:
   ```bash
   git clone 'URL'
   ```
2. Navigate to the project directory:
    ```bash
    cd cli-playlistdownloader
    ```
3. Install the required dependencies:
  - Arch Linux:
    ```bash
    sudo pacman -S yt-dlp
    ```
  - Debian/Ubuntu:
    ```bash
    sudo apt-get install yt-dlp
    ```
  - macOS (using Homebrew):
    ```bash
    brew install yt-dlp
    ```


  ## Usage
  Run the script with the playlist URL as an argument:
  ```bash
  node main.js
  ```
  ```
  Enter Playlist URL: <playlist_url>
  ```

## Contributing

Create a focused branch and pull request. Install dependencies with
`npm ci --ignore-scripts` when the tracked yt-dlp binaries should remain
unchanged, then run `npm test`. Changes to download events must remain aligned
across `core-download.js`, the CLI, Electron IPC/preload, renderer, and tests.
Preserve the security constraints in `AGENTS.md`.
