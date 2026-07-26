import { createClient } from "@supabase/supabase-js";
import { Database } from "../types";

/** Server-only client for queue and other privileged operations. Never import this from client code. */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Server-side Supabase queue credentials are not configured.");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      // Next may otherwise memoize an initial empty PostgREST response while a
      // terminal queue transaction is becoming visible. Privileged operational
      // reads must always observe current database state.
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-shouldbuild-read-nonce", crypto.randomUUID());
        return fetch(input, { ...init, headers, cache: "no-store" });
      },
    },
  });
}
