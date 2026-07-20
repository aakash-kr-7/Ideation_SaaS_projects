import "dotenv/config";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
const endpoint = `${url}/functions/v1/research-scheduler`;
const unauthorized = await fetch(endpoint, { method: "POST" });
if (unauthorized.status !== 401) throw new Error(`Scheduler accepted an unauthenticated request (${unauthorized.status}).`);
const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: "{}" });
const payload = await response.json();
if (!response.ok) throw new Error(`Scheduler failed: ${JSON.stringify(payload)}`);
for (const field of ["recovered", "orphaned", "pending"]) if (!Number.isInteger(payload[field]) || payload[field] < 0) throw new Error(`Scheduler returned invalid ${field}: ${JSON.stringify(payload)}`);
if (typeof payload.triggered !== "boolean") throw new Error(`Scheduler returned invalid triggered state: ${JSON.stringify(payload)}`);
console.log(JSON.stringify({ authenticated: true, unauthorizedRejected: true, recovered: payload.recovered, orphaned: payload.orphaned, pending: payload.pending, triggered: payload.triggered }, null, 2));
