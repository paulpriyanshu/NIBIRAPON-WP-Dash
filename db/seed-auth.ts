import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Create users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      email         VARCHAR(255),
      username      VARCHAR(100),
      phone         VARCHAR(20),
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx    ON users (email)    WHERE email    IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username) WHERE username IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_phone_idx    ON users (phone)    WHERE phone    IS NOT NULL`;

  console.log('✅ users table ready');

  // Check if admin already exists
  const [existing] = await sql`SELECT id FROM users WHERE email = 'priyanshu.paul003@gmail.com' LIMIT 1`;
  if (existing) {
    console.log('ℹ️  Admin user already exists — skipping seed');
    return;
  }

  const passwordHash = await bcrypt.hash('muj@2027', 12);
  await sql`
    INSERT INTO users (name, email, username, password_hash, role)
    VALUES ('Priyanshu Paul', 'priyanshu.paul003@gmail.com', 'priyanshu', ${passwordHash}, 'admin')
  `;

  console.log('✅ Admin user created: priyanshu.paul003@gmail.com');
}

main().catch((err) => { console.error(err); process.exit(1); });
