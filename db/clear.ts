import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const sql = neon(DATABASE_URL);
const db = drizzle(sql, { schema });

async function clear() {
  console.log('🗑  Clearing all data...');
  await db.delete(schema.messageStatusLog);
  await db.delete(schema.messageReactions);
  await db.delete(schema.messages);
  await db.delete(schema.conversationTags);
  await db.delete(schema.contactTags);
  await db.delete(schema.leads);
  await db.delete(schema.conversations);
  await db.delete(schema.contacts);
  await db.delete(schema.templates);
  await db.delete(schema.webhookEvents);
  console.log('✅ All data cleared. DB is ready for real usage.');
}

clear().catch((err) => { console.error(err); process.exit(1); });
