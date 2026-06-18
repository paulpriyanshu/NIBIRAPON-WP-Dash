import { ObjectId } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import { db } from '@/db';
import { messages, conversations } from '@/db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import { sendRichTemplateMessage, sendMPMTemplateMessage, sendTextMessage, sendMediaMessage, uploadMedia } from '@/lib/whatsapp-api';
import { getSendUrl, r2HasPublicBase } from '@/lib/inventory-media';
import {
  compileFlow, resolveNext,
  templateSendInfo, templatesInFlow, getTemplate, templateKindFlags,
  textNodeContent, textNodeLabel, textNodeMedia, isSendableNode,
  customNodeMessageId, nodeReplyOptions, findRootNodes, nodeShortLabel, orderedSendableNodes,
  type Flow, type FlowButton, type FlowNode, type CompiledFlow,
} from '@/lib/flow-engine';
import { configToSendPayload } from '@/lib/templates';
import { getCustomMessage } from '@/lib/custom-message-store';
import { sendCustomMessage } from '@/lib/custom-message-send';

/** Send a template node with its configured params (handles MPM/catalog). Returns the wamid. */
async function sendNodeTemplate(flow: Flow, nodeId: string, to: string): Promise<string | undefined> {
  const node = flow.nodes.find(n => n.id === nodeId) as FlowNode | undefined;
  const info = templateSendInfo(node);
  const t = getTemplate(node);
  if (!info || !t) return undefined;

  const p = flow.templateParams?.[nodeId] ?? { bodyParams: [] };
  const { isMPM, isCatalog } = templateKindFlags(t);

  // Header media uploaded/picked from the library is stored as an R2 asset key —
  // resolve it to a fetchable URL (the link WhatsApp pulls). A pasted URL wins if set.
  const headerMediaUrl = p.headerMediaUrl?.trim()
    || (p.headerMediaAssetId ? await getSendUrl(p.headerMediaAssetId) : undefined);
  // Match the parameter type to the template's header format (image/video/document).
  const headerFormat = t.components.find(c => c.type === 'HEADER')?.format;
  const headerMediaType = headerFormat === 'VIDEO' ? 'video' : headerFormat === 'DOCUMENT' ? 'document' : 'image';

  const payload = configToSendPayload(to, info.name, info.language, { ...p, headerMediaUrl, headerMediaType, isMPM, isCatalog });
  const res = payload.kind === 'mpm'
    ? await sendMPMTemplateMessage(payload.args)
    : await sendRichTemplateMessage(payload.args);
  return res?.messages?.[0]?.id;
}

/** What a sent flow node produced — used for persistence/logging. */
interface SentNode {
  msgId?: string; label: string; isTemplate: boolean; text?: string;
  // Present when the node sent a photo/video (message node with media).
  media?: { type: 'image' | 'video'; displayUrl: string | null; caption?: string };
  // True when the node sent an interactive custom message (list / reply buttons).
  interactive?: boolean;
}

/**
 * Send whatever a flow node represents — a WhatsApp template or a custom text
 * message — and return its wamid + a label. Returns null for non-sendable nodes.
 */
