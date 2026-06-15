'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles, Plus, Trash2, Send, Loader2, ImagePlus, X,
  Check, MessageSquare, Bot, AlertTriangle, Package, Tags, GitBranch,
} from 'lucide-react';
import { MANAGER_MODEL } from '@/lib/manager-model';

/* ── types ───────────────────────────────────────────────────────── */

type MediaType = 'image' | 'video';
interface ChatImage { assetId: string; description: string; type?: MediaType; }
interface CardImage { url: string; description?: string; type?: MediaType; }
interface DisplayCard {
  kind: 'product' | 'category';
  id: string; title: string; subtitle?: string;
  price?: string | null; description?: string | null;
  attributes?: { label: string; value: string }[];
  images: CardImage[];
}
interface ChatMessage { role: 'user' | 'assistant'; content: string; images?: ChatImage[]; cards?: DisplayCard[]; createdAt?: string; }
interface PendingAction { toolCallId: string; name: string; summary: string; args: Record<string, any>; }
interface ChatDoc { id: string; title: string; messages: ChatMessage[]; pendingActions: PendingAction[] | null; attachedImages?: ChatImage[]; }
interface ChatSummary { id: string; title: string; updatedAt: string; }

interface Attachment { localId: string; assetId?: string; description: string; previewUrl: string; type: MediaType; uploading: boolean; error?: string; }

const MAX_IMAGE = 5  * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;

function mediaUrl(assetId: string): string { return `/api/inventory/media/${assetId}`; }

/** POST and consume a Server-Sent Events stream. Calls onDelta per token; returns the final chat doc. */
async function streamSSE(url: string, body: unknown, onDelta: (t: string) => void): Promise<ChatDoc | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: ChatDoc | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const event = /event: (.*)/.exec(part)?.[1];
      const data  = /data: ([\s\S]*)/.exec(part)?.[1];
      if (!event || !data) continue;
      const parsed = JSON.parse(data);
      if (event === 'delta') onDelta(parsed.text);
      else if (event === 'done') final = parsed;
      else if (event === 'error') throw new Error(parsed.message);
    }
  }
  return final;
}

/* ── component ────────────────────────────────────────────────────── */

