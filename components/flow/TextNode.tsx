'use client';
import { useState, useRef } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { MessageSquare, X, ImagePlus, Loader2, Film, Trash2, Link2, Images, ChevronUp, ChevronDown } from 'lucide-react';
import MediaPicker from './MediaPicker';

interface FlowMedia { type: 'image' | 'video'; assetId?: string; url?: string; mimeType?: string; bytes?: number; }

const MAX_IMAGE = 5  * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;
// WhatsApp won't SEND videos larger than this — flow media goes over WhatsApp.
const WA_VIDEO_SEND_LIMIT = 16 * 1024 * 1024;

function mediaSrc(m: FlowMedia): string {
  if (m.assetId) return `/api/inventory/media/${m.assetId}`;
  return m.url || '';
}

// A custom message the flow sends, then immediately continues to the next node
// (no button tap needed). It can be plain text, one or more photos/videos sent in
// order (with the text as the first item's caption), or standalone media.
export default function TextNode({ id, data, selected }: NodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlType, setUrlType] = useState<'image' | 'video'>('image');
  const fileRef = useRef<HTMLInputElement>(null);

  const name      = (data.name as string) ?? 'Message';
  const content   = (data.content as string) ?? '';
  const noCaption = (data.noCaption as boolean) ?? false;
  // New nodes store an ordered list; older nodes a single `media`.
  const mediaList: FlowMedia[] = Array.isArray(data.mediaList as FlowMedia[])
    ? (data.mediaList as FlowMedia[])
    : (data.media ? [data.media as FlowMedia] : []);

  // Any mutation writes `mediaList` and clears the legacy single `media`.
  const setList = (list: FlowMedia[]) => updateNodeData(id, { mediaList: list, media: undefined });
  const addMedia = (m: FlowMedia) => setList([...mediaList, m]);
  const removeMedia = (i: number) => setList(mediaList.filter((_, idx) => idx !== i));
  const moveMedia = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= mediaList.length) return;
    const next = [...mediaList];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    const added: FlowMedia[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video');
      if (!isVideo && !file.type.startsWith('image')) { setError('Only image or video'); continue; }
      const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
      if (file.size > max) { setError(`${file.name}: too large (max ${Math.round(max / 1024 / 1024)}MB)`); continue; }
      setUploading(true);
      try {
        const signRes = await fetch('/api/inventory/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type }),
        });
        const sign = await signRes.json();
        if (!signRes.ok || !sign.uploadUrl) throw new Error(sign.error || 'upload failed');
        const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!put.ok) throw new Error(`upload failed (${put.status})`);
        added.push({ type: isVideo ? 'video' : 'image', assetId: sign.assetId, mimeType: file.type, bytes: file.size });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'upload failed');
      }
    }
    if (added.length) setList([...mediaList, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addUrl = () => {
    const v = urlValue.trim();
    if (!v) return;
    addMedia({ type: urlType, url: v });
    setUrlValue(''); setShowUrl(false);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-[#161429] border rounded-xl w-[250px] shadow-xl transition-all ${
        selected ? 'border-indigo-400/70 shadow-[0_0_0_3px_rgba(129,140,248,0.12)]' : 'border-indigo-400/25 hover:border-indigo-400/50'
      }`}
    >
      <Handle type="target" position={Position.Top}
        style={{ background: '#818cf8', border: '2.5px solid #161429', width: 13, height: 13, top: -7 }} />

      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-indigo-400/10">
        <div className="w-7 h-7 bg-indigo-500/15 rounded-lg flex items-center justify-center shrink-0">
          <MessageSquare size={13} className="text-indigo-300" />
        </div>
        <input
          value={name}
          onChange={e => updateNodeData(id, { name: e.target.value })}
          placeholder="Message name"
          className="flex-1 min-w-0 bg-transparent text-indigo-100 text-[11px] font-semibold focus:outline-none placeholder:text-indigo-300/40 nodrag"
        />
        <button style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
          onClick={() => deleteElements({ nodes: [{ id }] })}
          className="p-0.5 rounded hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors">
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* media attachments — sent in order */}
        <div className="space-y-1.5">
          <label className="text-white/25 text-[9px] uppercase tracking-wider block">
            Photos / videos (optional){mediaList.length > 1 ? ` · ${mediaList.length}, sent in order` : ''}
          </label>

          {mediaList.map((m, i) => (
            <div key={i} className="space-y-1">
              <div className="flex gap-2 bg-[#0b141a] border border-white/8 rounded-lg p-1.5">
                <span className="text-white/20 text-[9px] w-3 text-right shrink-0 self-center">{i + 1}</span>
                <div className="w-11 h-11 rounded-md overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                  {m.type === 'video'
                    ? <video src={mediaSrc(m)} className="w-full h-full object-cover" muted />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={mediaSrc(m)} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-white/60 text-[10px] flex items-center gap-1">
                    {m.type === 'video' ? <Film size={9} /> : <ImagePlus size={9} />} {m.type}
                    <span className="text-white/25">· {m.assetId ? 'uploaded' : 'url'}</span>
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 shrink-0 nodrag">
                  <button onClick={() => moveMedia(i, -1)} disabled={i === 0}
                    className="p-0.5 rounded text-white/25 hover:text-white/70 disabled:opacity-20"><ChevronUp size={11} /></button>
                  <button onClick={() => moveMedia(i, 1)} disabled={i === mediaList.length - 1}
                    className="p-0.5 rounded text-white/25 hover:text-white/70 disabled:opacity-20"><ChevronDown size={11} /></button>
                </div>
                <button onClick={() => removeMedia(i)}
                  className="p-1 rounded text-white/25 hover:text-red-400 hover:bg-red-500/10 self-start nodrag">
                  <Trash2 size={11} />
                </button>
              </div>
              {m.type === 'video' && (m.bytes ?? 0) > WA_VIDEO_SEND_LIMIT && (
                <p className="text-amber-400/90 text-[9px] leading-tight">⚠ {(m.bytes! / 1024 / 1024).toFixed(0)} MB — WhatsApp won’t send videos over 16 MB.</p>
              )}
              {m.type === 'video' && m.mimeType && !/^video\/(mp4|3gpp)$/i.test(m.mimeType) && (
                <p className="text-amber-400/90 text-[9px] leading-tight">⚠ {m.mimeType} — WhatsApp only sends MP4 (H.264 + AAC).</p>
              )}
            </div>
          ))}

          {/* add controls — always available so you can stack several */}
          <div className="flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => onFiles(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-all nodrag">
              {uploading ? <Loader2 size={10} className="animate-spin" /> : <ImagePlus size={10} />}
              {uploading ? 'Uploading…' : mediaList.length ? 'Add more' : 'Attach'}
            </button>
            <button onClick={() => setShowLibrary(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all nodrag">
              <Images size={10} /> Library
            </button>
            <button onClick={() => setShowUrl(s => !s)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all nodrag">
              <Link2 size={10} /> URL
            </button>
          </div>

          {showLibrary && (
            <MediaPicker
              onPick={m => addMedia({ type: m.type, assetId: m.assetId, url: m.url })}
              onClose={() => setShowLibrary(false)}
            />
          )}
          {showUrl && (
            <div className="flex items-center gap-1 nodrag">
              <select value={urlType} onChange={e => setUrlType(e.target.value as 'image' | 'video')}
                className="bg-[#0b141a] border border-white/10 rounded px-1 py-1 text-white/70 text-[9px] focus:outline-none">
                <option value="image">img</option>
                <option value="video">vid</option>
              </select>
              <input value={urlValue} onChange={e => setUrlValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addUrl())}
                placeholder="public media URL"
                className="flex-1 min-w-0 bg-[#0b141a] border border-white/8 rounded px-1.5 py-1 text-white/80 text-[10px] focus:outline-none focus:border-indigo-400/40" />
              <button onClick={addUrl} disabled={!urlValue.trim()}
                className="px-1.5 py-1 rounded text-[10px] bg-white/10 text-white/70 hover:bg-white/15 disabled:opacity-40">Add</button>
            </div>
          )}
          {error && <p className="text-red-400 text-[9px]">{error}</p>}
        </div>

        {/* text / caption */}
        <div className="space-y-1.5">
          {mediaList.length > 0 && (
            <label className="flex items-center gap-1.5 text-white/50 text-[10px] cursor-pointer select-none nodrag">
              <input type="checkbox" checked={noCaption}
                onChange={e => updateNodeData(id, { noCaption: e.target.checked })}
                className="accent-indigo-400" />
              Send media on their own (no caption)
            </label>
          )}

          {mediaList.length > 0 && noCaption ? (
            <p className="text-indigo-300/40 text-[9px]">Sends the {mediaList.length > 1 ? 'media in order' : 'media'} as standalone message{mediaList.length > 1 ? 's' : ''}, then continues.</p>
          ) : (
            <div>
              <label className="text-white/25 text-[9px] uppercase tracking-wider mb-1.5 block">
                {mediaList.length > 0 ? 'Caption (optional)' : 'Message text'}
              </label>
              <textarea
                value={content}
                onChange={e => updateNodeData(id, { content: e.target.value })}
                placeholder={mediaList.length > 0 ? 'Caption sent with the first item…' : 'Type the message the flow will send…'}
                rows={3}
                className="w-full bg-[#0b141a] border border-white/8 rounded-lg px-2.5 py-1.5 text-white/80 text-[11px] leading-relaxed focus:outline-none focus:border-indigo-400/40 resize-none transition-colors nodrag"
              />
              <p className="text-indigo-300/40 text-[9px] mt-1.5">
                {mediaList.length > 1
                  ? 'Sends each photo/video in order (caption on the first), then continues.'
                  : mediaList.length === 1
                    ? 'Sends the media with this caption, then continues to the next node.'
                    : 'Sends this text, then continues to the next node.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#818cf8', border: '2.5px solid #161429', width: 13, height: 13, bottom: -7 }} />
    </div>
  );
}
