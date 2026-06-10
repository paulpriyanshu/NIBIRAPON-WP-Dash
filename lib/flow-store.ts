import { ObjectId } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import { db } from '@/db';
import { messages, conversations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendRichTemplateMessage, sendMPMTemplateMessage } from '@/lib/whatsapp-api';
import {
  compileFlow, resolveNext, hasOnward, delayAfter, quickReplyButtons,
  templateSendInfo, templatesInFlow, getTemplate, templateKindFlags,
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

  const payload = configToSendPayload(to, info.name, info.language, { ...p, isMPM, isCatalog });
  const res = payload.kind === 'mpm'
    ? await sendMPMTemplateMessage(payload.args)
    : await sendRichTemplateMessage(payload.args);
  return res?.messages?.[0]?.id;
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

/** Compute the dueAt/dueNodeId fields for a node that was just sent. */
function delayFields(compiled: CompiledFlow, nodeId: string): { dueAt: Date | null; dueNodeId: string | null } {
  const d = delayAfter(compiled, nodeId);
  return d ? { dueAt: new Date(Date.now() + d.seconds * 1000), dueNodeId: d.nextId } : { dueAt: null, dueNodeId: null };
}

// Short delays run inline (setTimeout) for precise timing; longer ones are left
// to the cron tick so we don't block the request for too long.
const INLINE_DELAY_CAP_SEC = 45;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * After a template was sent, honour its Delay node: wait the configured seconds
 * then send the next template — chaining further short delays. Aborts if the
 * customer advances the run (e.g. taps a button) during the wait.
 */
async function runDelayChain(args: {
  flow: Flow; compiled: CompiledFlow; runId: ObjectId; phone: string;
  conversationId: string | null; bizPhone: string; fromNodeId: string;
}): Promise<void> {
  const runs = await runsColl();
  let current = args.fromNodeId;

  for (let guard = 0; guard < 25; guard++) {
    const d = delayAfter(args.compiled, current);
    if (!d) { await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } }); return; }

    if (d.seconds > INLINE_DELAY_CAP_SEC) {
      // Too long to hold the request — hand off to the cron tick.
      await runs.updateOne({ _id: args.runId }, { $set: { dueAt: new Date(Date.now() + d.seconds * 1000), dueNodeId: d.nextId } });
      return;
    }

    await sleep(d.seconds * 1000);

    // If the customer moved the run on (tapped a button) while we waited, stop.
    const fresh = await runs.findOne({ _id: args.runId });
    if (!fresh || fresh.status !== 'active' || fresh.currentNodeId !== current) return;

    const node = args.compiled.nodesById[d.nextId];
    const info = templateSendInfo(node);
    if (!info) { await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } }); return; }

    let waId: string | undefined;
    try {
      waId = await sendNodeTemplate(args.flow, d.nextId, args.phone);
      console.log(`[flow] delay (${d.seconds}s) fired → sent "${info.name}" to ${args.phone} waId=${waId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] inline delay send failed for "${info.name}":`, e instanceof Error ? e.message : e);
      await runs.updateOne({ _id: args.runId }, { $set: { dueAt: null, dueNodeId: null } });
      return;
    }

    const msgId = waId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: args.conversationId, bizPhone: args.bizPhone,
      phone: args.phone, templateName: info.name, status: waId ? 'sent' : 'failed',
    });

    const terminal = !hasOnward(args.compiled, d.nextId);
    await runs.updateOne(
      { _id: args.runId },
      {
        $set: {
          currentNodeId: d.nextId, currentButtons: quickReplyButtons(node),
          lastTemplateMsgId: msgId, status: terminal ? 'completed' : 'active',
          updatedAt: new Date(), dueAt: null, dueNodeId: null,
        },
        $push: { steps: { at: new Date(), button: '(delay)', toNode: d.nextId } },
      },
    );
    if (terminal) return;
    current = d.nextId;
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
  templateName: string; status: 'sent' | 'failed';
}) {
  if (!opts.conversationId) return;
  await db.insert(messages).values({
    id:            opts.msgId,
    conversationId: opts.conversationId,
    fromNumber:    opts.bizPhone,
    toNumber:      opts.phone,
    type:          'template',
    templateName:  opts.templateName,
    text:          `[Flow] ${opts.templateName}`,
    status:        opts.status,
    isOutgoing:    true,
    sentBy:        'flow',
    sentAt:        new Date(),
  }).onConflictDoNothing();
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
    phone: opts.phone, templateName: info.name, status: waId ? 'sent' : 'failed',
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

  // Honour a Delay node right after the root (setTimeout for short waits).
  await runDelayChain({
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
    const info = templateSendInfo(nextNode);
    if (!info) continue;

    let waId: string | undefined;
    try {
      waId = await sendNodeTemplate(flow as unknown as Flow, nextId, opts.phone);
      console.log(`[flow] sent next template "${info.name}" → waId=${waId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] advance send failed for template "${info.name}":`, e instanceof Error ? e.message : e);
      return false;
    }

    const msgId = waId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: opts.conversationId, bizPhone: opts.bizPhone,
      phone: opts.phone, templateName: info.name, status: waId ? 'sent' : 'failed',
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

    // Honour a Delay node after this template (setTimeout for short waits).
    if (!terminal) {
      await runDelayChain({
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
    const info = templateSendInfo(node);
    if (!info) { await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } }); continue; }

    let waId: string | undefined;
    try {
      waId = await sendNodeTemplate(flow as unknown as Flow, nodeId, run.phone);
      console.log(`[flow] delay fired → sent "${info.name}" to ${run.phone} waId=${waId ?? 'none'}`);
    } catch (e) {
      console.error(`[flow] delay send failed for "${info.name}":`, e instanceof Error ? e.message : e);
      // Clear the schedule so we don't hot-loop on a broken template.
      await runs.updateOne({ _id: run._id }, { $set: { dueAt: null, dueNodeId: null } });
      continue;
    }

    const msgId = waId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await persistFlowMessage({
      msgId, conversationId: run.conversationId, bizPhone: PHONE_NUMBER_ID,
      phone: run.phone, templateName: info.name, status: waId ? 'sent' : 'failed',
    });

    const terminal = !hasOnward(compiled, nodeId);
    const next = delayFields(compiled, nodeId);
    await runs.updateOne(
      { _id: run._id },
      {
        $set: {
          currentNodeId:     nodeId,
          currentButtons:    quickReplyButtons(node),
          lastTemplateMsgId: msgId,
          status:            terminal ? 'completed' : 'active',
          updatedAt:         new Date(),
          dueAt:             next.dueAt,
          dueNodeId:         next.dueNodeId,
        },
        $push: { steps: { at: new Date(), button: '(delay)', toNode: nodeId } },
      },
    );
    fired++;
  }

  return { fired };
}
