import "dotenv/config";

/**
 * Verify security headers are present and correct on the running server.
 * Usage: node scripts/verify-security-headers.mjs [baseUrl]
 */

const baseUrl = process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
const isLocal = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost");
const productionPolicy = process.env.SHOULDBUILD_DEPLOYMENT_ENV === "production";
const failures = [];
const passes = [];

function check(name, passed, detail) {
  if (passed) passes.push({ name, detail });
  else failures.push({ name, detail });
}

console.log(`[headers] Checking security headers on ${baseUrl}...`);
const response = await fetch(baseUrl, { redirect: "follow" });
const headers = Object.fromEntries([...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));

// CSP
const csp = headers["content-security-policy"] || "";
check("csp_present", csp.length > 0, csp.slice(0, 120));
check("csp_default_src_self", csp.includes("default-src 'self'"), "default-src");
check("csp_frame_ancestors_none", csp.includes("frame-ancestors 'none'"), "frame-ancestors");
check("csp_object_src_none", csp.includes("object-src 'none'"), "object-src");
check("csp_font_src_gstatic", csp.includes("fonts.gstatic.com"), "font-src includes gstatic");
check("csp_style_src_fonts", csp.includes("fonts.googleapis.com"), "style-src includes fonts");

if (isLocal && !productionPolicy) {
  // Local dev allows unsafe-eval for HMR
  check("csp_local_allows_eval", csp.includes("unsafe-eval"), "local unsafe-eval for HMR");
} else {
  // Production/staging must NOT include unsafe-eval
  check("csp_no_unsafe_eval", !csp.includes("unsafe-eval"), "deployed CSP excludes unsafe-eval");
  check("csp_upgrade_insecure", csp.includes("upgrade-insecure-requests") || !baseUrl.startsWith("https"), "upgrade-insecure-requests");
}

// Standard headers
check("x_frame_options", headers["x-frame-options"]?.toUpperCase() === "DENY", headers["x-frame-options"]);
check("x_content_type_options", headers["x-content-type-options"] === "nosniff", headers["x-content-type-options"]);
check("referrer_policy", headers["referrer-policy"] === "strict-origin-when-cross-origin", headers["referrer-policy"]);
check("permissions_policy", (headers["permissions-policy"] || "").includes("camera=()"), headers["permissions-policy"]?.slice(0, 80));
check("coop", headers["cross-origin-opener-policy"] === "same-origin", headers["cross-origin-opener-policy"]);
check("corp", headers["cross-origin-resource-policy"] === "same-origin", headers["cross-origin-resource-policy"]);

// HSTS — required on production HTTPS, not on HTTP (even in production mode).
// Browsers ignore HSTS on plain HTTP, and setting it locally can cause issues.
const isHttps = baseUrl.startsWith("https");
if (isHttps && productionPolicy) {
  const hsts = headers["strict-transport-security"] || "";
  check("hsts_present", hsts.includes("max-age="), hsts);
  check("hsts_max_age", /max-age=\d{7,}/.test(hsts), "at least 10M seconds");
} else if (isLocal || !isHttps) {
  // HSTS on HTTP is meaningless; browsers reject it. Accept its absence.
  check("hsts_http_acceptable", true, "HSTS is not expected on HTTP; will be verified on production HTTPS");
} else {
  check("hsts_not_local", !headers["strict-transport-security"], "HSTS should not be set locally without production policy");
}

// Browser-facing routes must not opt arbitrary origins into credentialed CORS.
const hostileOrigin = "https://cross-tenant-attacker.invalid";
const corsResponse = await fetch(baseUrl, {
  headers: { Origin: hostileOrigin },
  redirect: "manual",
});
const allowOrigin = corsResponse.headers.get("access-control-allow-origin");
const allowCredentials = corsResponse.headers.get("access-control-allow-credentials");
check("cors_no_wildcard", allowOrigin !== "*", allowOrigin || "absent");
check("cors_rejects_untrusted_origin", allowOrigin !== hostileOrigin, allowOrigin || "absent");
check("cors_no_untrusted_credentials", !(allowOrigin === hostileOrigin && allowCredentials === "true"), `${allowOrigin || "absent"} / ${allowCredentials || "absent"}`);

// X-Powered-By should be absent (disabled in next.config.mjs)
check("no_x_powered_by", !headers["x-powered-by"], headers["x-powered-by"] || "absent");

console.log(JSON.stringify({
  result: failures.length === 0 ? "PASS" : "FAIL",
  baseUrl,
  isLocal,
  productionPolicy,
  passes: passes.length,
  failures: failures.length,
  failureDetails: failures,
  passDetails: passes,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
