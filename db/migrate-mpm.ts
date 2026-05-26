import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS mpm_sections jsonb`;
  await sql`ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS thumbnail_product_retailer_id text`;
  console.log('Migration complete: mpm_sections and thumbnail_product_retailer_id added to broadcast_campaigns');
}

main().catch((e) => { console.error(e); process.exit(1); });
