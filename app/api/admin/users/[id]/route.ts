import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.role === 'admin' ? user : null;
}

// PATCH — update name, role, isActive, or reset password
export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, any> = { updatedAt: new Date() };
  if (body.name     !== undefined) patch.name     = body.name;
  if (body.role     !== undefined) patch.role     = body.role;
  if (body.isActive !== undefined) patch.isActive = body.isActive;
  if (body.email    !== undefined) patch.email    = body.email || null;
  if (body.username !== undefined) patch.username = body.username || null;
  if (body.phone    !== undefined) patch.phone    = body.phone || null;
  if (body.password) patch.passwordHash = await bcrypt.hash(body.password, 12);

  const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning({
    id: users.id, name: users.name, email: users.email,
    username: users.username, phone: users.phone,
    role: users.role, isActive: users.isActive,
  });

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}

// DELETE — remove user (admin cannot delete themselves)
export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (id === admin.userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
