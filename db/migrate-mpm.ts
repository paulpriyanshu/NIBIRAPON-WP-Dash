import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS is_mpm_template boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS mpm_sections jsonb`;
  await sql`ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS thumbnail_product_retailer_id text`;
  console.log('Migration complete: is_mpm_template, mpm_sections, thumbnail_product_retailer_id added');
}

main().catch((e) => { console.error(e); process.exit(1); });
