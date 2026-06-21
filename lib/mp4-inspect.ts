// Shared, dependency-free MP4/MOV inspector. Parses the box structure to flag the
// things that break WhatsApp/Android playback: the moov atom at the end (no
// faststart), a non-H.264 video codec, non-AAC audio, or a high frame rate.
// Works against any async byte reader, so the same code runs in the browser
// (reading a File) and on the server (reading R2 byte ranges). Best-effort —
// never throws; returns no warnings when it can't determine something.

export interface VideoCheck {
  ok: boolean;
  warnings: string[];
  info?: { faststart: boolean; videoCodec?: string; audioCodec?: string; fps?: number };
}

/** Reads `len` bytes starting at `start`. May return fewer bytes near EOF. */
export type ByteReader = (start: number, len: number) => Promise<DataView>;

const fourcc = (v: DataView, off: number) =>
  String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta']);

interface Box { type: string; body: number; end: number }
function boxesIn(v: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = v.getUint32(off);
    const type = fourcc(v, off + 4);
    let header = 8;
    if (size === 1) { size = Number(v.getBigUint64(off + 8)); header = 16; }
    else if (size === 0) { size = end - off; }
    out.push({ type, body: off + header, end: off + size });
    if (size <= 0) break;
    off += size;
  }
  return out;
}
function findBox(v: DataView, start: number, end: number, type: string): Box | null {
  for (const b of boxesIn(v, start, end)) {
    if (b.type === type) return b;
    if (CONTAINERS.has(b.type)) { const r = findBox(v, b.body, b.end, type); if (r) return r; }
  }
  return null;
}

function parseMoov(v: DataView, end: number): { videoCodec?: string; audioCodec?: string; fps?: number } {
  let videoCodec: string | undefined, audioCodec: string | undefined, fps: number | undefined;
  for (const trak of boxesIn(v, 0, end)) {
    if (trak.type !== 'trak') continue;
    const hdlr = findBox(v, trak.body, trak.end, 'hdlr');
    const handler = hdlr ? fourcc(v, hdlr.body + 8) : undefined; // verflags(4)+predefined(4) → handler
    const stsd = findBox(v, trak.body, trak.end, 'stsd');
    const codec = stsd ? fourcc(v, stsd.body + 12) : undefined;   // verflags(4)+count(4)+entrysize(4) → fourcc
    if (handler === 'vide') {
      videoCodec = codec;
      const mdhd = findBox(v, trak.body, trak.end, 'mdhd');
      const stts = findBox(v, trak.body, trak.end, 'stts');
      if (mdhd && stts) {
        const ver = v.getUint8(mdhd.body);
        const timescale = ver === 1 ? v.getUint32(mdhd.body + 20) : v.getUint32(mdhd.body + 12);
        const duration  = ver === 1 ? Number(v.getBigUint64(mdhd.body + 24)) : v.getUint32(mdhd.body + 16);
        const entries = v.getUint32(stts.body + 4);
        let samples = 0;
        for (let i = 0; i < entries; i++) {
          const e = stts.body + 8 + i * 8;
          if (e + 4 > end) break;
          samples += v.getUint32(e);
        }
        if (timescale && duration) fps = samples / (duration / timescale);
      }
    } else if (handler === 'soun') {
      audioCodec = codec;
    }
  }
  return { videoCodec, audioCodec, fps };
}

/** Inspect an MP4/MOV via an async byte reader. `fileSize` bounds the box walk. */
export async function inspectMp4(read: ByteReader, fileSize: number): Promise<VideoCheck> {
  const warnings: string[] = [];
  try {
    // Walk top-level boxes: find moov/mdat order (faststart) + the moov location.
    let off = 0, idx = 0, moovIdx = -1, mdatIdx = -1;
    let moov: { start: number; size: number } | null = null;
    while (off + 8 <= fileSize) {
      const head = await read(off, 16);
      if (head.byteLength < 8) break;
      let size = head.getUint32(0);
      const type = fourcc(head, 4);
      let header = 8;
      if (size === 1) { size = Number(head.getBigUint64(8)); header = 16; }
      else if (size === 0) { size = fileSize - off; }
      if (type === 'moov') { moov = { start: off + header, size: size - header }; moovIdx = idx; }
      if (type === 'mdat') { mdatIdx = idx; }
      idx++;
      if (size <= 0) break;
      off += size;
      if (moovIdx >= 0 && mdatIdx >= 0) break;
    }

    if (moovIdx < 0) return { ok: true, warnings: [] }; // not a parseable MP4 — don't flag

    const faststart = (moovIdx >= 0 && mdatIdx >= 0) ? moovIdx < mdatIdx : true;
    if (!faststart) warnings.push('The video index (moov atom) is at the end — the #1 cause of “can’t play” on Android. Needs faststart.');

    let info: VideoCheck['info'] = { faststart };
    if (moov) {
      const len = Math.min(moov.size, 6 * 1024 * 1024, Math.max(0, fileSize - moov.start));
      const mv = await read(moov.start, len);
      const codecs = parseMoov(mv, mv.byteLength);
      info = { faststart, ...codecs };
      if (codecs.videoCodec && !/avc/i.test(codecs.videoCodec)) warnings.push(`Video codec is ${codecs.videoCodec.toUpperCase()}, not H.264 — Android WhatsApp may fail to play it.`);
      if (codecs.audioCodec && !/mp4a/i.test(codecs.audioCodec)) warnings.push(`Audio codec is ${codecs.audioCodec}, not AAC.`);
      if (codecs.fps && codecs.fps > 31) warnings.push(`${Math.round(codecs.fps)} fps is high — 30 fps is safest for Android.`);
    }

    return { ok: warnings.length === 0, warnings, info };
  } catch {
    return { ok: true, warnings: [] }; // never block on a parse error
  }
}