export default function ManagerChat() {
  const [chats, setChats]       = useState<ChatSummary[]>([]);
  const [chat, setChat]         = useState<ChatDoc | null>(null);
  const [input, setInput]       = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending]   = useState(false);
  const [applying, setApplying] = useState(false);
  const [booting, setBooting]   = useState(true);
  const [streamText, setStreamText] = useState<string | null>(null);  // live assistant tokens
  const [dragging, setDragging] = useState(false);

  const fileRef   = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const loadChats = useCallback(async () => {
    const res = await fetch('/api/manager/chats');
    if (res.ok) return (await res.json()) as ChatSummary[];
    return [];
  }, []);

  const openChat = useCallback(async (id: string) => {
    const res = await fetch(`/api/manager/chats/${id}`);
    if (res.ok) setChat(await res.json());
  }, []);

  const newChat = useCallback(async () => {
    const res = await fetch('/api/manager/chats', { method: 'POST' });
    if (!res.ok) return;
    const created = await res.json();
    setChat({ id: created.id, title: created.title, messages: [], pendingActions: null });
    setChats(prev => [{ id: created.id, title: created.title, updatedAt: new Date().toISOString() }, ...prev]);
  }, []);

  // Boot: load list, open the newest or create one.
  useEffect(() => {
    (async () => {
      const list = await loadChats();
      setChats(list);
      if (list.length) await openChat(list[0].id);
      else await newChat();
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat?.messages.length, chat?.pendingActions, sending, applying, streamText]);

  const deleteChat = async (id: string) => {
    if (!confirm('Delete this chat?')) return;
    await fetch(`/api/manager/chats/${id}`, { method: 'DELETE' });
    const list = await loadChats();
    setChats(list);
    if (chat?.id === id) {
      if (list.length) openChat(list[0].id);
      else newChat();
    }
  };

  /* ── image attachments ───────────────────────────────────────── */
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const localId = Math.random().toString(36).slice(2);
      const isVideo = file.type.startsWith('video');
      if (!isVideo && !file.type.startsWith('image')) continue;
      const type: MediaType = isVideo ? 'video' : 'image';
      const previewUrl = URL.createObjectURL(file);
      setAttachments(prev => [...prev, { localId, description: '', previewUrl, type, uploading: true }]);
      const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
      if (file.size > max) {
        setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, uploading: false, error: `too large (max ${Math.round(max / 1024 / 1024)}MB)` } : a));
        continue;
      }
      try {
        const signRes = await fetch('/api/inventory/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mimeType: file.type }),
        });
        const sign = await signRes.json();
        if (!signRes.ok || !sign.uploadUrl) throw new Error(sign.error || 'upload failed');
        const put = await fetch(sign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!put.ok) throw new Error(`upload failed (${put.status})`);
        setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, assetId: sign.assetId, uploading: false } : a));
      } catch (e) {
        setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, uploading: false, error: e instanceof Error ? e.message : 'failed' } : a));
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const setDesc = (localId: string, description: string) =>
    setAttachments(prev => prev.map(a => a.localId === localId ? { ...a, description } : a));
  const removeAttachment = (localId: string) =>
    setAttachments(prev => prev.filter(a => a.localId !== localId));

  const uploading = attachments.some(a => a.uploading);
  const canSend = !!chat && !sending && !uploading && !chat.pendingActions && (input.trim().length > 0 || attachments.some(a => a.assetId));

  /* ── send / apply ────────────────────────────────────────────── */
  const sendMessage = async (text: string, images: ChatImage[]) => {
    if (!chat || sending || applying) return;
    if (!text && images.length === 0) return;
    setSending(true);
    // optimistic user bubble; clear any open proposal (a message revises it).
    setChat(c => c ? { ...c, messages: [...c.messages, { role: 'user', content: text, images }], pendingActions: null } : c);
    setStreamText('');
    try {
      const updated = await streamSSE('/api/manager/chat',
        { chatId: chat.id, message: text, images },
        t => setStreamText(prev => (prev ?? '') + t));
      if (updated) {
        setChat(updated);
        setChats(prev => [{ id: updated.id, title: updated.title, updatedAt: new Date().toISOString() }, ...prev.filter(c => c.id !== updated.id)]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setChat(c => c ? { ...c, messages: [...c.messages, { role: 'assistant', content: `⚠️ ${msg}` }] } : c);
    } finally {
      setStreamText(null); setSending(false);
    }
  };

  const send = () => {
    if (!canSend) return;
    const images = attachments.filter(a => a.assetId).map(a => ({ assetId: a.assetId!, description: a.description, type: a.type }));
    const text = input.trim();
    setInput(''); setAttachments([]);
    sendMessage(text, images);
  };

  // Quick-send a suggested follow-up (chips / example prompts).
  const sendQuick = (text: string) => sendMessage(text, []);

  const apply = async (approve: boolean, imageAssignments?: Record<string, string[]>, actionEdits?: Record<string, Record<string, any>>) => {
    if (!chat) return;
    setApplying(true); setStreamText('');
    try {
      const updated = await streamSSE('/api/manager/apply',
        { chatId: chat.id, approve, imageAssignments, actionEdits },
        t => setStreamText(prev => (prev ?? '') + t));
      if (updated) setChat(updated);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      setChat(c => c ? { ...c, messages: [...c.messages, { role: 'assistant', content: `⚠️ ${msg}` }] } : c);
    } finally {
      setStreamText(null); setApplying(false);
    }
  };

  /* ── drag & drop (whole window) ──────────────────────────────── */
  const canDrop = !!chat && !chat.pendingActions && !sending;
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: React.DragEvent) => { if (!hasFiles(e) || !canDrop) return; e.preventDefault(); dragDepth.current++; setDragging(true); };
  const onDragOver  = (e: React.DragEvent) => { if (hasFiles(e) && canDrop) e.preventDefault(); };
  const onDragLeave = (e: React.DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth.current = 0; setDragging(false);
    if (canDrop) onFiles(e.dataTransfer.files);
  };

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <div className="h-full flex bg-[#0b141a] overflow-hidden relative"
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {/* drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-[#0b141a]/85 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-[#25D366]/60 rounded-3xl px-10 py-8 text-center">
            <ImagePlus size={36} className="mx-auto mb-3 text-[#25D366]" />
            <p className="text-white font-semibold text-sm">Drop images or videos to attach</p>
            <p className="text-white/40 text-xs mt-1">They’ll upload and the manager will add them where you tell it</p>
          </div>
        </div>
      )}
      {/* sessions rail */}
      <aside className="hidden md:flex flex-col w-60 border-r border-white/8 shrink-0">
        <div className="p-3">
          <button onClick={newChat}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#25D366] text-black hover:bg-[#22c55e] transition-all">
            <Plus size={14} /> New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {chats.map(c => (
            <div key={c.id}
              onClick={() => openChat(c.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                chat?.id === c.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}>
              <MessageSquare size={13} className="shrink-0 opacity-60" />
              <span className="flex-1 min-w-0 truncate text-xs">{c.title}</span>
              <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-red-400 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* header */}
        <div className="px-6 py-4 border-b border-white/8 shrink-0 flex items-center gap-3">
          <div className="w-9 h-9 bg-[#25D366]/15 rounded-xl flex items-center justify-center">
            <Sparkles size={18} className="text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">AI Manager</h1>
            <p className="text-white/40 text-xs">Chat to manage inventory, flows, the sales agent & get insights</p>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {booting ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/30" /></div>
            ) : chat && chat.messages.length === 0 ? (
              <EmptyState onPick={sendQuick} />
            ) : (
              // Suggestion chips only on the latest assistant message.
              chat?.messages.map((m, i) => (
                <Bubble key={i} m={m} onPick={!streamText && i === chat.messages.length - 1 ? sendQuick : undefined} />
              ))
            )}

            {streamText ? (
              <Bubble m={{ role: 'assistant', content: streamText }} />
            ) : (sending || applying) ? (
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <Loader2 size={13} className="animate-spin" /> Thinking…
              </div>
            ) : null}

            {/* proposal — interactive grouping plan */}
            {chat?.pendingActions && (
              <PlanProposal
                key={`${chat.id}:${chat.pendingActions.length}`}
                actions={chat.pendingActions}
                attachedImages={chat.attachedImages ?? []}
                applying={applying}
                onApprove={(assignments, edits) => apply(true, assignments, edits)}
                onCancel={() => apply(false)}
                onRefine={sendQuick}
              />
            )}
          </div>
        </div>

        {/* composer */}
        <div className="border-t border-white/8 px-4 md:px-6 py-3 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map(a => (
                  <div key={a.localId} className="flex gap-2 bg-[#1f2c34] border border-white/8 rounded-lg p-2">
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-white/5 shrink-0 relative">
                      {a.type === 'video'
                        ? <video src={a.previewUrl} className="w-full h-full object-cover" muted />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={a.previewUrl} alt="" className="w-full h-full object-cover" />}
                      {a.uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-white" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <input value={a.description} onChange={e => setDesc(a.localId, e.target.value)}
                        placeholder={a.type === 'video' ? 'Describe this video…' : 'Describe this image…'}
                        className="w-full bg-transparent text-white text-[11px] placeholder:text-white/25 focus:outline-none" />
                      {a.error && <p className="text-red-400 text-[10px]">{a.error}</p>}
                    </div>
                    <button onClick={() => removeAttachment(a.localId)} className="p-0.5 text-white/30 hover:text-red-400 self-start"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={e => onFiles(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={!chat || !!chat.pendingActions}
                title="Attach images or videos"
                className="p-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all shrink-0">
                <ImagePlus size={16} />
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder={chat?.pendingActions ? 'Approve or cancel the changes above to continue…' : 'Describe products to add, ask for insights, build a flow…'}
                disabled={!chat || !!chat.pendingActions}
                className="flex-1 bg-[#1f2c34] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#25D366]/50 resize-none max-h-32 disabled:opacity-50"
              />
              <button onClick={send} disabled={!canSend}
                className="p-2.5 rounded-xl bg-[#25D366] text-black hover:bg-[#22c55e] disabled:opacity-30 transition-all shrink-0">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-white/30 text-[10px]">
              <Sparkles size={10} className="text-[#25D366]/60" />
              <span>Model: <span className="text-white/50 font-medium">{MANAGER_MODEL}</span></span>
              <span className="text-white/15">·</span>
              <span>responses stream live · changes need your approval</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── subcomponents ────────────────────────────────────────────────── */

/* ── lightweight markdown ─────────────────────────────────────────── */

/** Render inline markdown: **bold**, *italic*, `code`, [links](url). */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\))/;
  let rest = text;
  let k = 0;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { nodes.push(rest); break; }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyBase}-${k++}`;
    if (tok.startsWith('**') || tok.startsWith('__')) nodes.push(<strong key={key} className="font-semibold text-white">{m[2] || m[3]}</strong>);
    else if (tok.startsWith('`')) nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-black/30 text-[#25D366] text-[0.85em]">{m[4]}</code>);
    else if (tok.startsWith('[')) nodes.push(<a key={key} href={m[8]} target="_blank" rel="noreferrer" className="text-[#34B7F1] underline">{m[7]}</a>);
    else nodes.push(<em key={key} className="italic">{m[5] || m[6]}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return nodes;
}

/** Block-level markdown: headings, bullet/numbered lists, paragraphs. */
function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let bi = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{renderInline(it, `li${bi}-${i}`)}</li>);
    blocks.push(list.ordered
      ? <ol key={`b${bi++}`} className="list-decimal pl-5 space-y-0.5 my-1">{items}</ol>
      : <ul key={`b${bi++}`} className="list-disc pl-5 space-y-0.5 my-1">{items}</ul>);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);

    if (bullet) { if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); continue; }
    if (numbered) { if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(numbered[1]); continue; }
    flushList();
    if (heading) { blocks.push(<p key={`b${bi++}`} className="font-semibold text-white mt-1.5">{renderInline(heading[2], `h${bi}`)}</p>); continue; }
    if (line.trim() === '') continue;
    blocks.push(<p key={`b${bi++}`} className="leading-relaxed">{renderInline(line, `p${bi}`)}</p>);
  }
  flushList();
  return <div className="space-y-1.5">{blocks}</div>;
}

