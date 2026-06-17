import { ObjectId, type Collection, type Document } from 'mongodb';
import getMongoClient from '@/lib/mongodb';
import type { CustomMessage } from '@/lib/custom-messages';

const DB   = 'nibiraponcollections';
const COLL = 'custom_messages';

export interface CustomMessageDoc extends Document {
  name: string;
  type: CustomMessage['type'];
  body?: string;
  media?: CustomMessage['media'];
  caption?: string;
  header?: string;
  footer?: string;
  buttons?: CustomMessage['buttons'];
  listButton?: string;
  sections?: CustomMessage['sections'];
  agentDescription?: string;
  triggerHint?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function customMessagesColl(): Promise<Collection<CustomMessageDoc>> {
  return (await getMongoClient()).db(DB).collection<CustomMessageDoc>(COLL);
}

export function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Serialize a Mongo doc to the API/client shape (`_id` → `id`). */
export function serializeCustomMessage(doc: CustomMessageDoc & { _id?: ObjectId }): CustomMessage {
  const { _id, createdAt, updatedAt, ...rest } = doc;
  return {
    id: _id ? _id.toString() : '',
    ...(rest as Omit<CustomMessage, 'id' | 'createdAt' | 'updatedAt'>),
    createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : undefined,
  };
}

/** Fetch one custom message by id (for flows / agent / inbox send). */
export async function getCustomMessage(id: string): Promise<CustomMessage | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const doc = await (await customMessagesColl()).findOne({ _id });
  return doc ? serializeCustomMessage(doc) : null;
}
