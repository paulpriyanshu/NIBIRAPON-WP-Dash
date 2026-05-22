import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'db/migrations') });
  console.log('Migrations complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
