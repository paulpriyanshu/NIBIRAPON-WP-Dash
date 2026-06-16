import { ObjectId } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import { db } from '@/db';
import { messages, conversations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendRichTemplateMessage, sendMPMTemplateMessage, sendTextMessage, sendMediaMessage, uploadMedia } from '@/lib/whatsapp-api';
import { getSendUrl, r2HasPublicBase } from '@/lib/inventory-media';
import {
  compileFlow, resolveNext, hasOnward, delayAfter, quickReplyButtons,
  templateSendInfo, templatesInFlow, getTemplate, templateKindFlags,
  textNodeContent, textNodeLabel, textNodeMedia, isSendableNode,
  type Flow, type FlowButton, type FlowNode, type CompiledFlow,
} from '@/lib/flow-engine';
import { configToSendPayload } from '@/lib/templates';

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
  status: 'active' | 'completed' | 'stopped';
  startedAt: Date;
  updatedAt: Date;
  steps: { at: Date; button: string; toNode: string }[];
  // Scheduled delay auto-advance (template → Delay node → next template)
  dueAt?: Date | null;
  dueNodeId?: string | null;
}

// Short delays run inline (setTimeout) for precise timing; longer ones are left
// to the cron tick so we don't block the request for too long.
const INLINE_DELAY_CAP_SEC = 45;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The next step the flow takes on its own, without a customer tap:
 *  - a Delay node after a template → wait N seconds, then send the target
 *  - a text node → it sends, then flows straight on to its next node (0 wait)
 * Returns null when the flow should wait for a button tap (or has ended).
 */
function nextAutoStep(compiled: CompiledFlow, nodeId: string): { seconds: number; nextId: string } | null {
  const d = delayAfter(compiled, nodeId);
  if (d) return d;
  const node = compiled.nodesById[nodeId];
  if (node?.type === 'textNode') {
    const def = compiled.transitions[nodeId]?.default;
    if (def) return { seconds: 0, nextId: def };
  }
  return null;
}

/**
 * After a node was sent, run the flow's automatic steps: Delay-node waits and
 * text-message nodes (which fire and immediately continue). Chains until it
 * reaches a template that waits for a tap, a long delay (handed to cron), or the
 * end. Aborts if the customer advances the run (taps a button) during a wait.
 */
