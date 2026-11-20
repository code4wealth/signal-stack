import type { NextConfig } from "next";

// The browser only ever calls relative /api paths. Next proxies them to the
// FastAPI backend server-side, so nothing in the browser needs to reach
// localhost (which would be the user's own machine, not this server).
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