async function sendFlowNode(flow: Flow, nodeId: string, to: string): Promise<SentNode | null> {
  const node = flow.nodes.find(n => n.id === nodeId) as FlowNode | undefined;
  if (!isSendableNode(node)) return null;

  if (node!.type === 'textNode') {
    const text  = (textNodeContent(node) ?? '').trim();
    const media = textNodeMedia(node);
    const label = textNodeLabel(node);

    // Message node with a photo/video: send it as a media message, using the
    // typed text as its caption (so "media + message" is one WhatsApp message).
    if (media) {
      const sendUrl = media.assetId ? await getSendUrl(media.assetId) : media.url;
      if (!sendUrl) { console.warn(`[flow] media node ${nodeId} ("${label}") has no sendable URL — skipping`); return { label, isTemplate: false }; }
      // When the node opts to send media standalone, drop the caption entirely.
      const noCaption = !!(node!.data as { noCaption?: boolean }).noCaption;
      const caption = noCaption ? undefined : (text || media.caption || undefined);
      const displayUrl = media.assetId ? `/api/inventory/media/${media.assetId}` : (media.url ?? null);
      const mime = media.mimeType || (media.type === 'video' ? 'video/mp4' : 'image/jpeg');

      // A "clean" URL is a public, unsigned link (custom domain / r2.dev, or a
      // pasted URL). WhatsApp's video fetcher accepts those by `link` but rejects
      // signed presigned URLs — so only those need the upload-to-id path.
      const cleanUrl = !!media.url || (!!media.assetId && r2HasPublicBase());

      try {
        // Video over a presigned (signed) URL → upload the bytes to WhatsApp for a
        // media_id and send by id (validates once, clear error). Clean public URLs
        // and all images use the simpler, proven link method.
        let mediaId: string | undefined;
        if (media.type === 'video' && !cleanUrl) {
          const resp = await fetch(sendUrl);
          if (!resp.ok) throw new Error(`couldn't fetch the stored video (${resp.status})`);
          const up = await uploadMedia(await resp.arrayBuffer(), mime);
          if (up?.id) mediaId = up.id;
          else throw new Error(up?.error?.message || 'WhatsApp rejected the video — it must be MP4 (H.264 video + AAC audio), ≤16 MB');
        }

        const res = mediaId
          ? await sendMediaMessage({ to, type: media.type, mediaId, caption })
          : await sendMediaMessage({ to, type: media.type, mediaUrl: sendUrl, caption });
        console.log(`[flow] ${media.type} sent for node ${nodeId} waId=${res?.messages?.[0]?.id ?? 'none'}`);
        return { msgId: res?.messages?.[0]?.id, label, isTemplate: false, text: caption, media: { type: media.type, displayUrl, caption } };
      } catch (e) {
        // Don't halt the whole flow — log the reason and record a failed message
        // in the inbox so the admin can see exactly why the media didn't send.
        const reason = e instanceof Error ? e.message : 'send failed';
        console.error(`[flow] media send failed for node ${nodeId} ("${label}"):`, reason);
        return { label, isTemplate: false, text: `⚠ ${media.type} not sent — ${reason}` };
      }
    }

    if (!text) { console.warn(`[flow] text node ${nodeId} ("${label}") is empty — skipping send`); return { label, isTemplate: false, text: '' }; }
    const res = await sendTextMessage({ to, text });
    return { msgId: res?.messages?.[0]?.id, label, isTemplate: false, text };
  }

  // Custom (in-session) message node — text / media / reply-buttons / option list.
  if (node!.type === 'customNode') {
    const id = customNodeMessageId(node);
    const label = (node!.data as { label?: string } | undefined)?.label || 'Custom message';
    if (!id) { console.warn(`[flow] custom node ${nodeId} has no message selected`); return { label, isTemplate: false }; }
    const m = await getCustomMessage(id);
    if (!m) { console.warn(`[flow] custom message ${id} not found`); return { label, isTemplate: false, text: '⚠ custom message not found' }; }
    console.log(`[flow] sending custom message "${m.name}" (${m.type}) id=${id} → ${to}`);
    try {
      const r = await sendCustomMessage(to, m);
      console.log(`[flow] ✓ custom message "${m.name}" sent waId=${r.msgId ?? 'none'}`);
      if (r.recordType === 'image' || r.recordType === 'video') {
        return { msgId: r.msgId, label, isTemplate: false, text: r.text, media: { type: r.recordType, displayUrl: r.mediaUrl ?? null, caption: m.caption } };
      }
      return { msgId: r.msgId, label, isTemplate: false, text: r.text, interactive: r.recordType === 'interactive' };
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'send failed';
      console.error(`[flow] custom message send failed for node ${nodeId} ("${label}"):`, reason);
      return { label, isTemplate: false, text: `⚠ message not sent — ${reason}` };
    }
  }

  const info = templateSendInfo(node);
  if (!info) return null;
  const msgId = await sendNodeTemplate(flow, nodeId, to);
  return { msgId, label: info.name, isTemplate: true };
}

const DB    = 'nibiraponcollections';
const FLOWS = 'flows';
const RUNS  = 'flow_runs';

