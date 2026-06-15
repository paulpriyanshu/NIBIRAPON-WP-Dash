import { ObjectId, type Collection, type Document } from 'mongodb';
import getMongoClient from '@/lib/mongodb';

const DB    = 'nibiraponcollections';
const CHATS = 'manager_chats';

/** A media file the owner attached to a message — stored in R2, described in text. */
export interface ManagerImage {
  assetId: string;
  description: string;
  type?: 'image' | 'video';   // defaults to image
}

/** OpenAI-shaped tool call recorded on an assistant message. */
export interface StoredToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** A media item embedded in a chat card — a served URL, type, plus its description. */
export interface CardImage { url: string; description?: string; type?: 'image' | 'video' }

/** A rich product/category card the agent renders inline in the chat. */
export interface DisplayCard {
  kind: 'product' | 'category';
  id: string;
  title: string;
  subtitle?: string;        // e.g. the product's category, or "Category"
  price?: string | null;
  description?: string | null;
  attributes?: { label: string; value: string }[];   // variant attributes
  images: CardImage[];
}

/**
 * One persisted message. A superset of OpenAI's ChatCompletion message plus UI
 * meta — stored verbatim so the agent loop can replay the exact conversation.
 */
export interface ManagerStoredMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: StoredToolCall[];   // assistant turns that called tools
  tool_call_id?: string;           // tool-result turns
  name?: string;                   // tool name (on tool-result turns)
  images?: ManagerImage[];         // user attachments (UI + manifest)
  cards?: DisplayCard[];           // rich cards to render (carried on display tool results)
  hidden?: boolean;                // plumbing not rendered in the UI
  createdAt: Date;
}

/** A write tool call staged for the owner's approval (confirm-first). */
export interface PendingAction {
  toolCallId: string;
  name: string;
  args: Record<string, any>;
  summary: string;
}

export interface ManagerChatDoc extends Document {
  title: string;
  messages: ManagerStoredMessage[];
  pendingActions?: PendingAction[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function managerChatsColl(): Promise<Collection<ManagerChatDoc>> {
  return (await getMongoClient()).db(DB).collection<ManagerChatDoc>(CHATS);
}

export function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Title from the first user message, trimmed to a reasonable length. */
export function deriveTitle(text: string): string {
  const t = (text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'New chat';
  return t.length > 48 ? t.slice(0, 48) + '…' : t;
}

/** A chat doc shaped for the client: visible turns (incl. card results) + lightweight pending actions. */
export function serializeChat(doc: ManagerChatDoc & { _id?: ObjectId }) {
  const messages = (doc.messages ?? []).flatMap(m => {
    // Card-bearing tool results render as an assistant-side card block.
    if (m.role === 'tool' && m.cards?.length) {
      return [{ role: 'assistant' as const, content: '', images: [] as ManagerImage[], cards: m.cards, createdAt: m.createdAt }];
    }
    if (!m.hidden && (m.role === 'user' || m.role === 'assistant') && (m.content || m.images?.length)) {
      return [{ role: m.role, content: m.content ?? '', images: m.images ?? [], cards: [] as DisplayCard[], createdAt: m.createdAt }];
    }
    return [];
  });
  // Full staged actions (incl. args) so the UI can render an editable grouping plan.
  const pendingActions = (doc.pendingActions ?? []).map(a => ({ toolCallId: a.toolCallId, name: a.name, summary: a.summary, args: a.args }));

  // The most recent user-attached images — the pool the plan maps onto.
  let attachedImages: ManagerImage[] = [];
  const msgs = doc.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user' && msgs[i].images?.length) { attachedImages = msgs[i].images!; break; }
  }

  return {
    id: doc._id ? doc._id.toString() : '',
    title: doc.title,
    messages,
    pendingActions: pendingActions.length ? pendingActions : null,
    attachedImages,
    updatedAt: doc.updatedAt,
  };
}
