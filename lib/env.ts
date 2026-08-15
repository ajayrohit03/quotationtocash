import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function loadClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid client environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}

function loadServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${z.prettifyError(parsed.error)}`,
    );
  }

  return parsed.data;
}

// Client env is safe to read at import time — it's just NEXT_PUBLIC_* values.
export const clientEnv = loadClientEnv();

// Server env is only readable server-side. Lazily validated on first access
// so importing this module from a client component doesn't throw at import
// time, but actually reading a property from `env` there will.
let cachedServerEnv: ServerEnv | undefined;

export const env = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    if (typeof window !== "undefined") {
      throw new Error("`env` (server env) must not be accessed from the client.");
    }
    if (!cachedServerEnv) {
      cachedServerEnv = loadServerEnv();
    }
    return cachedServerEnv[prop as keyof ServerEnv];
  },
});
