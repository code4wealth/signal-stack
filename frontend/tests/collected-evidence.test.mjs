import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const { createRequire } = Module;
const require = createRequire(import.meta.url);
const ts = require("typescript");

function createTsLoader() {
  const cache = new Map();
  const resolveTs = (specifier, parentDir) => {
    const base = specifier.startsWith("@/")
      ? path.join(frontendRoot, specifier.slice(2))
      : path.resolve(parentDir, specifier);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ];
    return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ?? null;
  };

  function loadModule(filePath) {
    const abs = path.resolve(filePath);
    if (cache.has(abs)) return cache.get(abs).exports;

    const mod = { exports: {} };
    cache.set(abs, mod);
    const src = fs.readFileSync(abs, "utf8");
    const { outputText } = ts.transpileModule(src, {
      fileName: abs,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    });
    const localRequire = (specifier) => {
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const resolved = resolveTs(specifier, path.dirname(abs));
        if (resolved) return loadModule(resolved);
      }
      return Module.createRequire(abs)(specifier);
    };
    const fn = new Function("exports", "require", "module", "__filename", "__dirname", outputText);
    fn(mod.exports, localRequire, mod, abs, path.dirname(abs));
    return mod.exports;
  }

  return loadModule;
}

const loadTs = createTsLoader();
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { CollectedItemsTable } = loadTs(path.join(frontendRoot, "components/crawler/CollectedItemsTable.tsx"));
const { listItems } = loadTs(path.join(frontendRoot, "lib/api.ts"));

function makeSampleItem(id, category = "market") {
  return {
    id,
    sourceId: 10 + (id % 3),
    sourceName: `Source ${id}`,
    domain: `source${id % 3}.example.com`,
    category,
    title: `Collected article headline #${id}`,
    url: `https://source${id % 3}.example.com/articles/${id}`,
    publishedAt: "2026-11-20T10:00:00Z",
    publishedAtMethod: "rss",
    fetchedAt: new Date(Date.now() - id * 60_000).toISOString(),
    change: "new",
    contentHash: `hash-${id}`,
    excerpt: "Sample collected evidence excerpt before analysis.",
  };
}

