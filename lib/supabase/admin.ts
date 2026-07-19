import { createClient } from "@supabase/supabase-js";
import { Database } from "../types";

/** Server-only client for queue and other privileged operations. Never import this from client code. */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Server-side Supabase queue credentials are not configured.");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
