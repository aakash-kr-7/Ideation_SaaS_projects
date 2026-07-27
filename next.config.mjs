/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const deploymentEnv = process.env.SHOULDBUILD_DEPLOYMENT_ENV || "";
    const isDeployed = deploymentEnv === "production" || deploymentEnv === "staging";
    const isProduction = deploymentEnv === "production";
    // Local development needs unsafe-eval for Next.js HMR and local Supabase.
    // Deployed environments use strict CSP without unsafe-eval.
    const scriptSrc = isDeployed
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseIsLocal = supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
    const connectSrc = isDeployed && !supabaseIsLocal
      ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
      : "connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:* ws://127.0.0.1:*";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      scriptSrc,
      connectSrc,
      isProduction && !supabaseIsLocal ? "upgrade-insecure-requests" : "",
    ].filter(Boolean).join("; ");
    const common = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];
    if (isProduction) {
      common.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers: common }];
  },
};

export default nextConfig;