async function runAutoChain(args: {
  flow: Flow; compiled: CompiledFlow; runId: ObjectId; phone: string;
  conversationId: string | null; bizPhone: string; fromNodeId: string;
}): Promise<void> {
  const runs = await runsColl();
  let current = args.fromNodeId;

  for (let guard = 0; guard < 50; guard++) {
    const step = nextAutoStep(args.compiled, current);
    if (!step) { await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } }); return; }

    if (step.seconds > INLINE_DELAY_CAP_SEC) {
      // Too long to hold the request — hand off to the cron tick.
      await runs.updateOne({ _id: args.runId }, { $set: { dueAt: new Date(Date.now() + step.seconds * 1000), dueNodeId: step.nextId } });
      return;
    }

    if (step.seconds > 0) await sleep(step.seconds * 1000);

    // If the customer moved the run on (tapped a button) while we waited, stop.
    const fresh = await runs.findOne({ _id: args.runId });
    if (!fresh || fresh.status !== 'active' || fresh.currentNodeId !== current) return;

    let sent: SentNode | null;
    try {
      sent = await sendFlowNode(args.flow, step.nextId, args.phone);
      console.log(`[flow] auto-step (${step.seconds}s) fired → sent "${sent?.label ?? '?'}" to ${args.phone} waId=${sent?.msgId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] auto-step send failed:`, e instanceof Error ? e.message : e);
      await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } });
      return;
    }
    if (!sent) { await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } }); return; }

    const node = args.compiled.nodesById[step.nextId];
    const msgId = sent.msgId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: args.conversationId, bizPhone: args.bizPhone, phone: args.phone,
      status: sent.msgId ? 'sent' : 'failed',
      kind: sent.isTemplate ? 'template' : 'text', templateName: sent.label, text: sent.text, media: sent.media,
    });

    const terminal = !hasOnward(args.compiled, step.nextId);
    await runs.updateOne(
      { _id: args.runId },
      {
        $set: {
          currentNodeId: step.nextId, currentButtons: quickReplyButtons(node),
          lastTemplateMsgId: msgId, status: terminal ? 'completed' : 'active',
          updatedAt: new Date(), dueAt: null, dueNodeId: null,
        },
        $push: { steps: { at: new Date(), button: step.seconds > 0 ? '(delay)' : '(message)', toNode: step.nextId } },
      },
    );
    if (terminal) return;
    current = step.nextId;
  }
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
  templateName?: string; text?: string; kind?: 'template' | 'text';
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
    currentButtons:    quickReplyButtons(rootNode),
    lastTemplateMsgId: msgId,
    status:            'active',
    startedAt:         now,
    updatedAt:         now,
    steps:             [],
    dueAt:             null,
    dueNodeId:         null,
  } satisfies Omit<FlowRun, '_id'>);
  console.log(`[flow] run started phone=${opts.phone} flow=${opts.flow._id} root=${opts.rootNodeId} rootMsg=${msgId} buttons=${JSON.stringify(quickReplyButtons(rootNode))}`);

  // Honour any auto-steps right after the root (Delay waits / text messages).
  await runAutoChain({
    flow: opts.flow, compiled, runId: ins.insertedId, phone: opts.phone,
    conversationId: opts.conversationId, bizPhone: opts.bizPhone, fromNodeId: opts.rootNodeId,
  });

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
    const nextId = resolveNext(compiled, run.currentNodeId, opts.buttonText);
    console.log(`[flow] try run node=${run.currentNodeId} button="${opts.buttonText}" → next=${nextId ?? 'none'} (buttons: ${JSON.stringify(compiled.transitions[run.currentNodeId]?.buttons ?? {})})`);
    if (!nextId) continue;

    const nextNode = compiled.nodesById[nextId];

    let sent: SentNode | null;
    try {
      sent = await sendFlowNode(flow as unknown as Flow, nextId, opts.phone);
      console.log(`[flow] sent next "${sent?.label ?? '?'}" → waId=${sent?.msgId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] advance send failed:`, e instanceof Error ? e.message : e);
      return false;
    }
    if (!sent) continue;

    const msgId = sent.msgId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: opts.conversationId, bizPhone: opts.bizPhone, phone: opts.phone,
      status: sent.msgId ? 'sent' : 'failed',
      kind: sent.isTemplate ? 'template' : 'text', templateName: sent.label, text: sent.text, media: sent.media,
    });

    const terminal = !hasOnward(compiled, nextId);
    await runs.updateOne(
      { _id: run._id },
      {
        $set: {
          currentNodeId:     nextId,
          currentButtons:    quickReplyButtons(nextNode),
          lastTemplateMsgId: msgId,
          status:            terminal ? 'completed' : 'active',
          updatedAt:         new Date(),
          dueAt:             null,
          dueNodeId:         null,
        },
        $push: { steps: { at: new Date(), button: opts.buttonText, toNode: nextId } },
      },
    );

    // Continue any automatic steps after this node (Delay waits / text messages).
    if (!terminal) {
      await runAutoChain({
        flow: flow as unknown as Flow, compiled, runId: run._id, phone: opts.phone,
        conversationId: opts.conversationId, bizPhone: opts.bizPhone, fromNodeId: nextId,
      });
    }
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
  const due = await runs.find({ status: 'active', dueAt: { $ne: null, $lte: now } }).limit(50).toArray();
  let fired = 0;

  for (const run of due) {
    const nodeId = run.dueNodeId;
    if (!nodeId) { await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } }); continue; }

    let flow;
    try { flow = await flows.findOne({ _id: new ObjectId(run.flowId) }); } catch { continue; }
    if (!flow || flow.status !== 'live') {
      await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } });
      continue;
    }

    const compiled = compileFlow(flow as unknown as Flow);
    const node = compiled.nodesById[nodeId];

    let sent: SentNode | null;
    try {
      sent = await sendFlowNode(flow as unknown as Flow, nodeId, run.phone);
      console.log(`[flow] delay fired → sent "${sent?.label ?? '?'}" to ${run.phone} waId=${sent?.msgId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] delay send failed:`, e instanceof Error ? e.message : e);
      // Clear the schedule so we don't hot-loop on a broken node.
      await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } });
      continue;
    }
    if (!sent) { await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } }); continue; }

    const msgId = sent.msgId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: run.conversationId, bizPhone: PHONE_NUMBER_ID, phone: run.phone,
      status: sent.msgId ? 'sent' : 'failed',
      kind: sent.isTemplate ? 'template' : 'text', templateName: sent.label, text: sent.text, media: sent.media,
    });

    const terminal = !hasOnward(compiled, nodeId);
    await runs.updateOne(
      { _id: run._id },
      {
        $set: {
          currentNodeId:     nodeId,
          currentButtons:    quickReplyButtons(node),
          lastTemplateMsgId: msgId,
          status:            terminal ? 'completed' : 'active',
          updatedAt:         new Date(),
          dueAt:             null,
          dueNodeId:         null,
        },
        $push: { steps: { at: new Date(), button: '(delay)', toNode: nodeId } },
      },
    );
    fired++;

    // Continue any further automatic steps (chained delays / text messages).
    if (!terminal) {
      await runAutoChain({
        flow: flow as unknown as Flow, compiled, runId: run._id, phone: run.phone,
        conversationId: run.conversationId, bizPhone: PHONE_NUMBER_ID, fromNodeId: nodeId,
      });
    }
  }

  return { fired };
}
