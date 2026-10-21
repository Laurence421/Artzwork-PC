import type { NextConfig } from "next";

// Product photos are served from Supabase Storage.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

// Only this site may put its pages in a frame, plus the seller site (Branding shows the shop in a
// live preview), so another website can't overlay the admin and trick a click.
const frameAncestors = ["'self'", process.env.SELLER_URL].filter(Boolean).join(" ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers remember to use https only (when the site is served over https).
  ...(process.env.SHOP_URL?.startsWith("https://") ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Don't tell visitors which framework runs the site (no "X-Powered-By" header).
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  partialPrefetching: true,
  images: {
    // Smaller files than JPEG/PNG for every photo; browsers that can't show AVIF get WebP.
    formats: ["image/avif", "image/webp"],
    // Photo file names never change (a new upload gets a new name), so they can be kept a month.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
