/** Runtime-neutral environment access used by server and Edge Function code. */
export function getEnv(name: string): string | undefined {
  const runtime = globalThis as { Deno?: { env?: { get(key: string): string | undefined } } };
  if (runtime.Deno?.env) return runtime.Deno.env.get(name);
  return typeof process !== "undefined" ? process.env[name] : undefined;
}
