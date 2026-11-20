import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function resolveBackendUrl(): string {
  let raw = (process.env.BACKEND_URL ?? "").trim();
  if (!raw) {
    // Next only loads frontend/.env*; fall back to repo-root .env so BACKEND_URL lives in one place.
    const rootEnv = path.resolve(process.cwd(), "..", ".env");
    if (fs.existsSync(rootEnv)) {
      for (const line of fs.readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*BACKEND_URL\s*=\s*(.+?)\s*$/);
        if (match?.[1]) {
          raw = match[1].replace(/^['"]|['"]$/g, "").trim();
          break;
        }
      }
    }
  }
  const fallback = "http://127.0.0.1:8000";
  const chosen = (raw || fallback).replace(/\/$/, "");
  // Windows resolves `localhost` to IPv6 ::1 while uvicorn binds IPv4 127.0.0.1, causing ECONNREFUSED 502s.
  return chosen.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1");
}

// The browser only ever calls relative /api paths. Next proxies them to the
// FastAPI backend server-side, so nothing in the browser needs to reach
// localhost (which would be the user's own machine, not this server).
const backend = resolveBackendUrl();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
  experimental: {
    // Confirmed in next@15.5.x (server/config-shared.d.ts, server/lib/router-utils/proxy-request.js):
    // default rewrite proxyTimeout is 30_000 ms, which aborts long discover/crawl/analyse calls.
    proxyTimeout: 300_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
