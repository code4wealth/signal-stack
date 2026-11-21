"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bot,
  Building2,
  Compass,
  FileSpreadsheet,
  FileText,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Play,
  Radar,
  Search,
  Sparkles,
  Swords,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { runAnalysis, searchWorkspace, startCrawl } from "@/lib/api";
import { extractDomain } from "@/lib/company-adapter";
import { commandDialogMotion, FAST_TRANSITION } from "@/lib/motion";
import type { Company, WorkspaceSearchResponse } from "@/lib/types";
import { CategoryBadge, ClassificationPill } from "@/components/ui-shared";

type PaletteItem = {
  id: string;
  group: "Companies" | "Navigate" | "Actions" | "Signals" | "Sources";
  label: string;
  subtitle?: string;
  href?: string;
  onAction?: () => Promise<void> | void;
  signalId?: number;
  category?: "customers" | "competitors" | "market" | "internal";
  classification?: "opportunity" | "threat" | "neutral";
  Icon: typeof Compass;
};

const RECENT_KEY_PREFIX = "signalstack:cmd_recent:";

export function CommandPalette({
  companyId,
  companies = [],
  open,
  onClose,
}: {
  companyId: number;
  companies?: Company[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { reduced } = useMotionSafe();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [results, setResults] = useState<WorkspaceSearchResponse>({ signals: [], sources: [] });
  const [searching, setSearching] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    try {
      const raw = window.localStorage.getItem(`${RECENT_KEY_PREFIX}${companyId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setRecentQueries(parsed.filter((v): v is string => typeof v === "string").slice(0, 4));
        }
      }
    } catch {
      /* ignore storage errors */
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [companyId, open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ signals: [], sources: [] });
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchWorkspace(companyId, trimmed)
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => {
          if (!cancelled) setResults({ signals: [], sources: [] });
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companyId, open, query]);

  const base = `/company/${companyId}`;

  const items = useMemo<PaletteItem[]>(() => {
    const qLower = query.trim().toLowerCase();

    const navBase: PaletteItem[] = [
      { id: "nav-dash", group: "Navigate", label: "Dashboard", subtitle: "Mission control overview", href: `${base}/dashboard`, Icon: LayoutDashboard },
      { id: "nav-company", group: "Navigate", label: "Company Profile", subtitle: "Step 1 · Company details & evidence", href: base, Icon: Building2 },
      { id: "nav-interview", group: "Navigate", label: "Founder Interview", subtitle: "Step 2 · Strategic context Q&A", href: `${base}/interview`, Icon: MessageSquare },
      { id: "nav-stack", group: "Navigate", label: "Signal Stack", subtitle: "Step 3 · Curate monitored sources", href: `${base}/signal-stack`, Icon: Layers },
      { id: "nav-crawler", group: "Navigate", label: "Crawler Monitor", subtitle: "Step 4 · Live crawl runs & logs", href: `${base}/crawler`, Icon: Bot },
      { id: "nav-signals", group: "Navigate", label: "Signals Feed", subtitle: "Step 5 · Opportunities, threats & Ask AI", href: `${base}/signals`, Icon: Radar },
      { id: "nav-briefs", group: "Navigate", label: "Monday Morning Briefs", subtitle: "Step 6 · Weekly executive report", href: `${base}/brief`, Icon: FileText },
      { id: "nav-competitors", group: "Navigate", label: "Competitors", subtitle: "Competitor profiles & positioning", href: `${base}/competitors`, Icon: Swords },
      { id: "nav-auto", group: "Navigate", label: "Automation & Internal Data", subtitle: "Uploads, schedules & job history", href: `${base}/automation`, Icon: Activity },
    ];
    const navItems = navBase.filter(
      (item) => !qLower || `${item.label} ${item.subtitle ?? ""}`.toLowerCase().includes(qLower),
    );

    const actionBase: PaletteItem[] = [
      {
        id: "act-crawl",
        group: "Actions",
        label: "Run crawl now",
        subtitle: "Collect fresh pages from approved sources",
        Icon: Play,
        onAction: async () => {
          await startCrawl(companyId);
          router.push(`${base}/crawler`);
        },
      },
      {
        id: "act-analyse",
        group: "Actions",
        label: "Analyse new evidence",
        subtitle: "Score and classify unanalysed records",
        Icon: Sparkles,
        onAction: async () => {
          await runAnalysis(companyId);
          router.push(`${base}/signals`);
        },
      },
      {
        id: "act-brief",
        group: "Actions",
        label: "Open Monday Brief",
        subtitle: "Review or generate weekly executive brief",
        href: `${base}/brief`,
        Icon: FileSpreadsheet,
      },
      {
        id: "act-new-company",
        group: "Actions",
        label: "Research a new company",
        subtitle: "Search and create a workspace for any company",
        href: "/",
        Icon: Search,
      },
    ];
    const actionItems = actionBase.filter(
      (item) => !qLower || `${item.label} ${item.subtitle ?? ""}`.toLowerCase().includes(qLower),
    );

    const companyItems: PaletteItem[] = companies
      .filter(
        (c) =>
          !qLower ||
          `${c.name} ${c.website} ${c.context ?? ""}`.toLowerCase().includes(qLower),
      )
      .slice(0, 8)
      .map((c) => ({
        id: `co-${c.id}`,
        group: "Companies",
        label: c.name,
        subtitle: `${extractDomain(c.website)}${c.id === companyId ? " · current" : ""}`,
        href: `/company/${c.id}/dashboard`,
        Icon: Building2,
      }));

    const signalItems: PaletteItem[] = results.signals.map((sig) => ({
      id: `sig-${sig.id}`,
      group: "Signals",
      label: sig.headline,
      subtitle: sig.sourceDomains[0] ?? sig.sourceName,
      href: `${base}/signals?signal=${sig.id}`,
      category: sig.category,
      classification: sig.classification,
      Icon: Radar,
    }));

    const sourceItems: PaletteItem[] = results.sources.map((src) => ({
      id: `src-${src.id}`,
      group: "Sources",
      label: src.name,
      subtitle: src.domain,
      href: `${base}/signal-stack`,
      category: src.category,
      Icon: Layers,
    }));

    return [...signalItems, ...sourceItems, ...companyItems, ...actionItems, ...navItems];
  }, [base, companies, companyId, query, results.signals, results.sources, router]);

  const executeItem = (item: PaletteItem) => {
    const trimmed = query.trim();
    if (trimmed) {
      try {
        const next = [trimmed, ...recentQueries.filter((q) => q !== trimmed)].slice(0, 4);
        window.localStorage.setItem(`${RECENT_KEY_PREFIX}${companyId}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    onClose();
    if (item.onAction) {
      void item.onAction();
      return;
    }
    if (item.href) {
      router.push(item.href);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) =>
          items.length === 0 ? 0 : (prev - 1 + items.length) % items.length,
        );
      } else if (e.key === "Enter" && items[activeIdx]) {
        e.preventDefault();
        executeItem(items[activeIdx]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!open) return null;

  const grouped = (["Signals", "Sources", "Companies", "Actions", "Navigate"] as const)
    .map((groupName) => ({
      groupName,
      entries: items
        .map((item, globalIndex) => ({ item, globalIndex }))
        .filter(({ item }) => item.group === groupName),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FAST_TRANSITION}
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.div
          variants={commandDialogMotion(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="glass-strong relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-white/90 shadow-2xl"
        >
          <div className="flex items-center gap-2.5 border-b border-[#1F2125]/8 px-4 py-3">
            <Search size={16} className="shrink-0 text-[#4F46E5]" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              placeholder="Jump to a page, search signals or sources, or run an action…"
              aria-label="Search workspace commands"
              className="w-full bg-transparent text-sm text-[#1F2125] placeholder:text-[#9AA0AA] focus:outline-none"
            />
            {searching ? (
              <span className="font-mono text-[10.5px] text-[#4F46E5]">Searching…</span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close command palette"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={15} />
            </button>
          </div>

          {!query.trim() && recentQueries.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[#1F2125]/6 px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
                Recent:
              </span>
              {recentQueries.map((rq) => (
                <button
                  key={rq}
                  type="button"
                  onClick={() => setQuery(rq)}
                  className="focus-ring rounded-full border border-[#1F2125]/10 bg-white/80 px-2.5 py-0.5 text-[11px] text-[#4B5058] hover:text-[#1F2125]"
                >
                  {rq}
                </button>
              ))}
            </div>
          ) : null}

          <div className="max-h-[54vh] overflow-y-auto p-2">
            {grouped.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[#4B5058]">
                No matching pages, signals, or sources found.
              </p>
            ) : (
              grouped.map((g) => (
                <div key={g.groupName} className="mb-2 last:mb-0">
                  <p className="px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
                    {g.groupName}
                  </p>
                  <ul role="listbox" className="space-y-0.5">
                    {g.entries.map(({ item, globalIndex }) => {
                      const Icon = item.Icon;
                      const active = globalIndex === activeIdx;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setActiveIdx(globalIndex)}
                            onClick={() => executeItem(item)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                              active
                                ? "bg-[#1C1D21] text-white"
                                : "text-[#1F2125] hover:bg-white/80"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Icon
                                size={15}
                                className={active ? "text-white" : "text-[#4B5058]"}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{item.label}</p>
                                {item.subtitle ? (
                                  <p
                                    className={`truncate font-mono text-[10.5px] ${
                                      active ? "text-white/70" : "text-[#9AA0AA]"
                                    }`}
                                  >
                                    {item.subtitle}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.category ? <CategoryBadge category={item.category} /> : null}
                              {item.classification ? (
                                <ClassificationPill classification={item.classification} compact />
                              ) : null}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#1F2125]/8 bg-white/60 px-4 py-2 font-mono text-[10.5px] text-[#9AA0AA]">
            <div className="flex items-center gap-3">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            <span>⌘K / Ctrl+K</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
