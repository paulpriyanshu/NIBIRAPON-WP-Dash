import { ObjectId } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import { db } from '@/db';
import { messages, conversations } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendRichTemplateMessage } from '@/lib/whatsapp-api';
import {
  compileFlow, resolveNext, hasOnward, quickReplyButtons,
  templateSendInfo, templatesInFlow, type Flow, type FlowButton,
} from '@/lib/flow-engine';

/** Body params + header media configured for a node at launch time. */
function nodeParams(flow: Flow, nodeId: string): { bodyParams: string[]; headerMediaUrl?: string } {
  const tp = flow.templateParams?.[nodeId];
  return { bodyParams: tp?.bodyParams ?? [], headerMediaUrl: tp?.headerMediaUrl || undefined };
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

  const p = nodeParams(opts.flow, opts.rootNodeId);
  let waId: string | undefined;
  try {
    const res = await sendRichTemplateMessage({
      to: opts.phone,
      templateName: info.name,
      language: info.language,
      bodyParams: p.bodyParams,
      headerMediaUrl: p.headerMediaUrl,
    });
    waId = res?.messages?.[0]?.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }

  const msgId = waId || `wamid.flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await persistFlowMessage({
    msgId, conversationId: opts.conversationId, bizPhone: opts.bizPhone,
    phone: opts.phone, templateName: info.name, status: waId ? 'sent' : 'failed',
  });

  const runs = await runsColl();
  // Restart: stop any existing active run for this phone in this flow.
  await runs.updateMany(
    { phone: opts.phone, flowId: opts.flow._id, status: 'active' },
    { $set: { status: 'stopped', updatedAt: new Date() } },
  );
  const now = new Date();
  await runs.insertOne({
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
  } satisfies Omit<FlowRun, '_id'>);
  console.log(`[flow] run started phone=${opts.phone} flow=${opts.flow._id} root=${opts.rootNodeId} rootMsg=${msgId} buttons=${JSON.stringify(quickReplyButtons(rootNode))}`);

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
  const run = await runs.findOne({ phone: opts.phone, status: 'active' });
  if (!run) {
    console.log(`[flow] no active run for phone=${opts.phone}`);
    return false;
  }

  // Stale tap (customer scrolled up and tapped an old template) — log but don't
  // hard-block; some WhatsApp payloads omit/alter context.id.
  if (opts.contextMsgId && run.lastTemplateMsgId && opts.contextMsgId !== run.lastTemplateMsgId) {
    console.warn(`[flow] context mismatch (got ${opts.contextMsgId}, expected ${run.lastTemplateMsgId}) — advancing anyway`);
  }

  const flows = await flowsColl();
  let flow;
  try { flow = await flows.findOne({ _id: new ObjectId(run.flowId) }); } catch { return false; }
  if (!flow || flow.status !== 'live') {
    console.log(`[flow] flow ${run.flowId} not live (status=${flow?.status})`);
    return false;
  }

  const compiled = compileFlow(flow as unknown as Flow);
  const nextId = resolveNext(compiled, run.currentNodeId, opts.buttonText);
  console.log(`[flow] advance phone=${opts.phone} node=${run.currentNodeId} button="${opts.buttonText}" → next=${nextId ?? 'none'} (buttons: ${JSON.stringify(compiled.transitions[run.currentNodeId]?.buttons ?? {})})`);
  if (!nextId) return false;

  const nextNode = compiled.nodesById[nextId];
  const info = templateSendInfo(nextNode);
  if (!info) return false;

  const p = nodeParams(flow as unknown as Flow, nextId);
  let waId: string | undefined;
  try {
    const res = await sendRichTemplateMessage({
      to: opts.phone, templateName: info.name, language: info.language,
      bodyParams: p.bodyParams, headerMediaUrl: p.headerMediaUrl,
    });
    waId = res?.messages?.[0]?.id;
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
      },
      $push: { steps: { at: new Date(), button: opts.buttonText, toNode: nextId } },
    },
  );
  return true;
}
