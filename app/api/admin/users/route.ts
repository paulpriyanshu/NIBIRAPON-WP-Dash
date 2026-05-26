import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

// Middleware checks admin role, but double-check here too
async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.role === 'admin' ? user : null;
}

// GET — list all users
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await db
    .select({
      id: users.id, name: users.name, email: users.email,
      username: users.username, phone: users.phone,
      role: users.role, isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return NextResponse.json(rows);
}

// POST — create user
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { name, email, username, phone, password, role } = await req.json();

  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password are required' }, { status: 400 });
  }
  if (!email && !username && !phone) {
    return NextResponse.json({ error: 'At least one of email, username, or phone is required' }, { status: 400 });
  }

  const VALID_ROLES = ['admin', 'manager', 'user', 'reviewer'];
  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [row] = await db.insert(users).values({
      name,
      email:        email   || null,
      username:     username || null,
      phone:        phone    || null,
      passwordHash,
      role:         role || 'user',
      createdBy:    admin.userId,
    }).returning({
      id: users.id, name: users.name, email: users.email,
      username: users.username, phone: users.phone,
      role: users.role, isActive: users.isActive, createdAt: users.createdAt,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('unique')) {
      return NextResponse.json({ error: 'Email, username, or phone already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