export async function flowsColl() { return (await getMongoClient()).db(DB).collection(FLOWS); }
export async function runsColl()  { return (await getMongoClient()).db(DB).collection<FlowRun>(RUNS); }

/** Canonical phone (matches the webhook): bare 10-digit Indian number → prepend 91. */
export function canonicalPhone(raw: string): string {
  const s = (raw || '').replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(s)) return `91${s}`;
  return s;
}

/* ── Run shape ───────────────────────────────────────────────────────────────── */

export interface FlowRun {
  _id?: ObjectId;
  flowId: string;
  rootNodeId: string;
  phone: string;
  contactId: string | null;
  conversationId: string | null;
  currentNodeId: string;
  currentButtons: FlowButton[];
  lastTemplateMsgId: string | null;
  // WhatsApp id of the root message sent at launch — lets us track delivery of
  // the initial send (lastTemplateMsgId moves on as the run advances).
  rootMsgId?: string | null;
  status: 'active' | 'completed' | 'stopped';
  startedAt: Date;
  updatedAt: Date;
  steps: { at: Date; button: string; toNode: string }[];
  // Open tap-wait points — every node currently showing reply buttons the customer
  // can tap to branch. A run can wait on several at once (fan-out).
  armed?: ArmedNode[];
  // Scheduled delay continuations (Delay-node targets waiting to fire).
  due?: DueStep[];
  // Legacy single-pointer fields (pre-fan-out runs) — still read for in-flight runs.
  dueAt?: Date | null;
  dueNodeId?: string | null;
}

/** A node currently armed for button taps, with its options and the message it was sent on. */
interface ArmedNode { nodeId: string; buttons: FlowButton[]; msgId: string }
/** A delayed continuation waiting to fire. */
interface DueStep { at: Date; nodeId: string }

// Short delays run inline (setTimeout) for precise timing; longer ones are handed
// to the cron tick so we don't block the request for too long.
const INLINE_DELAY_CAP_SEC = 45;
const FANOUT_CAP = 50;            // max nodes auto-sent in one fan-out (cycle/explosion guard)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Accumulates the result of a fan-out: messages sent, new tap-waits, scheduled delays. */
interface FanCtx {
  flow: Flow;
  compiled: CompiledFlow;
  phone: string;
  conversationId: string | null;
  bizPhone: string;
  armed: ArmedNode[];                 // open tap-waits after this fan-out
  due: DueStep[];                     // scheduled delays after this fan-out
  steps: { at: Date; button: string; toNode: string }[];
  lastNodeId: string;
  lastMsgId: string;
  visited: Set<string>;
  sends: number;
}

/** Send one node, persist it to the inbox, and record a traversal step. */
async function deliverNode(ctx: FanCtx, nodeId: string, label: string): Promise<string | null> {
  let sent: SentNode | null;
  try {
    sent = await sendFlowNode(ctx.flow, nodeId, ctx.phone);
  } catch (e) {
    console.error(`[flow] send failed for node ${nodeId}:`, e instanceof Error ? e.message : e);
    return null;
  }
  if (!sent) return null;
  const msgId = sent.msgId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await persistFlowMessage({
    msgId, conversationId: ctx.conversationId, bizPhone: ctx.bizPhone, phone: ctx.phone,
    status: sent.msgId ? 'sent' : 'failed',
    kind: sent.interactive ? 'interactive' : sent.isTemplate ? 'template' : 'text',
    templateName: sent.label, text: sent.text, media: sent.media,
  });
  ctx.steps.push({ at: new Date(), button: label, toNode: nodeId });
  ctx.lastNodeId = nodeId;
  ctx.lastMsgId = msgId;
  console.log(`[flow] sent "${sent.label}" (${label}) to ${ctx.phone} waId=${sent.msgId ?? 'none'}`);
  return msgId;
}

/**
 * Process a node's outgoing edges after it was delivered (msgId known):
 *  - if it has a Button Router → arm it for taps (waits),
 *  - immediate children → send right away (fan-out, depth-first),
 *  - delay children → short ones inline, long ones scheduled for the tick.
 * All three can coexist on one node.
 */
