/**
 * tokenAudio — Device-agnostic token announcement engine
 *
 * Strategy (layered fallback — each level tried in order):
 *
 * 1. Pre-recorded MP3 chunks (PRIMARY — works on ANY browser, ANY Android TV)
 *    Audio files are served from /api/token/audio/{filename}.mp3
 *    Numbers are split into phonetic chunks:
 *      "Token number 142" = token-prefix + h100 + n40 + n2
 *    Files required on the server (generated once offline):
 *      token-prefix.mp3  — "Token number"
 *      n1…n19.mp3        — one, two … nineteen
 *      n20, n30 … n90    — twenty, thirty … ninety
 *      h100…h900         — one hundred … nine hundred
 *    Total: ~130 small MP3 files, each <50 KB.
 *
 * 2. Web Speech API (SECONDARY — Chrome/Edge, most Android, Chromium-based TV browsers)
 *    Uses window.speechSynthesis. Available in ~90 % of modern browsers.
 *    Does NOT require any native library on Android — it is part of the browser engine.
 *
 * 3. Visual flash (TERTIARY — silent announcement + on-screen flash)
 *    If both audio methods fail, the display board flashes and emits a DOM event
 *    that can drive an external buzzer (GPIO, relay, etc.) via a local service.
 *
 * IMPORTANT — Android TV gotcha:
 *   Google TTS is an Android-level library used by WebView-based apps.
 *   A standard browser (Chrome for Android TV, Chromium on Fire TV) uses its own
 *   JS speech engine and does NOT need Google TTS installed separately.
 *   Our pre-recorded MP3 approach bypasses ALL of this — it only needs an <audio>
 *   element, which every browser supports.
 */

const AUDIO_BASE = '/api/v1/token/audio'; // served by NestJS static assets

type AudioMode = 'chunks' | 'speech' | 'visual';

let detectedMode: AudioMode | null = null;
// Extension used by the pre-recorded chunk files ('mp3' or 'wav')
let chunkExt: 'mp3' | 'wav' | null = null;

// ─── Capability detection ──────────────────────────────────────────────────

async function detectMode(): Promise<AudioMode> {
  if (detectedMode) return detectedMode;

  // Test if pre-recorded chunks are available — try WAV then MP3 (since we currently use WAV)
  for (const ext of ['wav', 'mp3'] as const) {
    try {
      const res = await fetch(`${AUDIO_BASE}/token-prefix.${ext}`, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' }
      });
      if (res.ok || res.status === 206) {
        chunkExt    = ext;
        detectedMode = 'chunks';
        return 'chunks';
      }
    } catch {
      // file not found — try next extension
    }
  }

  // Test Web Speech API
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    detectedMode = 'speech';
    return 'speech';
  }

  detectedMode = 'visual';
  return 'visual';
}

// ─── Audio chunk map ──────────────────────────────────────────────────────

/**
 * Decompose a number 1–999 into audio file names.
 * Example: 142 → ['h100', 'n40', 'n2']
 *          19  → ['n19']
 *          300 → ['h300']
 */
function decomposeNumber(n: number): string[] {
  if (n <= 0 || n > 999) return [];
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10) * 10;
  const ones = remainder % 10;

  if (hundreds > 0) parts.push(`h${hundreds * 100}`);

  if (remainder > 0) {
    if (remainder <= 19) {
      parts.push(`n${remainder}`);
    } else {
      if (tens > 0) parts.push(`n${tens}`);
      if (ones > 0) parts.push(`n${ones}`);
    }
  }

  return parts;
}

function buildChunkUrls(tokenNumber: number, counterNumber?: number): string[] {
  const ext  = chunkExt ?? 'mp3';   // set by detectMode(); mp3 or wav
  const urls: string[] = [];
  // "Token number NN"
  urls.push(`${AUDIO_BASE}/token-prefix.${ext}`);
  urls.push(...decomposeNumber(tokenNumber).map((c) => `${AUDIO_BASE}/${c}.${ext}`));
  // "Counter N" suffix
  if (counterNumber != null && counterNumber > 0) {
    urls.push(`${AUDIO_BASE}/counter-prefix.${ext}`);
    urls.push(...decomposeNumber(counterNumber).map((c) => `${AUDIO_BASE}/${c}.${ext}`));
  }
  return urls;
}

// ─── Chunk player ─────────────────────────────────────────────────────────

/** Play a sequence of MP3 URLs end-to-end */
async function playChunkSequence(urls: string[]): Promise<void> {
  for (const url of urls) {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error(`Failed to load ${url}`));
      audio.play().catch(reject);
    });
  }
}

// ─── Web Speech API player ────────────────────────────────────────────────

function numberToWords(n: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
                 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
                 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
                'sixty', 'seventy', 'eighty', 'ninety'];

  if (n === 0) return 'zero';
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  return ones[Math.floor(n / 100)] + ' hundred' +
    (n % 100 ? ' ' + numberToWords(n % 100) : '');
}

/**
 * Pick the best available female voice for the given language.
 *
 * Priority order (by name pattern — most specific first):
 *   1. Voices explicitly labelled "female" in their name
 *   2. Known female voice names across platforms:
 *        Windows : Zira, Aria, Jenny, Michelle, Monica
 *        macOS   : Samantha, Karen, Moira, Tessa, Veena
 *        Android : Google UK English Female, Google US English (usually female)
 *        Linux   : espeak female variants
 *   3. Any remaining voice for the language (last resort)
 *
 * Returns null if no voices are available yet (called before voices load).
 */
function pickFemaleVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langCode = lang.toLowerCase();

  // Filter voices that match the requested language (e.g. 'en-us', 'en-gb', 'en')
  const langVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(langCode.split('-')[0]),
  );
  const pool = langVoices.length ? langVoices : voices;

  // Female keyword patterns (case-insensitive)
  const femaleKeywords = [
    'female', 'zira', 'aria', 'jenny', 'michelle', 'monica',
    'samantha', 'karen', 'moira', 'tessa', 'veena',
    'uk english female', 'us english female',
  ];

  for (const kw of femaleKeywords) {
    const match = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  // Fallback: return first voice in pool
  return pool[0] ?? null;
}

async function speakWithSynthesis(tokenNumber: number, counterNumber?: number, lang = 'en-US'): Promise<void> {
  return new Promise<void>((resolve) => {
    const counterPart = counterNumber != null ? `. Counter ${counterNumber}` : '';
    const text = `Token number ${numberToWords(tokenNumber)}${counterPart}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang   = lang;
    utterance.rate   = 0.85;
    utterance.volume = 1;
    utterance.pitch  = 1.1; // Slightly higher pitch — clearer at distance

    // Assign female voice if available.
    // getVoices() may return [] on first call (async load); in that case
    // the browser picks its default — we handle that via voiceschanged below.
    const femaleVoice = pickFemaleVoice(lang);
    if (femaleVoice) utterance.voice = femaleVoice;

    // Guard: resolve exactly once regardless of which event fires first
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };

    utterance.onend = done;

    // 'interrupted' / 'canceled' are not real errors — they just mean
    // something else took over the synth; still treat as completion so
    // the queue can move on.
    utterance.onerror = (e) => {
      if (!settled) {
        settled = true;
        if (e.error === 'interrupted' || e.error === 'canceled' || e.error === 'not-allowed') {
          resolve();
        } else {
          resolve();
        }
      }
    };

    // Safety timeout: Chrome's onend sometimes never fires (especially when
    // the tab loses focus). Estimate ~400 ms/word + 1.5 s buffer.
    const wordCount = text.split(' ').length;
    setTimeout(done, wordCount * 400 + 1500);

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Warm up voice list on first user interaction.
 * Browsers load voices asynchronously; calling this after a click ensures
 * getVoices() returns a full list on the next announcement.
 */
export function preloadVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  // Trigger voice list load — result is discarded but caches the list in the browser
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices(); // re-cache after async load
  };
}

// ─── Visual flash ─────────────────────────────────────────────────────────

function triggerVisualFlash(tokenNumber: number): void {
  // Dispatch a DOM event — UI layer listens and flashes the display
  window.dispatchEvent(
    new CustomEvent('token:visual-announce', { detail: { tokenNumber } }),
  );
}

// ─── Announcement queue ────────────────────────────────────────────────────
//
// Guarantees sequential playback: token 29 finishes completely before
// token 30 starts, even if both are enqueued within milliseconds of each other.

interface QueueEntry {
  tokenNumber:    number;
  counterNumber?: number;
  lang:           string;
  resolve:        () => void;
}

const announcementQueue: QueueEntry[] = [];
let queueRunning = false;

async function runQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;

  try {
    while (announcementQueue.length > 0) {
      const entry = announcementQueue.shift()!;
      try {
        await playOneAnnouncement(entry.tokenNumber, entry.counterNumber, entry.lang);
      } catch {
        // Single announcement failure must never stall the whole queue
      }
      entry.resolve();
      // Chromium drops a speak() called immediately after onend fires.
      // A 250 ms gap lets the speech engine settle before the next utterance.
      if (announcementQueue.length > 0) {
        await new Promise<void>((r) => setTimeout(r, 250));
      }
    }
  } finally {
    queueRunning = false;
  }
}

async function playOneAnnouncement(
  tokenNumber:    number,
  counterNumber?: number,
  lang = 'en-US',
): Promise<void> {
  const mode = currentMode ?? await detectMode();

  if (mode === 'chunks') {
    try {
      await playChunkSequence(buildChunkUrls(tokenNumber, counterNumber));
      return;
    } catch {
      // Chunk files missing; fall through to speech
    }
  }

  if (mode !== 'visual') {
    try {
      await speakWithSynthesis(tokenNumber, counterNumber, lang);
      return;
    } catch {
      // Speech failed; fall through to visual
    }
  }

  triggerVisualFlash(tokenNumber);
}

// ─── Public API ───────────────────────────────────────────────────────────

let currentMode: AudioMode | null = null;

/** Call once at app boot to pre-detect audio capability */
export async function initTokenAudio(): Promise<AudioMode> {
  currentMode = await detectMode();
  return currentMode;
}

/**
 * Enqueue a token announcement.
 * If an announcement is already playing, this one waits until it finishes.
 * Resolves when THIS token's announcement completes.
 *
 * e.g. announceToken(42, 2) → "Token number forty two. Counter 2."
 */
export function announceToken(
  tokenNumber:    number,
  counterNumber?: number,
  lang = 'en-US',
): Promise<void> {
  return new Promise<void>((resolve) => {
    announcementQueue.push({ tokenNumber, counterNumber, lang, resolve });
    runQueue(); // no-op if already running
  });
}

/** Returns a human-readable string for the current audio status (for debugging) */
export function getAudioStatus(): string {
  if (!currentMode) return 'not detected';
  if (currentMode === 'chunks') return `chunks (${chunkExt ?? '?'})`;
  return currentMode;
}

/** Force a specific mode (useful for testing or settings override) */
export function setAudioMode(mode: AudioMode): void {
  currentMode = mode;
  detectedMode = mode;
}

/**
 * Reset cached mode so the next announceToken call re-detects capability.
 * Call this after a user gesture (e.g. tap-to-unlock) because some browsers
 * only expose speech synthesis after the first interaction.
 */
export function resetAudioMode(): void {
  currentMode  = null;
  detectedMode = null;
  chunkExt     = null;
}

export type { AudioMode };
