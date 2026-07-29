export default async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const schedulerSecret = process.env.WEBHOOK_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !schedulerSecret) {
    throw new Error(
      "ShouldBuild scheduler requires the Supabase URL and WEBHOOK_SECRET or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1/research-scheduler`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${schedulerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: "netlify_schedule" }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Supabase scheduler returned ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
};

export const config = {
  schedule: "* * * * *",
};