async function spread(ctx: FanCtx, nodeId: string, msgId: string): Promise<void> {
  const entry = ctx.compiled.transitions[nodeId];
  if (!entry) return;

  const opts = nodeReplyOptions(ctx.compiled.nodesById[nodeId]);
  if (Object.keys(entry.buttons).length > 0 && opts.length > 0) {
    ctx.armed.push({ nodeId, buttons: opts, msgId });
  }

  for (const next of entry.immediates) {
    await enter(ctx, next, '(message)');
  }

  for (const d of entry.delays) {
    if (d.seconds > INLINE_DELAY_CAP_SEC) {
      ctx.due.push({ at: new Date(Date.now() + d.seconds * 1000), nodeId: d.nextId });
    } else {
      if (d.seconds > 0) await sleep(d.seconds * 1000);
      await enter(ctx, d.nextId, '(delay)');
    }
  }
}

/** Deliver a node then fan out from it (cycle- and explosion-guarded). */
async function enter(ctx: FanCtx, nodeId: string, label: string): Promise<void> {
  if (ctx.visited.has(nodeId) || ctx.sends >= FANOUT_CAP) return;
  ctx.visited.add(nodeId);
  ctx.sends++;
  const msgId = await deliverNode(ctx, nodeId, label);
  if (!msgId) return;
  await spread(ctx, nodeId, msgId);
}

/** Persist a fan-out's result onto the run. Completes the run when nothing is left
 *  to wait on (no armed taps, no scheduled delays). */
async function persistFan(runId: ObjectId, ctx: FanCtx): Promise<void> {
  const runs = await runsColl();
  const terminal = ctx.armed.length === 0 && ctx.due.length === 0;
  await runs.updateOne(
    { _id: runId },
    {
      $set: {
        armed: ctx.armed,
        due: ctx.due,
        currentNodeId: ctx.lastNodeId,
        currentButtons: ctx.armed.flatMap(a => a.buttons),
        lastTemplateMsgId: ctx.lastMsgId,
        status: terminal ? 'completed' : 'active',
        updatedAt: new Date(),
        dueAt: null, dueNodeId: null,
      },
      ...(ctx.steps.length ? { $push: { steps: { $each: ctx.steps } } } : {}),
    },
  );
}

/** Open tap-waits for a run — new `armed` array, or derived from the legacy pointer. */
function normalizeArmed(run: FlowRun): ArmedNode[] {
  if (Array.isArray(run.armed)) return run.armed;
  if (run.currentButtons?.length) return [{ nodeId: run.currentNodeId, buttons: run.currentButtons, msgId: run.lastTemplateMsgId ?? '' }];
  return [];
}
/** Scheduled delays for a run — new `due` array, or derived from the legacy fields. */
function normalizeDue(run: FlowRun): DueStep[] {
  if (Array.isArray(run.due)) return run.due;
  if (run.dueAt && run.dueNodeId) return [{ at: run.dueAt, nodeId: run.dueNodeId }];
  return [];
}

/* ── Template lock (templates used by LIVE flows) ────────────────────────────── */

export async function getLockedTemplates(): Promise<{ templateName: string; flowId: string; flowName: string }[]> {
  const flows = await flowsColl();
  const live = await flows.find({ status: 'live' }).toArray();
  const out: { templateName: string; flowId: string; flowName: string }[] = [];
  const seen = new Set<string>();
  for (const f of live) {
    for (const name of templatesInFlow(f as unknown as Flow)) {
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ templateName: name, flowId: f._id.toString(), flowName: f.name });
    }
  }
  return out;
}

export async function isTemplateLocked(templateName: string): Promise<{ flowName: string } | null> {
  const locked = await getLockedTemplates();
  const hit = locked.find(l => l.templateName === templateName);
  return hit ? { flowName: hit.flowName } : null;
}

/* ── Persist a flow-sent template message into the inbox ─────────────────────── */

