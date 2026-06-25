// Local-only video transcoder. Re-encodes a video to a WhatsApp/Android-safe MP4
// (H.264 Baseline + AAC, yuv420p, 30 fps, +faststart) by shelling out to ffmpeg.
// ffmpeg isn't available on Vercel, so this only works when the dashboard runs on
// a machine with ffmpeg installed (e.g. the owner's laptop).

import { spawn } from 'child_process';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', e => reject(new Error(`ffmpeg not available — install it on this machine (brew install ffmpeg). ${e.message}`)));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-400)}`)));
  });
}

/** Transcode raw video bytes to a WhatsApp-safe MP4 and return the new bytes. */
export async function convertToWhatsApp(input: Uint8Array): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'wpconv-'));
  const inPath = join(dir, 'in');
  const outPath = join(dir, 'out.mp4');
  try {
    await writeFile(inPath, input);
    await runFfmpeg([
      '-i', inPath,
      '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1',
      '-pix_fmt', 'yuv420p', '-r', '30', '-crf', '27', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
      '-movflags', '+faststart', '-y', outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
