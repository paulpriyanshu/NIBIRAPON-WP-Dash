import { ObjectId, type Collection, type Document } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import type { TemplateMessageConfig } from '@/lib/templates';

const DB              = 'nibiraponcollections';
const TEMPLATE_MSGS   = 'template_messages';
const AGENT_DRAFTS    = 'agent_drafts';
const TEMPLATE_META   = 'template_agent_meta';

/** Document shapes stored in Mongo. */
export interface TemplateMessageDoc extends Document {
  name: string;
  templateName: string;
  language: string;
  config: TemplateMessageConfig;
  preview: string;
  agentDescription?: string;  // what this template is for (helps the agent pick it)
  whenToSend?: string;        // when the agent should send it
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentDraftDoc extends Document {
  kind: 'text' | 'template';
  name: string;
  triggerHint: string | null;
  isActive: boolean;
  content?: string;            // text drafts: verbatim message
  templateMessageId?: string;  // template drafts: ref to TemplateMessageDoc._id
  createdAt: Date;
  updatedAt: Date;
}

export async function templateMessagesColl(): Promise<Collection<TemplateMessageDoc>> {
  return (await getMongoClient()).db(DB).collection<TemplateMessageDoc>(TEMPLATE_MSGS);
}

export async function agentDraftsColl(): Promise<Collection<AgentDraftDoc>> {
  return (await getMongoClient()).db(DB).collection<AgentDraftDoc>(AGENT_DRAFTS);
}

/** App-local agent instructions attached to a raw WhatsApp template (keyed by
 *  templateName). NOT part of the WhatsApp template — editing it never triggers
 *  a Meta re-approval. Saved messages built from the template inherit these. */
export interface TemplateAgentMetaDoc extends Document {
  templateName: string;
  agentDescription?: string;
  whenToSend?: string;
  updatedAt: Date;
}

export async function templateAgentMetaColl(): Promise<Collection<TemplateAgentMetaDoc>> {
  return (await getMongoClient()).db(DB).collection<TemplateAgentMetaDoc>(TEMPLATE_META);
}

/** Map of templateName → { agentDescription, whenToSend } for the agent context. */
export async function getTemplateAgentMetaMap(): Promise<Map<string, { agentDescription?: string; whenToSend?: string }>> {
  const docs = await (await templateAgentMetaColl()).find({}).toArray().catch(() => []);
  return new Map(docs.map(d => [d.templateName, { agentDescription: d.agentDescription, whenToSend: d.whenToSend }]));
}

/** Parse a string id into an ObjectId, returning null if malformed. */
export function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Serialize a Mongo doc's _id to a string `id` field for JSON responses. */
export function serializeId<T extends { _id?: ObjectId }>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id ? _id.toString() : '' };
}
