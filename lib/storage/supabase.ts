import { createClient } from "@supabase/supabase-js";
import { clientEnv, env } from "@/lib/env";

// Service-role client for server-side storage operations (logo uploads).
// Never import this from a client component — the service role key must
// stay server-only.
export function getSupabaseStorageClient() {
  return createClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
