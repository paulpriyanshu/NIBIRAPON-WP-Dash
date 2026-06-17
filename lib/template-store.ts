import { ObjectId, type Collection, type Document } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import type { TemplateMessageConfig } from '@/lib/templates';

const DB              = 'nibiraponcollections';
const TEMPLATE_MSGS   = 'template_messages';
const AGENT_DRAFTS    = 'agent_drafts';

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

/** Parse a string id into an ObjectId, returning null if malformed. */
export function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Serialize a Mongo doc's _id to a string `id` field for JSON responses. */
export function serializeId<T extends { _id?: ObjectId }>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id ? _id.toString() : '' };
}
