import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  gradeCode: string;
  track: string;
  academicYear: string;
  preferredLang: string;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
}

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'siefe9133@gmail.com',
]);

export async function getOrCreateDbUser(decoded: DecodedIdToken): Promise<DbUser> {
  try {
    const email = decoded.email ?? '';
    const displayName = decoded.name ?? email.split('@')[0] ?? 'Student';
    const photoUrl = decoded.picture ?? '';

    const existing = await db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1);
    if (existing.length > 0) {
      const current = existing[0];
      const shouldUpgradeAdmin = BOOTSTRAP_ADMIN_EMAILS.has(email.toLowerCase()) && current.role !== 'admin';
      if (shouldUpgradeAdmin || current.email !== email || (displayName && current.displayName !== displayName)) {
        const updated = await db
          .update(users)
          .set({
            email,
            displayName: displayName || current.displayName,
            photoUrl: photoUrl || current.photoUrl,
            role: shouldUpgradeAdmin ? 'admin' : current.role,
            updatedAt: new Date(),
          })
          .where(eq(users.uid, decoded.uid))
          .returning();
        return updated[0];
      }
      return current;
    }

    // Check if there are zero users yet or bootstrap email -> grant admin role so platform can be administered
    const anyUsers = await db.select({ id: users.id }).from(users).limit(1);
    const initialRole =
      anyUsers.length === 0 || BOOTSTRAP_ADMIN_EMAILS.has(email.toLowerCase())
        ? 'admin'
        : 'student';

    const inserted = await db
      .insert(users)
      .values({
        uid: decoded.uid,
        email,
        displayName,
        photoUrl,
        role: initialRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName,
          photoUrl,
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database user synchronization failed:', error);
    throw new Error('User profile sync failed. Please try again.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in with Google.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    req.dbUser = await getOrCreateDbUser(decoded);
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.user = decoded;
      req.dbUser = await getOrCreateDbUser(decoded);
    } catch {
      // Guest access continues without authenticated user context
    }
  }
  next();
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator permission required for this operation.' });
  }
  next();
};