test("CollectedItemsTable never renders empty state when API returns items", async () => {
  const apiPayload = {
    items: Array.from({ length: 25 }, (_, idx) =>
      makeSampleItem(idx + 1, idx % 3 === 0 ? "customers" : idx % 3 === 1 ? "competitors" : "market"),
    ),
    nextCursor: "25",
    total: 44,
  };

  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(apiPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const res = await listItems(1, { category: "all", change: "all", q: "" });
    assert.equal(requestedUrl, "/api/companies/1/crawler/items");
    assert.equal(res.items.length, 25);
    assert.equal(res.total, 44);

    const html = renderToStaticMarkup(
      React.createElement(CollectedItemsTable, {
        items: res.items,
        total: res.total,
        sources: [],
        filters: { category: "all", change: "all", q: "" },
        isLoading: false,
        hasMore: Boolean(res.nextCursor),
        loadingMore: false,
        onFiltersChange: () => {},
        onSelectItem: () => {},
        onLoadMore: () => {},
      }),
    );

    assert.equal(
      html.includes("No collected items yet"),
      false,
      "Collected evidence panel rendered empty state even though API returned items",
    );
    assert.ok(html.includes("Collected article headline #1"));
    assert.ok(html.includes("source1.example.com"));
    assert.ok(html.includes('href="https://source1.example.com/articles/1"'));
    assert.ok(html.includes("Showing 25 of 44 items"));
    assert.ok(html.includes("Load more items"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CollectedItemsTable shows loading state while refreshing and empty state only when truly empty", () => {
  const loadingHtml = renderToStaticMarkup(
    React.createElement(CollectedItemsTable, {
      items: [],
      total: 0,
      sources: [],
      filters: { category: "all", change: "all", q: "" },
      isLoading: true,
      hasMore: false,
      loadingMore: false,
      onFiltersChange: () => {},
      onSelectItem: () => {},
      onLoadMore: () => {},
    }),
  );
  assert.equal(loadingHtml.includes("No collected items yet"), false);
  assert.ok(loadingHtml.includes("Loading collected evidence"));

  const emptyHtml = renderToStaticMarkup(
    React.createElement(CollectedItemsTable, {
      items: [],
      total: 0,
      sources: [],
      filters: { category: "all", change: "all", q: "" },
      isLoading: false,
      hasMore: false,
      loadingMore: false,
      onFiltersChange: () => {},
      onSelectItem: () => {},
      onLoadMore: () => {},
    }),
  );
  assert.ok(emptyHtml.includes("No collected items yet"));
});

test("Crawler hooks invalidate crawler-items on run completion without manual reload", () => {
  const overviewSrc = fs.readFileSync(
    path.join(frontendRoot, "hooks/useCrawlerOverview.ts"),
    "utf8",
  );
  const runLogsSrc = fs.readFileSync(
    path.join(frontendRoot, "hooks/useRunLogs.ts"),
    "utf8",
  );
  assert.ok(overviewSrc.includes('queryKey: ["crawler-items", companyId]'));
  assert.ok(runLogsSrc.includes("notifyFinished(runId)"));
  assert.ok(runLogsSrc.includes("getRun(companyId, runId)"));
});

test("HTTP 500 without JSON body probes /api/health and reports backend reachability", async () => {
  const { startResearch } = loadTs(path.join(frontendRoot, "lib/api.ts"));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/companies/research")) {
      return new Response("", { status: 500, statusText: "Internal Server Error" });
    }
    if (url.endsWith("/api/health")) {
      return new Response("", { status: 502, statusText: "Bad Gateway" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    await assert.rejects(
      () => startResearch({ companyName: "Zomato", websiteUrl: "https://www.zomato.com" }),
      (err) => {
        assert.ok(err.message.includes("Backend not reachable"));
        return true;
      },
    );
    assert.deepEqual(calls, ["/api/companies/research", "/api/health"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("startResearch stops polling on job error and enforces polling deadline cap", async () => {
  const { startResearch } = loadTs(path.join(frontendRoot, "lib/api.ts"));
  const originalFetch = globalThis.fetch;

  // 1. Stops on terminal error status and surfaces backend error
  let pollCount = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/companies/research")) {
      return new Response(
        JSON.stringify({ job_id: 45, company_id: 9, job: "research", status: "running", stage: "reading_website", at: "2026-11-21T00:00:00Z" }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/api/jobs/45")) {
      pollCount += 1;
      return new Response(
        JSON.stringify({
          job_id: 45,
          company_id: 9,
          job: "research",
          status: "error",
          error: "Site did not respond within 30s: www.zomato.com",
          status_code: 502,
          at: "2026-11-21T00:00:30Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    await assert.rejects(
      () =>
        startResearch({
          companyName: "Zomato",
          websiteUrl: "https://zomato.com",
          pollIntervalMs: 5,
          maxWaitMs: 500,
        }),
      (err) => err.message.includes("Site did not respond within 30s: www.zomato.com"),
    );
    assert.equal(pollCount, 1);

    // 2. Stops polling when job stays running past maxWaitMs deadline
    let stuckPolls = 0;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/companies/research")) {
        return new Response(
          JSON.stringify({ job_id: 46, company_id: 9, job: "research", status: "running", stage: "reading_website", at: "2026-11-21T00:00:00Z" }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/jobs/46")) {
        stuckPolls += 1;
        return new Response(
          JSON.stringify({ job_id: 46, company_id: 9, job: "research", status: "running", stage: "reading_website", at: "2026-11-21T00:00:00Z" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await assert.rejects(
      () =>
        startResearch({
          companyName: "Zomato",
          websiteUrl: "https://zomato.com",
          pollIntervalMs: 10,
          maxWaitMs: 35,
        }),
      (err) => err.message.includes("did not finish within"),
    );
    assert.ok(stuckPolls >= 1 && stuckPolls <= 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
