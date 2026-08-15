import { z } from "zod";

// Each variable is validated independently, only when actually read. That
// keeps a module which needs just one variable (e.g. lib/db/prisma.ts
// reading DATABASE_URL) from failing because an unrelated one (e.g. a
// Clerk key nothing on this code path touches) isn't set yet.
const serverSchema = {
  DATABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
} as const;

const clientSchema = {
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
} as const;

type ServerEnv = { [K in keyof typeof serverSchema]: string };
type ClientEnv = { [K in keyof typeof clientSchema]: string };

function readVar<T extends Record<string, z.ZodType<string>>>(
  schema: T,
  key: keyof T & string,
): string {
  const value = schema[key].safeParse(process.env[key]);
  if (!value.success) {
    throw new Error(
      `Invalid environment variable ${key}: ${z.prettifyError(value.error)}`,
    );
  }
  return value.data;
}

const clientCache = new Map<string, string>();
export const clientEnv = new Proxy({} as ClientEnv, {
  get(_target, prop: string) {
    if (!clientCache.has(prop)) {
      clientCache.set(prop, readVar(clientSchema, prop as keyof typeof clientSchema));
    }
    return clientCache.get(prop);
  },
});

const serverCache = new Map<string, string>();
export const env = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    if (typeof window !== "undefined") {
      throw new Error("`env` (server env) must not be accessed from the client.");
    }
    if (!serverCache.has(prop)) {
      serverCache.set(prop, readVar(serverSchema, prop as keyof typeof serverSchema));
    }
    return serverCache.get(prop);
  },
});