async function persistFlowMessage(opts: {
  msgId: string; conversationId: string | null; bizPhone: string; phone: string;
  status: 'sent' | 'failed';
  // A template send (default), a custom text message, or a media message.
  templateName?: string; text?: string; kind?: 'template' | 'text' | 'interactive';
  media?: { type: 'image' | 'video'; displayUrl: string | null; caption?: string };
}) {
  if (!opts.conversationId) return;

  const base = {
    id:             opts.msgId,
    conversationId: opts.conversationId,
    fromNumber:     opts.bizPhone,
    toNumber:       opts.phone,
    status:         opts.status,
    isOutgoing:     true,
    sentBy:         'flow' as const,
    sentAt:         new Date(),
  };

  if (opts.media) {
    await db.insert(messages).values({
      ...base,
      type:         opts.media.type,
      mediaUrl:     opts.media.displayUrl,
      mediaCaption: opts.media.caption ?? null,
      text:         opts.media.caption ?? `[Flow ${opts.media.type}]`,
    }).onConflictDoNothing();
  } else if (opts.kind === 'interactive') {
    await db.insert(messages).values({
      ...base,
      type:         'interactive',
      text:         opts.text ?? '',
    }).onConflictDoNothing();
  } else {
    const isText = opts.kind === 'text';
    await db.insert(messages).values({
      ...base,
      type:         isText ? 'text' : 'template',
      templateName: isText ? null : (opts.templateName ?? null),
      text:         isText ? (opts.text ?? '') : `[Flow] ${opts.templateName ?? ''}`,
    }).onConflictDoNothing();
  }

  await db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, opts.conversationId))
    .catch(() => {});
}

/* ── Create a run + send the root template (called by launch) ────────────────── */

export async function startRun(opts: {
  flow: Flow & { _id: string };
  rootNodeId: string;
  phone: string;            // already canonical
  contactId: string | null;
  conversationId: string | null;
  bizPhone: string;
}): Promise<{ ok: boolean; error?: string }> {
  const rootNode = opts.flow.nodes.find(n => n.id === opts.rootNodeId);
  const info = templateSendInfo(rootNode);
  if (!info) return { ok: false, error: 'Root node is not a valid template' };

  let waId: string | undefined;
  try {
    waId = await sendNodeTemplate(opts.flow, opts.rootNodeId, opts.phone);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }

  const msgId = waId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await persistFlowMessage({
    msgId, conversationId: opts.conversationId, bizPhone: opts.bizPhone,
    phone: opts.phone, templateName: info.name, kind: 'template', status: waId ? 'sent' : 'failed',
  });

  const runs = await runsColl();
  // One active flow per contact — stop ALL prior active runs for this phone
  // (across flows) so a stale run can't intercept the next button tap.
  await runs.updateMany(
    { phone: opts.phone, status: 'active' },
    { $set: { status: 'stopped', updatedAt: new Date() } },
  );
  const now = new Date();
  const compiled = compileFlow(opts.flow);
  const ins = await runs.insertOne({
    flowId:            opts.flow._id,
    rootNodeId:        opts.rootNodeId,
    phone:             opts.phone,
    contactId:         opts.contactId,
    conversationId:    opts.conversationId,
    currentNodeId:     opts.rootNodeId,
    currentButtons:    nodeReplyOptions(rootNode),
    lastTemplateMsgId: msgId,
    rootMsgId:         waId ?? null,
    status:            'active',
    startedAt:         now,
    updatedAt:         now,
    steps:             [],
    armed:             [],
    due:               [],
    dueAt:             null,
    dueNodeId:         null,
  } satisfies Omit<FlowRun, '_id'>);
  console.log(`[flow] run started phone=${opts.phone} flow=${opts.flow._id} root=${opts.rootNodeId} rootMsg=${msgId} buttons=${JSON.stringify(nodeReplyOptions(rootNode))}`);

  // The root is already sent — fan out from it: arm its buttons (if any), send any
  // immediate follow-ups, and schedule any delays.
  const ctx: FanCtx = {
    flow: opts.flow, compiled, phone: opts.phone, conversationId: opts.conversationId, bizPhone: opts.bizPhone,
    armed: [], due: [], steps: [], lastNodeId: opts.rootNodeId, lastMsgId: msgId,
    visited: new Set([opts.rootNodeId]), sends: 1,
  };
  await spread(ctx, opts.rootNodeId, msgId);
  await persistFan(ins.insertedId, ctx);

  return { ok: true };
}

