// waveform.mjs — Astro integration: decode audio assets, emit sibling
// .waveform.json next to each. Scans both public/audio/ (legacy) and
// public/media/ (Tina-uploaded). Audio lives outside src/content so Tina
// Cloud's content indexer doesn't try to ingest binaries.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BUCKETS = 32;
// .webm + .mp4 added for browser MediaRecorder output (Chromium → webm/Opus,
// Safari → mp4/AAC). audio-decode may not handle all containers natively;
// the try/catch in processAudioFile turns a decode failure into a warning,
// and AudioCard.astro falls back to flat-bar render when waveform JSON is
// absent — so unsupported formats degrade gracefully rather than crash.
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.webm', '.mp4'];

async function processAudioFile(filepath) {
  const wfOut = filepath.replace(/\.[^.]+$/, '.waveform.json');
  try {
    const audioStat = await fs.stat(filepath);
    const wfStat = await fs.stat(wfOut).catch(() => null);
    if (wfStat && wfStat.mtimeMs >= audioStat.mtimeMs) return; // up to date

    const { default: decode } = await import('audio-decode');
    const buf = await fs.readFile(filepath);
    const audio = await decode(buf);
    const ch = audio.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(ch.length / BUCKETS));
    const peaks = [];
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0;
      const start = i * bucketSize;
      const end = Math.min(start + bucketSize, ch.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(ch[j]);
        if (v > max) max = v;
      }
      peaks.push(Math.round(max * 1000) / 1000);
    }
    const duration = audio.length / audio.sampleRate;
    await fs.writeFile(wfOut, JSON.stringify({ duration, peaks }, null, 2));
    console.log(`  [waveform] ${path.basename(filepath)} → ${BUCKETS} buckets, ${duration.toFixed(2)}s`);
  } catch (err) {
    console.warn(`  [waveform] failed for ${filepath}:`, err.message);
  }
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (AUDIO_EXT.includes(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

export default function waveformIntegration() {
  const roots = () => [
    path.resolve('public/audio'),
    path.resolve('public/media'),
  ];
  const run = async (logger, label) => {
    const all = (await Promise.all(roots().map(walk))).flat();
    if (!all.length) { logger.info(`${label}: no audio assets in public/audio or public/media`); return; }
    logger.info(`${label}: processing ${all.length} audio file(s)`);
    await Promise.all(all.map(processAudioFile));
  };
  return {
    name: 'blue-studio:waveform',
    hooks: {
      'astro:build:start': async ({ logger }) => run(logger, 'build'),
      'astro:server:start': async ({ logger }) => run(logger, 'dev'),
    },
  };
}
