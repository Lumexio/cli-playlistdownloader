import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProgress,
  sanitizeFilename,
  buildCommandArgs,
} from '../core-download.js';

describe('CLI Playlist Downloader — core-download unit tests', () => {
  describe('parseProgress', () => {
    it('parses item counter lines ([download] Downloading item X of Y)', () => {
      const line = '[download] Downloading item 3 of 15';
      const result = parseProgress(line);

      assert.deepEqual(result, {
        type: 'item',
        current: 3,
        total: 15,
      });
    });

    it('parses progress percentage with speed and ETA', () => {
      const line = '[download]  45.3% of ~10.50MiB at  2.50MiB/s ETA 00:05';
      const result = parseProgress(line);

      assert.deepEqual(result, {
        type: 'percent',
        percent: 45.3,
        speed: '2.50MiB/s',
        eta: '00:05',
      });
    });

    it('parses progress percentage without speed or ETA', () => {
      const line = '[download]  100% of 8.20MiB';
      const result = parseProgress(line);

      assert.equal(result?.type, 'percent');
      assert.equal(result?.percent, 100);
    });

    it('parses destination line to extract output filename', () => {
      const lineUnix = '[download] Destination: /home/user/Downloads/Best Playlist/01 Track.mp3';
      const resultUnix = parseProgress(lineUnix);
      assert.deepEqual(resultUnix, {
        type: 'destination',
        filename: '01 Track.mp3',
      });

      const lineWin = '[download] Destination: C:\\Users\\User\\Downloads\\Playlist\\02 Song.mp3';
      const resultWin = parseProgress(lineWin);
      assert.deepEqual(resultWin, {
        type: 'destination',
        filename: '02 Song.mp3',
      });
    });

    it('detects already downloaded tracks', () => {
      const line = '[download] /path/to/song.mp3 has already been downloaded';
      const result = parseProgress(line);
      assert.deepEqual(result, {
        type: 'already_downloaded',
      });
    });

    it('returns null for unrelated output lines or non-string inputs', () => {
      assert.equal(parseProgress('[info] Extracting URL: https://youtube.com'), null);
      assert.equal(parseProgress(''), null);
      assert.equal(parseProgress(null), null);
    });
  });

  describe('sanitizeFilename', () => {
    it('strips path traversal sequences (../, ..\\)', () => {
      const input = '../../../../etc/passwd';
      const sanitized = sanitizeFilename(input);
      assert.equal(sanitized, 'etcpasswd');

      const winInput = '..\\..\\Windows\\System32\\calc.exe';
      const sanitizedWin = sanitizeFilename(winInput);
      assert.equal(sanitizedWin, 'WindowsSystem32calc.exe');
    });

    it('strips dangerous filesystem characters (<>:"/\\|?*)', () => {
      const input = 'My: Cool / Playlist <2026> | Part "1" ? *';
      const sanitized = sanitizeFilename(input);
      assert.equal(sanitized, 'My Cool  Playlist 2026  Part 1');
    });

    it('strips leading and trailing dots and whitespace', () => {
      const input = '   ...Chill Beats Playlist...   ';
      const sanitized = sanitizeFilename(input);
      assert.equal(sanitized, 'Chill Beats Playlist');
    });

    it('handles non-string and empty inputs gracefully', () => {
      assert.equal(sanitizeFilename(''), '');
      assert.equal(sanitizeFilename(null), '');
      assert.equal(sanitizeFilename(undefined), '');
    });
  });

  describe('buildCommandArgs', () => {
    it('generates safe argument array for yt-dlp subprocess spawn', () => {
      const link = 'https://www.youtube.com/playlist?list=PL1234567890';
      const outputDir = 'C:/Downloads/My Playlist';
      const args = buildCommandArgs({ link, outputDir, audioFormat: 'mp3', audioQuality: 'best' });

      assert.deepEqual(args, [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        'best',
        '-o',
        'C:/Downloads/My Playlist/%(title)s.%(ext)s',
        'https://www.youtube.com/playlist?list=PL1234567890',
      ]);
    });

    it('prevents shell injection by returning separate array elements', () => {
      const maliciousLink = 'https://youtube.com/playlist?list=123; rm -rf /;';
      const args = buildCommandArgs({ link: maliciousLink });

      // The malicious string must be the final single argument, not split or shell-executed
      assert.equal(args[args.length - 1], maliciousLink);
      assert.ok(Array.isArray(args));
    });

    it('throws when link is missing', () => {
      assert.throws(() => buildCommandArgs({ link: '' }), {
        name: 'Error',
        message: 'A valid link string is required to build command arguments',
      });
    });
  });
});