/* ── Advance a run when the customer taps a quick-reply button ───────────────── */

export async function advanceRunOnButton(opts: {
  phone: string;            // canonical
  contextMsgId?: string;
  buttonText: string;
  conversationId: string;
  bizPhone: string;
}): Promise<boolean> {
  const runs = await runsColl();
  const flows = await flowsColl();

  // A contact may have more than one active run (re-launches / multiple flows).
  // Prefer the run whose current template matches the tapped message, and only
  // act on runs whose flow is live and can advance on this button.
  const active = await runs.find({ phone: opts.phone, status: 'active' }).sort({ startedAt: -1 }).toArray();
  if (active.length === 0) {
    console.log(`[flow] no active run for phone=${opts.phone}`);
    return false;
  }
  const ordered = opts.contextMsgId
    ? [
        ...active.filter(r => r.lastTemplateMsgId === opts.contextMsgId),
        ...active.filter(r => r.lastTemplateMsgId !== opts.contextMsgId),
      ]
    : active;

  for (const run of ordered) {
    let flow;
    try { flow = await flows.findOne({ _id: new ObjectId(run.flowId) }); } catch { continue; }
    if (!flow || flow.status !== 'live') {
      console.log(`[flow] skip run ${run._id} — flow ${run.flowId} status=${flow?.status}`);
      continue;
    }

    const compiled = compileFlow(flow as unknown as Flow);
    const armed = normalizeArmed(run as unknown as FlowRun);

    // Find an armed tap-wait whose router maps this button. Prefer the one whose
    // message the customer actually replied to (contextMsgId).
    let match = armed.find(a => (!opts.contextMsgId || a.msgId === opts.contextMsgId) && !!resolveNext(compiled, a.nodeId, opts.buttonText));
    if (!match) match = armed.find(a => !!resolveNext(compiled, a.nodeId, opts.buttonText));
    const nextId = match ? resolveNext(compiled, match.nodeId, opts.buttonText) : null;
    console.log(`[flow] tap "${opts.buttonText}" run=${run._id} armed=${armed.length} → match=${match?.nodeId ?? 'none'} next=${nextId ?? 'none'}`);
    if (!match || !nextId) continue;

    // The matched wait is consumed; other open waits (and scheduled delays) survive.
    const ctx: FanCtx = {
      flow: flow as unknown as Flow, compiled, phone: opts.phone,
      conversationId: opts.conversationId, bizPhone: opts.bizPhone,
      armed: armed.filter(a => a !== match), due: normalizeDue(run as unknown as FlowRun),
      steps: [], lastNodeId: run.currentNodeId, lastMsgId: run.lastTemplateMsgId ?? '',
      visited: new Set(), sends: 0,
    };
    await enter(ctx, nextId, opts.buttonText);   // delivers the branch target + fans out
    await persistFan(run._id, ctx);
    return true;
  }

  console.log(`[flow] no live run could advance for phone=${opts.phone} button="${opts.buttonText}"`);
  return false;
}

/* ── Fire scheduled delay steps (called by the cron tick) ────────────────────── */

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

export async function runDueSteps(now = new Date()): Promise<{ fired: number }> {
  const runs = await runsColl();
  const flows = await flowsColl();
  // Runs with a delay due now — new `due` array or the legacy single field.
  const dueRuns = await runs.find({
    status: 'active',
    $or: [{ 'due.at': { $lte: now } }, { dueAt: { $ne: null, $lte: now } }],
  }).limit(50).toArray();
  let fired = 0;

  for (const run of dueRuns) {
    const dueList = normalizeDue(run as unknown as FlowRun);
    const fire = dueList.filter(d => d.at <= now);
    const remaining = dueList.filter(d => d.at > now);
    if (!fire.length) continue;

    let flow;
    try { flow = await flows.findOne({ _id: new ObjectId(run.flowId) }); } catch { continue; }
    if (!flow || flow.status !== 'live') {
      await runs.updateOne({ _id: run._id }, { $set: { due: remaining, dueAt: null, dueNodeId: null } });
      continue;
    }

    const compiled = compileFlow(flow as unknown as Flow);
    const ctx: FanCtx = {
      flow: flow as unknown as Flow, compiled, phone: run.phone,
      conversationId: run.conversationId, bizPhone: PHONE_NUMBER_ID,
      armed: normalizeArmed(run as unknown as FlowRun), due: remaining,
      steps: [], lastNodeId: run.currentNodeId, lastMsgId: run.lastTemplateMsgId ?? '',
      visited: new Set(), sends: 0,
    };
    for (const d of fire) await enter(ctx, d.nodeId, '(delay)');
    await persistFan(run._id, ctx);
    fired += fire.length;
  }

  return { fired };
}

