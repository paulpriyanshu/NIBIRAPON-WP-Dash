'use client';
import { useEffect, useState, useRef } from 'react';
import { History, Send, Copy, Trash2, Edit2, Check, X, Plus, ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react';
import { TemplateHistorySkeleton } from '@/components/ui/Skeletons';

interface Snapshot {
  id: string;
  label: string;
  templateName: string;
  language: string;
  bodyParams: string[];
  headerParam: string;
  headerMediaUrl: string | null;
  recipients: string[];
  sentCount: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface SendProgress { sent: number; failed: number; total: number; done: boolean; campaignId?: string; }

export default function TemplateHistory() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, SendProgress>>({});
  const [editDraft, setEditDraft] = useState<Partial<Snapshot>>({});
  const esRef = useRef<EventSource | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/template-snapshots');
    const data = await res.json();
    setSnapshots(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (snap: Snapshot) => {
    setEditingId(snap.id);
    setEditDraft({
      label: snap.label,
      bodyParams: [...snap.bodyParams],
      headerParam: snap.headerParam,
      headerMediaUrl: snap.headerMediaUrl ?? '',
      recipients: [...snap.recipients],
      language: snap.language,
    });
  };

  const saveEdit = async (id: string) => {
    await fetch(`/api/template-snapshots/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    });
    setEditingId(null);
    load();
  };

  const deleteSnap = async (id: string) => {
    if (!confirm('Delete this template history entry?')) return;
    await fetch(`/api/template-snapshots/${id}`, { method: 'DELETE' });
    setSnapshots((p) => p.filter((s) => s.id !== id));
  };

  const duplicate = async (id: string) => {
    await fetch(`/api/template-snapshots/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'duplicate' }),
    });
    load();
  };

  const resend = (snap: Snapshot) => {
    if (sendingId) return;
    setSendingId(snap.id);
    setProgress((p) => ({ ...p, [snap.id]: { sent: 0, failed: 0, total: snap.recipients.length, done: false } }));

    const es = new EventSource(`/api/template-snapshots/${snap.id}`);
    esRef.current = es;

    // SSE not supported for POST — use fetch with streaming
    es.close();

    fetch(`/api/template-snapshots/${snap.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resend', recipients: snap.recipients }),
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim());
            if (ev.type === 'progress') {
              setProgress((p) => ({ ...p, [snap.id]: { sent: ev.sentCount, failed: ev.failedCount, total: ev.total, done: false } }));
            }
            if (ev.type === 'done') {
              setProgress((p) => ({ ...p, [snap.id]: { sent: ev.sent, failed: ev.failed, total: ev.total, done: true, campaignId: ev.campaignId } }));
              setSendingId(null);
              load();
            }
          } catch {}
        }
      }
    }).catch(() => setSendingId(null));
  };

  if (loading) {
    return <TemplateHistorySkeleton count={4} />;
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-[#667781] gap-3">
        <History size={36} className="opacity-40" />
        <p className="text-sm">No template sends yet.</p>
        <p className="text-xs text-center max-w-xs">Send a template from the chat window or Templates tab — it will appear here so you can reuse or resend it.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {snapshots.map((snap) => {
        const isEditing = editingId === snap.id;
        const isSending = sendingId === snap.id;
        const prog = progress[snap.id];
        const isExpanded = expandedId === snap.id;

        return (
          <div key={snap.id} className="bg-white dark:bg-[#1f2c34] rounded-xl border border-gray-200 dark:border-[#2a3942] overflow-hidden">
            {/* Card header */}
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    value={editDraft.label ?? ''}
                    onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                    className="w-full text-sm font-semibold bg-transparent border-b border-[#25D366] outline-none text-[#111b21] dark:text-[#e9edef] pb-0.5"
                    placeholder="Label"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[#111b21] dark:text-[#e9edef] truncate">{snap.label}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-[#25D366] font-mono">{snap.templateName}</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#667781]">•</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#667781]">{snap.recipients.length} recipient{snap.recipients.length !== 1 ? 's' : ''}</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#667781]">•</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#667781]">{new Date(snap.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${snap.source === 'dm' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`}>
                    {snap.source === 'dm' ? 'DM' : 'Template Tab'}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              {isEditing ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => saveEdit(snap.id)} className="p-1.5 rounded-lg bg-[#25D366] text-white hover:bg-[#22c55e]" title="Save">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 hover:bg-gray-200 dark:hover:bg-[#3a4a52]" title="Cancel">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => resend(snap)}
                    disabled={!!sendingId}
                    className="p-1.5 rounded-lg bg-[#25D366] text-white hover:bg-[#22c55e] disabled:opacity-40"
                    title="Resend"
                  >
                    {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                  <button onClick={() => startEdit(snap)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3a4a52]" title="Edit">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => duplicate(snap.id)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3a4a52]" title="Duplicate">
                    <Copy size={14} />
                  </button>
                  <button onClick={() => deleteSnap(snap.id)} className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40" title="Delete">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => setExpandedId(isExpanded ? null : snap.id)} className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#2a3942] text-gray-500 dark:text-[#8696a0] hover:bg-gray-200 dark:hover:bg-[#3a4a52]">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              )}
            </div>

            {/* Send progress bar */}
            {prog && (
              <div className="px-4 pb-2">
                <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-[#8696a0] mb-1">
                  <span>{prog.done ? 'Done' : 'Sending…'} {prog.sent}/{prog.total}</span>
                  {prog.failed > 0 && <span className="text-red-400">{prog.failed} failed</span>}
                </div>
                <div className="h-1 bg-gray-100 dark:bg-[#2a3942] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#25D366] rounded-full transition-all duration-300"
                    style={{ width: `${prog.total > 0 ? (prog.sent / prog.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-[#2a3942] pt-3 space-y-3">
                {/* Body params */}
                {isEditing && snap.bodyParams.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-1.5">Body Variables</p>
                    <div className="flex flex-col gap-1.5">
                      {(editDraft.bodyParams ?? snap.bodyParams).map((val, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 w-8">{`{{${i + 1}}}`}</span>
                          <input
                            value={val}
                            onChange={(e) => {
                              const next = [...(editDraft.bodyParams ?? snap.bodyParams)];
                              next[i] = e.target.value;
                              setEditDraft((d) => ({ ...d, bodyParams: next }));
                            }}
                            className="flex-1 text-xs bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-[#3a4a52] rounded-lg px-2 py-1 outline-none text-[#111b21] dark:text-[#e9edef]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recipients */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide flex items-center gap-1">
                      <Users size={10} /> Recipients ({isEditing ? (editDraft.recipients ?? snap.recipients).length : snap.recipients.length})
                    </p>
                    {isEditing && (
                      <button
                        onClick={() => setEditDraft((d) => ({ ...d, recipients: [...(d.recipients ?? snap.recipients), ''] }))}
                        className="text-[10px] text-[#25D366] flex items-center gap-0.5 hover:underline"
                      >
                        <Plus size={10} /> Add number
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {(isEditing ? editDraft.recipients ?? snap.recipients : snap.recipients).map((phone, i) => (
                      isEditing ? (
                        <div key={i} className="flex items-center gap-1">
                          <input
                            value={phone}
                            onChange={(e) => {
                              const next = [...(editDraft.recipients ?? snap.recipients)];
                              next[i] = e.target.value;
                              setEditDraft((d) => ({ ...d, recipients: next }));
                            }}
                            className="text-xs font-mono bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-[#3a4a52] rounded-lg px-2 py-1 outline-none w-36 text-[#111b21] dark:text-[#e9edef]"
                          />
                          <button
                            onClick={() => {
                              const next = [...(editDraft.recipients ?? snap.recipients)];
                              next.splice(i, 1);
                              setEditDraft((d) => ({ ...d, recipients: next }));
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <span key={i} className="text-[11px] font-mono bg-gray-50 dark:bg-[#2a3942] text-[#111b21] dark:text-[#e9edef] px-2 py-0.5 rounded-lg">{phone}</span>
                      )
                    ))}
                  </div>
                </div>

                {/* Header param (if set) */}
                {snap.headerParam && !isEditing && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-1">Header</p>
                    <p className="text-xs text-[#111b21] dark:text-[#e9edef] truncate">{snap.headerParam}</p>
                  </div>
                )}
                {isEditing && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide mb-1">Header Image URL</p>
                    <input
                      value={editDraft.headerMediaUrl ?? ''}
                      onChange={(e) => setEditDraft((d) => ({ ...d, headerMediaUrl: e.target.value }))}
                      className="w-full text-xs bg-gray-50 dark:bg-[#2a3942] border border-gray-200 dark:border-[#3a4a52] rounded-lg px-2 py-1 outline-none text-[#111b21] dark:text-[#e9edef]"
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
