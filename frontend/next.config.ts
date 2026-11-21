import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function readEnvOrRootDotEnv(key: string): string {
  let raw = (process.env[key] ?? "").trim();
  if (!raw) {
    // Next only loads frontend/.env*; fall back to repo-root .env so env config lives in one place.
    const rootEnv = path.resolve(process.cwd(), "..", ".env");
    if (fs.existsSync(rootEnv)) {
      const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`);
      for (const line of fs.readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
        const match = line.match(pattern);
        if (match?.[1]) {
          raw = match[1].replace(/^['"]|['"]$/g, "").trim();
          break;
        }
      }
    }
  }
  return raw;
}

function normalizeLocalhost(url: string): string {
  // Windows resolves `localhost` to IPv6 ::1 while uvicorn binds IPv4 127.0.0.1, causing ECONNREFUSED 502s.
  return url.replace(/\/$/, "").replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, "$1127.0.0.1");
}

function resolveBackendUrl(): string {
  const raw = readEnvOrRootDotEnv("BACKEND_URL");
  return normalizeLocalhost(raw || "http://127.0.0.1:8000");
}

function resolvePublicApiUrl(): string {
  const raw = readEnvOrRootDotEnv("NEXT_PUBLIC_API_URL");
  return raw ? normalizeLocalhost(raw) : "";
}

// By default the browser calls relative /api paths proxied by Next to BACKEND_URL.
// When NEXT_PUBLIC_API_URL is set (either in frontend/.env* or repo-root .env),
// Next passes it to the browser bundle so long calls can talk directly to FastAPI.
const backend = resolveBackendUrl();
const publicApiUrl = resolvePublicApiUrl();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app", "localhost:3000", "127.0.0.1:3000"],
  env: {
    NEXT_PUBLIC_API_URL: publicApiUrl,
    NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS === "true" ? "true" : "false",
  },
  experimental: {
    // Confirmed in next@15.5.x (server/config-shared.d.ts, server/lib/router-utils/proxy-request.js):
    // default rewrite proxyTimeout is 30_000 ms, which aborts long synchronous calls.
    proxyTimeout: 300_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  webpack(config, { webpack }) {
    if (process.env.NEXT_PUBLIC_USE_MOCKS !== "true") {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /-mocks$/,
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