/* ── Flow tracking (delivery + funnel analytics) ─────────────────────────────── */

export interface FunnelStep { nodeId: string; label: string; type: string; count: number }
export interface FlowTracking {
  sent: number;          // users the flow was launched to (one run each)
  delivered: number;     // root message confirmed delivered/read by WhatsApp
  started: number;       // runs that advanced past the root at least once
  completed: number;     // runs that reached a flow endpoint
  active: number;        // runs still in progress
  stopped: number;       // runs superseded by a newer launch
  total: number;
  funnel: FunnelStep[];  // sendable nodes (root → deeper), with how many runs reached each
}

/**
 * Analytics for a single flow: launch/delivery/engagement counts plus a per-node
 * funnel of how far runs travelled. Delivery comes from the root message's
 * WhatsApp status; the funnel from the nodes each run has occupied.
 */
export async function getFlowTracking(flowId: string): Promise<FlowTracking> {
  const runs = await runsColl();
  const flows = await flowsColl();

  const [active, completed, stopped, started] = await Promise.all([
    runs.countDocuments({ flowId, status: 'active' }),
    runs.countDocuments({ flowId, status: 'completed' }),
    runs.countDocuments({ flowId, status: 'stopped' }),
    runs.countDocuments({ flowId, 'steps.0': { $exists: true } }),
  ]);
  const total = active + completed + stopped;

  // Delivered: how many runs' root messages WhatsApp confirmed delivered/read.
  const rootDocs = await runs
    .find({ flowId, rootMsgId: { $ne: null } }, { projection: { rootMsgId: 1 } })
    .toArray();
  const rootIds = rootDocs.map(r => r.rootMsgId).filter((x): x is string => !!x);
  let delivered = 0;
  if (rootIds.length) {
    const [row] = await db
      .select({ n: count() })
      .from(messages)
      .where(and(inArray(messages.id, rootIds), inArray(messages.status, ['delivered', 'read'])));
    delivered = row?.n ?? 0;
  }

  // Per-node reach: a run "reached" the root node and every node it advanced to.
  const reachAgg = await runs.aggregate<{ _id: string; count: number }>([
    { $match: { flowId } },
    { $project: { nodes: { $setUnion: [['$rootNodeId'], { $map: { input: { $ifNull: ['$steps', []] }, as: 's', in: '$$s.toNode' } }] } } },
    { $unwind: '$nodes' },
    { $group: { _id: '$nodes', count: { $sum: 1 } } },
  ]).toArray();
  const reachByNode = new Map<string, number>(reachAgg.map(r => [r._id, r.count]));

  // Order the funnel along the flow spine (root → deeper).
  let funnel: FunnelStep[] = [];
  try {
    const flowDoc = await flows.findOne({ _id: new ObjectId(flowId) });
    if (flowDoc) {
      const flow = flowDoc as unknown as Flow;
      const roots = findRootNodes(flow);
      const rootId = (flowDoc.rootNodeId && roots.includes(flowDoc.rootNodeId)) ? flowDoc.rootNodeId : roots[0];
      if (rootId) {
        funnel = orderedSendableNodes(flow, rootId).map(nodeId => {
          const node = flow.nodes.find(n => n.id === nodeId);
          return { nodeId, label: nodeShortLabel(node), type: node?.type ?? 'node', count: reachByNode.get(nodeId) ?? 0 };
        });
      }
    }
  } catch { /* funnel is best-effort */ }

  return { sent: total, delivered, started, completed, active, stopped, total, funnel };
}
