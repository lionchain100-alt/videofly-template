import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { CreditTransType, creditService } from "@/services/credit";

import { db, users } from "@/db";
import * as schema from "@/db/schema";
import { env } from "./env.mjs";
import { eq } from "drizzle-orm";
import { localTestAuthEnabled } from "./local-test";
import { siteManifest } from "@/config/site-manifest";

const localTestAuth = localTestAuthEnabled();

const toLogString = (value: unknown) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") return value;
  const normalized =
    value instanceof Error
      ? {
          name: value.name,
          message: value.message,
          stack: value.stack,
          status: (value as unknown as Record<string, unknown>).status,
          statusText: (value as unknown as Record<string, unknown>).statusText,
          error: (value as unknown as Record<string, unknown>).error,
        }
      : value;
  const seen = new WeakSet();
  try {
    return JSON.stringify(normalized, (_key, val) => {
      if (typeof val === "bigint") return val.toString();
      if (typeof val === "function") return "[Function]";
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(normalized);
  }
};

const debugLogger =
  process.env.NODE_ENV === "development"
    ? {
        level: "debug" as const,
        log: (
          level: "debug" | "info" | "warn" | "error",
          message: string,
          ...args: unknown[]
        ) => {
          const suffix = args.length
            ? ` ${args.map(toLogString).join(" ")}`
            : "";
          const line = `[Better Auth] ${message}${suffix}`.trimEnd();
          if (level === "error") console.error(line);
          else if (level === "warn") console.warn(line);
          else console.log(line);
        },
      }
    : undefined;

type AuthPlugin = ReturnType<typeof nextCookies> | ReturnType<typeof magicLink>;

const plugins: AuthPlugin[] = [
  // Avoid Next.js dev DataCloneError from cookies() in some environments.
  ...(process.env.NODE_ENV === "development" ? [] : [nextCookies()]),
  ...(localTestAuth
    ? []
    : [
        magicLink({
          sendMagicLink: async ({ email, url }) => {
            // Dynamic import to avoid Edge Runtime issues in middleware
            const { MagicLinkEmail } = await import(
              "@/lib/emails/magic-link-email"
            );
            const { resend } = await import("@/lib/email");
            const { siteConfig } = await import("@/config/site");

            // Check if user exists to determine email type
            const [existingUser] = await db
              .select({ name: users.name, emailVerified: users.emailVerified })
              .from(users)
              .where(eq(users.email, email))
              .limit(1);

            const userVerified = !!existingUser?.emailVerified;
            const authSubject = userVerified
              ? `Sign-in link for ${(siteConfig as { name: string }).name}`
              : "Activate your account";

            try {
              await resend.emails.send({
                from: env.RESEND_FROM,
                to: email,
                subject: authSubject,
                react: MagicLinkEmail({
                  firstName: existingUser?.name ?? "",
                  actionUrl: url,
                  mailType: userVerified ? "login" : "register",
                  siteName: (siteConfig as { name: string }).name,
                }),
                headers: {
                  "X-Entity-Ref-ID": new Date().getTime() + "",
                },
              });
            } catch (error) {
              console.error("Failed to send magic link email:", error);
              throw error;
            }
          },
          expiresIn: 300, // 5 minutes
        }),
      ]),
];

// Creem billing is owned by the unified ledger; legacy HTTP clients use its facade.

export const auth = betterAuth({
  advanced: { cookiePrefix: siteManifest.isolation.cookiePrefix },
  baseURL: env.NEXT_PUBLIC_APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  logger: debugLogger,
  emailAndPassword: {
    enabled: localTestAuth,
    disableSignUp: true,
    requireEmailVerification: true,
  },

  // Drizzle adapter with schema for Better Auth
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // Plugins
  plugins,
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [user] = await db
            .select({ disabled: users.disabled })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);
          if (!user || user.disabled)
            throw new APIError("FORBIDDEN", {
              message: "该账户已停用，请联系管理员",
            });
          return { data: session };
        },
      },
    },
  },

  // Hooks - 自动赠送新用户积分（仅在注册时触发）
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // 只要有新 session 创建（注册或登录），都尝试检查并发放新用户积分
      // grantNewUserCredits 内部有幂等性检查，只会发放一次
      // 这样可以覆盖 Email 注册、OAuth 注册等所有场景
      const newSession = ctx.context?.newSession;
      if (newSession?.user?.id) {
        try {
          // 不等待这个操作，避免阻塞登录/注册响应（虽然它是异步的，但 await 会阻塞中间件链）
          // 但作为 after hook，最好还是 await 确保执行完成，反正数据库查询很快
          await creditService.grantNewUserCredits(newSession.user.id);
        } catch (error) {
          console.error("[Auth] Failed to grant new user credits:", error);
          // 不抛出错误，避免影响用户登录
        }
      }
    }),
  },

  // Google OAuth
  socialProviders: localTestAuth
    ? {}
    : {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          prompt: "select_account", // Always show account picker
        },
      },

  // Custom user fields
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false, // Prevent users from setting this
      },
    },
  },

  // Session configuration
  session: {
    cookieCache: {
      enabled: !localTestAuth,
      maxAge: 5 * 60, // 5 minutes
    },
  },
});

// Extend user type with additional fields
export type User = typeof auth.$Infer.Session.user & {
  isAdmin?: boolean | null;
};

// Session type with extended user
type BaseSession = typeof auth.$Infer.Session;
export type Session = {
  session: BaseSession["session"];
  user: User;
};
