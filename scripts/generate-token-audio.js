#!/usr/bin/env node
/**
 * generate-token-audio.js
 *
 * Pre-generates all MP3 audio chunks needed by tokenAudio.ts.
 * Run ONCE on a developer machine (needs say / gtts-cli / gTTS).
 * Output files go to: backend/static/token-audio/
 *
 * Usage:
 *   node scripts/generate-token-audio.js
 *
 * Requirements (pick one — script tries in order):
 *   1. macOS `say` command   → converts to mp3 via ffmpeg
 *   2. `gtts-cli` Python CLI → pip install gTTS
 *   3. `espeak` on Linux     → apt install espeak ffmpeg
 *
 * The generated files are committed to the repo so production servers
 * don't need any TTS tool installed — they just serve static MP3s.
 *
 * File naming convention (matches tokenAudio.ts):
 *   token-prefix.mp3  — "Token number"
 *   n1.mp3 … n19.mp3  — one … nineteen
 *   n20.mp3 … n90.mp3 — twenty … ninety (multiples of 10)
 *   h100.mp3…h900.mp3 — one hundred … nine hundred (multiples of 100)
 */

const { execSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');

const OUT = path.join(__dirname, '..', 'backend', 'static', 'token-audio');
fs.mkdirSync(OUT, { recursive: true });

// ── TTS backend detection ──────────────────────────────────────────────────

function hasBin(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

let backend = null;
if (hasBin('say') && hasBin('ffmpeg'))         backend = 'say';
else if (hasBin('gtts-cli'))                   backend = 'gtts';
else if (hasBin('espeak') && hasBin('ffmpeg')) backend = 'espeak';

if (!backend) {
  console.error(
    'No TTS backend found. Install one of:\n' +
    '  macOS:  brew install ffmpeg  (say is built-in)\n' +
    '  Linux:  apt install espeak ffmpeg\n' +
    '  Any OS: pip install gTTS && pip install gtts-cli\n'
  );
  process.exit(1);
}

console.log(`Using TTS backend: ${backend}`);

// ── Text → MP3 ─────────────────────────────────────────────────────────────

function speak(text, outFile) {
  if (fs.existsSync(outFile)) return; // skip if already generated

  const tmp = outFile.replace('.mp3', '.aiff');

  if (backend === 'say') {
    execSync(`say -r 150 -o "${tmp}" "${text}"`);
    execSync(`ffmpeg -y -i "${tmp}" -codec:a libmp3lame -qscale:a 4 "${outFile}" -loglevel quiet`);
    fs.unlinkSync(tmp);
  } else if (backend === 'gtts') {
    execSync(`gtts-cli "${text}" --output "${outFile}" --lang en`);
  } else if (backend === 'espeak') {
    execSync(`espeak -s 130 "${text}" --stdout | ffmpeg -y -f wav -i - -codec:a libmp3lame -qscale:a 4 "${outFile}" -loglevel quiet`);
  }

  console.log(`  ✓ ${path.basename(outFile)}`);
}

// ── Word helpers ────────────────────────────────────────────────────────────

const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
               'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
               'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tensWords = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
                   'sixty', 'seventy', 'eighty', 'ninety'];
const hundredsWords = ['', 'one hundred', 'two hundred', 'three hundred', 'four hundred',
                       'five hundred', 'six hundred', 'seven hundred', 'eight hundred', 'nine hundred'];

// ── Generate chunks ─────────────────────────────────────────────────────────

console.log('\nGenerating token audio chunks...\n');

// prefix
speak('Token number', path.join(OUT, 'token-prefix.mp3'));
speak('Counter', path.join(OUT, 'counter-prefix.mp3'));

// n1 … n19
for (let i = 1; i <= 19; i++) {
  speak(ones[i], path.join(OUT, `n${i}.mp3`));
}

// n20, n30 … n90
for (let i = 2; i <= 9; i++) {
  speak(tensWords[i], path.join(OUT, `n${i * 10}.mp3`));
}

// h100 … h900
for (let i = 1; i <= 9; i++) {
  speak(hundredsWords[i], path.join(OUT, `h${i * 100}.mp3`));
}

console.log(`\nDone! ${fs.readdirSync(OUT).length} files in ${OUT}\n`);
console.log('Commit these files to the repo. The backend serves them as static assets.\n');
