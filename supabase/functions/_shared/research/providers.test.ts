import { z } from "zod";
import { CerebrasReasoningProvider } from "./providers.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("Cerebras fallback uses the compatible endpoint and validates JSON", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  let authorization = "";
  globalThis.fetch = (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    authorization = new Headers(init?.headers).get("Authorization") || "";
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  };

  try {
    const provider = new CerebrasReasoningProvider("test-key");
    const result = await provider.generateStructured(
      "system",
      "user",
      z.object({ ok: z.literal(true) }),
    );
    assertEquals(result, { ok: true });
    assertEquals(requestUrl, "https://api.cerebras.ai/v1/chat/completions");
    assertEquals(authorization, "Bearer test-key");
    assertEquals(requestBody.model, "gpt-oss-120b");
    assertEquals(requestBody.max_completion_tokens, 2048);
    assertEquals(requestBody.response_format, { type: "json_object" });
    assertEquals(provider.lastUsage, { prompt: 7, completion: 3 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
