import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'nb_token';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'nibirapon-jwt-secret-change-in-production-2024'
);

export interface SessionUser {
  userId: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
}

export async function signToken(payload: SessionUser): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
