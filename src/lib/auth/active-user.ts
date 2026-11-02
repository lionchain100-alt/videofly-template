import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users } from "@/db";
import { auth, type User } from "./auth";

/** Read current role/status from the database even when the auth session is cached. */
export async function getActiveSessionUser(headers: Headers): Promise<User | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  const [current] = await db
    .select({ user: users })
    .from(users)
    .innerJoin(sessions, eq(sessions.userId, users.id))
    .where(
      and(
        eq(users.id, session.user.id),
        eq(sessions.id, session.session.id),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!current || current.user.disabled) return null;
  return {
    ...session.user,
    ...current.user,
    name: current.user.name ?? session.user.name ?? current.user.email,
  };
}
