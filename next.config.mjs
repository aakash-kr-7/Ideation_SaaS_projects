/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const deployedProduction = process.env.SHOULDBUILD_DEPLOYMENT_ENV === "production";
    const common = [
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${deployedProduction ? "" : " 'unsafe-eval'"}; connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:* ws://127.0.0.1:*${deployedProduction ? "; upgrade-insecure-requests" : ""}` },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];
    if (deployedProduction) {
      common.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers: common }];
  },
};

export default nextConfig;