/** Pull a trailing "::suggestions:: a | b | c" marker out of a message. */
function extractSuggestions(content: string): { text: string; suggestions: string[] } {
  const trimmed = content.trimEnd();
  const m = /\n*::suggestions::[ \t]*(.+)$/i.exec(trimmed);
  if (!m) return { text: content, suggestions: [] };
  const suggestions = m[1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
  return { text: trimmed.slice(0, m.index).trim(), suggestions };
}

/* ── rich product / category cards ────────────────────────────────── */

function CardGrid({ cards }: { cards: DisplayCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
      {cards.map(c => (
        <div key={c.id} className="bg-[#1f2c34] border border-white/10 rounded-2xl overflow-hidden hover:border-[#25D366]/30 transition-colors">
          {c.images.length > 0 ? (
            <div className={`grid gap-0.5 ${c.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {c.images.slice(0, 4).map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noreferrer" title={img.description || `Open ${img.type === 'video' ? 'video' : 'image'}`}
                  className={`block bg-white/5 ${c.images.length === 1 ? 'aspect-[4/3]' : 'aspect-square'}`}>
                  {img.type === 'video'
                    ? <video src={img.url} className="w-full h-full object-cover" muted />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={img.url} alt={img.description || c.title} className="w-full h-full object-cover" />}
                </a>
              ))}
            </div>
          ) : (
            <div className="aspect-[4/3] bg-white/5 flex items-center justify-center text-white/20">
              {c.kind === 'category' ? <Tags size={22} /> : <Package size={22} />}
            </div>
          )}
          <div className="p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-white text-sm font-semibold leading-tight">{c.title}</p>
              {c.price && <span className="shrink-0 text-[#25D366] text-xs font-medium">{c.price}</span>}
            </div>
            {c.subtitle && <p className="text-white/40 text-[11px]">{c.subtitle}</p>}
            {c.attributes && c.attributes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.attributes.map((a, i) => (
                  <span key={i} className="text-[9px] bg-white/8 text-white/55 px-1.5 py-0.5 rounded-full">{a.label}: <span className="text-white/75">{a.value}</span></span>
                ))}
              </div>
            )}
            {c.description && <p className="text-white/45 text-[11px] leading-snug line-clamp-3">{c.description}</p>}
            {c.images.length > 4 && <p className="text-white/30 text-[10px]">+{c.images.length - 4} more image{c.images.length - 4 !== 1 ? 's' : ''}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bubble({ m, onPick }: { m: ChatMessage; onPick?: (t: string) => void }) {
  // A pure card message (no text) renders just the card grid, full width.
  if (m.role === 'assistant' && m.cards && m.cards.length > 0 && !m.content) {
    return (
      <div className="flex gap-2.5">
        <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-[#25D366]/15">
          <Bot size={14} className="text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0"><CardGrid cards={m.cards} /></div>
      </div>
    );
  }
  const isUser = m.role === 'user';
  const { text, suggestions } = isUser ? { text: m.content, suggestions: [] as string[] } : extractSuggestions(m.content);

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center ${isUser ? 'bg-white/10' : 'bg-[#25D366]/15'}`}>
        {isUser ? <span className="text-white/60 text-[10px] font-bold">You</span> : <Bot size={14} className="text-[#25D366]" />}
      </div>
      <div className={`max-w-[85%] space-y-2 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {m.images && m.images.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${isUser ? 'justify-end' : ''}`}>
            {m.images.map((img, i) => (
              <div key={i} className="w-28 bg-[#1f2c34] border border-white/8 rounded-xl overflow-hidden">
                <div className="w-full h-24 bg-white/5">
                  {img.type === 'video'
                    ? <video src={mediaUrl(img.assetId)} className="w-full h-full object-cover" controls muted />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={mediaUrl(img.assetId)} alt={img.description} className="w-full h-full object-cover" />}
                </div>
                {img.description && <p className="text-white/50 text-[10px] leading-snug px-2 py-1.5 line-clamp-3">{img.description}</p>}
              </div>
            ))}
          </div>
        )}
        {text && (
          isUser ? (
            <div className="rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words bg-[#25D366] text-black">{text}</div>
          ) : (
            <div className="rounded-2xl px-4 py-3 text-sm bg-[#1f2c34] text-white/85 border border-white/5">
              <Markdown text={text} />
            </div>
          )
        )}
        {suggestions.length > 0 && onPick && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => onPick(s)}
                className="px-3 py-1.5 rounded-full text-[11px] bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/25 hover:bg-[#25D366]/20 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  const examples = [
    'Add 3 sarees under a new “Banarasi Silk” category (I’ll attach photos & describe each)',
    'How did my messages perform this week, and what should I improve?',
    'Build a welcome flow: greet, wait 1 min, then send our returns policy',
    'Make Riya’s replies a bit shorter and more formal',
  ];
  return (
    <div className="text-center py-10 text-white/30">
      <Sparkles size={32} className="mx-auto mb-3 text-[#25D366]/50" />
      <p className="text-sm text-white/50">Your AI business manager</p>
      <p className="text-xs mt-1">Tap one to start:</p>
      <div className="mt-4 space-y-2 max-w-md mx-auto">
        {examples.map((e, i) => (
          <button key={i} onClick={() => onPick(e)}
            className="block w-full text-left text-xs text-white/55 bg-[#1f2c34] border border-white/8 rounded-lg px-3 py-2.5 hover:border-[#25D366]/40 hover:text-white/80 transition-all">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── interactive grouping plan (confirm-first) ─────────────────────── */

const INV_ACTIONS = new Set(['create_category', 'create_product', 'create_variant']);
const normRef = (r: string) => String(r).replace(/^(vid|img):/i, '');

interface EditFields { name: string; priceRange: string; description: string; attributes: { label: string; value: string }[]; }
const prefix = (a: PendingAction) => a.name === 'create_category' ? '📁 ' : a.name === 'create_variant' ? '↳ ' : '';

function PlanProposal({ actions, attachedImages, applying, onApprove, onCancel, onRefine }: {
  actions: PendingAction[];
  attachedImages: ChatImage[];
  applying: boolean;
  onApprove: (assignments: Record<string, string[]>, actionEdits: Record<string, Record<string, any>>) => void;
  onCancel: () => void;
  onRefine: (instruction: string) => void;
}) {
  const [refine, setRefine] = useState('');
  const submitRefine = () => { const t = refine.trim(); if (!t) return; setRefine(''); onRefine(t); };
  const invActions   = actions.filter(a => INV_ACTIONS.has(a.name));
  const otherActions = actions.filter(a => !INV_ACTIONS.has(a.name));

  // assetId -> toolCallId ('' = unassigned)
  const [assign, setAssign] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const img of attachedImages) init[img.assetId] = '';
    for (const a of actions) for (const r of (a.args.imageRefs ?? [])) {
      const id = normRef(r);
      if (id) init[id] = a.toolCallId;
    }
    return init;
  });

  // Editable copy of each action's fields (owner can fix mistakes before approving).
  const [fields, setFields] = useState<Record<string, EditFields>>(() => {
    const m: Record<string, EditFields> = {};
    for (const a of invActions) m[a.toolCallId] = {
      name: a.args.name ?? '',
      priceRange: a.args.priceRange ?? '',
      description: a.args.description ?? '',
      attributes: Array.isArray(a.args.variantAttributes)
        ? a.args.variantAttributes.map((x: any) => ({ label: String(x.label ?? ''), value: String(x.value ?? '') }))
        : [],
    };
    return m;
  });
  const setField = (id: string, patch: Partial<EditFields>) => setFields(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  const setAttr = (id: string, i: number, patch: Partial<{ label: string; value: string }>) =>
    setFields(p => ({ ...p, [id]: { ...p[id], attributes: p[id].attributes.map((a, idx) => idx === i ? { ...a, ...patch } : a) } }));
  const addAttr = (id: string) => setFields(p => ({ ...p, [id]: { ...p[id], attributes: [...p[id].attributes, { label: '', value: '' }] } }));
  const removeAttr = (id: string, i: number) => setFields(p => ({ ...p, [id]: { ...p[id], attributes: p[id].attributes.filter((_, idx) => idx !== i) } }));
  const labelFor = (a: PendingAction) => `${prefix(a)}${fields[a.toolCallId]?.name || a.args.name || a.summary}`;

  const descById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const img of attachedImages) m[img.assetId] = img.description || '';
    return m;
  }, [attachedImages]);
  const typeById = useMemo(() => {
    const m: Record<string, MediaType> = {};
    for (const img of attachedImages) m[img.assetId] = img.type === 'video' ? 'video' : 'image';
    return m;
  }, [attachedImages]);

  const imagesFor = (toolCallId: string) =>
    attachedImages.filter(img => assign[img.assetId] === toolCallId).map(img => img.assetId);
  const unassigned = attachedImages.filter(img => !assign[img.assetId]);
  const targets = invActions.map(a => ({ id: a.toolCallId, label: labelFor(a) }));
  const move = (assetId: string, toolCallId: string) => setAssign(prev => ({ ...prev, [assetId]: toolCallId }));

  const approve = () => {
    const assignments: Record<string, string[]> = {};
    const edits: Record<string, Record<string, any>> = {};
    for (const a of invActions) {
      assignments[a.toolCallId] = [];
      const f = fields[a.toolCallId];
      const e: Record<string, any> = { name: f.name.trim(), description: f.description };
      if (a.name !== 'create_category') e.priceRange = f.priceRange;
      if (a.name === 'create_variant') e.variantAttributes = f.attributes.filter(x => x.label.trim() && x.value.trim());
      edits[a.toolCallId] = e;
    }
    for (const img of attachedImages) {
      const t = assign[img.assetId];
      // Keep the media type in the token so videos stay videos when reassigned.
      if (t && assignments[t]) assignments[t].push(`${typeById[img.assetId] === 'video' ? 'vid' : 'img'}:${img.assetId}`);
    }
    onApprove(assignments, edits);
  };

  const categoryActions = invActions.filter(a => a.name === 'create_category');
  const productActions  = invActions.filter(a => a.name === 'create_product');
  const variantActions  = invActions.filter(a => a.name === 'create_variant');

  const groupNames = Array.from(new Set([
    ...categoryActions.map(a => String(a.args.name)),
    ...productActions.map(a => String(a.args.categoryName || 'Uncategorised')),
  ]));
  const productNames = new Set(productActions.map(p => String(p.args.name ?? '').toLowerCase()));
  const variantsFor = (productName: string) =>
    variantActions.filter(v => String(v.args.parentName ?? '').toLowerCase() === productName.toLowerCase());
  const orphanVariants = variantActions.filter(v => !productNames.has(String(v.args.parentName ?? '').toLowerCase()));

  const Thumb = ({ assetId }: { assetId: string }) => (
    <div className="flex gap-1.5 bg-[#111b21] border border-white/8 rounded-lg p-1.5">
      <div className="w-10 h-10 rounded-md overflow-hidden bg-white/5 shrink-0">
        {typeById[assetId] === 'video'
          ? <video src={mediaUrl(assetId)} className="w-full h-full object-cover" muted />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={mediaUrl(assetId)} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        {descById[assetId] && <p className="text-white/40 text-[9px] leading-tight line-clamp-2">{descById[assetId]}</p>}
        <select value={assign[assetId] || ''} onChange={e => move(assetId, e.target.value)}
          className="bg-[#1f2c34] border border-white/10 rounded px-1 py-1 text-white/70 text-[9px] focus:outline-none focus:border-[#25D366]/50">
          <option value="">— Unassigned —</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
    </div>
  );

  const editCls = 'bg-[#1f2c34] border border-white/10 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:border-[#25D366]/50';
  const ProductBlock = ({ a, isVariant }: { a: PendingAction; isVariant?: boolean }) => {
    const imgs = imagesFor(a.toolCallId);
    const f = fields[a.toolCallId];
    return (
      <div className={`rounded-lg border border-white/8 p-2.5 space-y-2 ${isVariant ? 'bg-white/3 ml-4' : 'bg-[#111b21]/60'}`}>
        <div className="flex items-center gap-2">
          {isVariant ? <GitBranch size={11} className="text-white/40 shrink-0" /> : <Package size={12} className="text-white/40 shrink-0" />}
          <input value={f.name} onChange={e => setField(a.toolCallId, { name: e.target.value })}
            placeholder="Product name" className={`${editCls} flex-1 min-w-0 font-medium`} />
          <input value={f.priceRange} onChange={e => setField(a.toolCallId, { priceRange: e.target.value })}
            placeholder="Price" className={`${editCls} w-20 text-[#25D366]`} />
        </div>
        {isVariant && (
          <div className="flex flex-wrap items-center gap-1.5 pl-5">
            {f.attributes.map((at, i) => (
              <span key={i} className="flex items-center gap-1 bg-white/5 rounded-full pl-1 pr-0.5 py-0.5">
                <input value={at.label} onChange={e => setAttr(a.toolCallId, i, { label: e.target.value })}
                  placeholder="label" className="bg-transparent text-white/55 text-[9px] w-12 focus:outline-none text-right" />
                <span className="text-white/30 text-[9px]">:</span>
                <input value={at.value} onChange={e => setAttr(a.toolCallId, i, { value: e.target.value })}
                  placeholder="value" className="bg-transparent text-white/80 text-[9px] w-12 focus:outline-none" />
                <button onClick={() => removeAttr(a.toolCallId, i)} className="text-white/25 hover:text-red-400 p-0.5"><X size={9} /></button>
              </span>
            ))}
            <button onClick={() => addAttr(a.toolCallId)} className="text-[#25D366]/80 hover:text-[#25D366] text-[9px] flex items-center gap-0.5"><Plus size={9} /> attribute</button>
          </div>
        )}
        {imgs.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{imgs.map(id => <Thumb key={id} assetId={id} />)}</div>}
      </div>
    );
  };

  const refineBox = (
    <div className="flex items-center gap-2 pt-1">
      <input value={refine} onChange={e => setRefine(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitRefine(); } }}
        disabled={applying}
        placeholder="Not quite right? Tell me what to change (e.g. “these are 3 separate products under Cotton Sarees, not variants”)"
        className="flex-1 bg-[#111b21] border border-white/10 rounded-lg px-3 py-1.5 text-white text-[11px] placeholder:text-white/25 focus:outline-none focus:border-[#25D366]/50 disabled:opacity-40" />
      <button onClick={submitRefine} disabled={applying || !refine.trim()}
        className="px-3 py-1.5 rounded-lg text-[11px] border border-white/15 text-white/70 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all shrink-0">
        Revise plan
      </button>
    </div>
  );

  // Non-inventory-only plans (flows / settings / drafts): simple checklist.
  if (invActions.length === 0) {
    return (
      <div className="bg-[#1f2c34] border border-[#F0B429]/40 rounded-2xl p-4 space-y-3">
        <p className="text-[#F0B429] text-xs font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> Confirm these changes</p>
        <ul className="space-y-1.5">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-white/80 text-xs"><Check size={13} className="text-[#25D366] mt-0.5 shrink-0" /><span>{a.summary}</span></li>
          ))}
        </ul>
        {refineBox}
        <PlanButtons applying={applying} onApprove={approve} onCancel={onCancel} />
      </div>
    );
  }

  return (
    <div className="bg-[#1f2c34] border border-[#F0B429]/40 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-[#F0B429] text-xs font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> Review the grouping, then approve</p>
        <p className="text-white/40 text-[11px] mt-1">I grouped these into categories, products and variants. You can edit any name, price or attribute, and re-map each photo using its dropdown, before approving.</p>
      </div>

      {/* category → products → variants */}
      <div className="space-y-2.5">
        {groupNames.map(gName => {
          const catAction = categoryActions.find(c => String(c.args.name) === gName);
          const prods = productActions.filter(p => String(p.args.categoryName || 'Uncategorised') === gName);
          return (
            <div key={gName} className="rounded-xl border border-white/10 bg-[#0b141a]/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Tags size={13} className="text-[#25D366] shrink-0" />
                {catAction
                  ? <input value={fields[catAction.toolCallId]?.name ?? gName} onChange={e => setField(catAction.toolCallId, { name: e.target.value })}
                      className="bg-[#1f2c34] border border-white/10 rounded px-1.5 py-1 text-white text-sm font-semibold focus:outline-none focus:border-[#25D366]/50 flex-1 min-w-0" />
                  : <span className="text-white text-sm font-semibold flex-1">{gName}</span>}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${catAction ? 'bg-[#25D366]/15 text-[#25D366]' : 'bg-white/10 text-white/40'}`}>
                  {catAction ? 'new category' : 'existing category'}
                </span>
              </div>
              {catAction && imagesFor(catAction.toolCallId).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{imagesFor(catAction.toolCallId).map(id => <Thumb key={id} assetId={id} />)}</div>
              )}
              {prods.length > 0 ? (
                <div className="space-y-2">
                  {prods.map(p => (
                    <div key={p.toolCallId} className="space-y-2">
                      <ProductBlock a={p} />
                      {variantsFor(String(p.args.name)).map(v => <ProductBlock key={v.toolCallId} a={v} isVariant />)}
                    </div>
                  ))}
                </div>
              ) : <p className="text-white/30 text-[11px]">Category only.</p>}
            </div>
          );
        })}

        {orphanVariants.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#0b141a]/40 p-3 space-y-2">
            <div className="flex items-center gap-2"><GitBranch size={13} className="text-white/50" /><span className="text-white text-sm font-semibold">Variants of existing products</span></div>
            {orphanVariants.map(v => <ProductBlock key={v.toolCallId} a={v} isVariant />)}
          </div>
        )}
      </div>

      {/* unassigned images */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-dashed border-white/20 p-3 space-y-2">
          <p className="text-white/50 text-xs flex items-center gap-1.5"><ImagePlus size={12} /> Unassigned images — pick where each belongs</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">{unassigned.map(img => <Thumb key={img.assetId} assetId={img.assetId} />)}</div>
        </div>
      )}

      {/* other (non-inventory) changes */}
      {otherActions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-white/40 text-[11px] uppercase tracking-wider">Other changes</p>
          {otherActions.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-white/80 text-xs"><Check size={13} className="text-[#25D366] mt-0.5 shrink-0" /><span>{a.summary}</span></div>
          ))}
        </div>
      )}

      {refineBox}
      <PlanButtons applying={applying} onApprove={approve} onCancel={onCancel} />
    </div>
  );
}

function PlanButtons({ applying, onApprove, onCancel }: { applying: boolean; onApprove: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <button onClick={onApprove} disabled={applying}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-[#25D366] text-black font-medium hover:bg-[#22c55e] disabled:opacity-40 transition-all">
        {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve &amp; apply
      </button>
      <button onClick={onCancel} disabled={applying}
        className="px-4 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-all">
        Cancel
      </button>
    </div>
  );
}
