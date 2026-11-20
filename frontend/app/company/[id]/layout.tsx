"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
import { BackendStatus } from "@/components/backend-status";
import { Badge, ErrorNote, Loading } from "@/components/ui";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/interview", label: "Interview" },
  { href: "/competitors", label: "Competitors" },
  { href: "/sources", label: "Sources" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/briefs", label: "Briefs" },
  { href: "/automation", label: "Automation" },
];

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const companyId = Number(params?.id);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(companyId)) return;
    let cancelled = false;
    api
      .getCompany(companyId)
      .then((result) => {
        if (!cancelled) setCompany(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load company.");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const base = `/company/${companyId}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="18" height="4.2" rx="2.1" fill="#0D9488" />
                <rect x="3" y="9.9" width="14" height="4.2" rx="2.1" fill="#EA580C" />
                <rect x="3" y="15.8" width="10" height="4.2" rx="2.1" fill="#2563EB" />
              </svg>
              <span className="text-base font-semibold tracking-[-0.02em]">Signal Stack</span>
            </Link>
            <Link
              href="/"
              className="hidden items-center gap-1.5 text-xs font-medium text-muted no-underline hover:text-ink sm:inline-flex"
            >
              <ArrowLeft size={13} /> New research
            </Link>
          </div>
          <BackendStatus />
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-[1280px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                {company ? company.name : `Company #${companyId}`}
              </h1>
              {company ? (
                <Badge tone={company.has_profile ? "ok" : "warn"}>
                  {company.has_profile ? "Profile ready" : "Research pending"}
                </Badge>
              ) : null}
            </div>
            {company ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-brandBlue no-underline hover:underline"
              >
                {company.website} <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Company sections"
          className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5"
        >
          {TABS.map((tab) => {
            const href = `${base}${tab.href}`;
            const active = tab.href === "" ? pathname === base : pathname === href;
            return (
              <Link
                key={tab.href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium no-underline transition-colors ${
                  active
                    ? "bg-[#1C1D21] text-white shadow-sm"
                    : "text-muted hover:bg-white/75 hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {error ? <ErrorNote message={error} /> : null}
        {!company && !error ? <Loading label="Loading company…" /> : null}
        {children}
      </main>
    </div>
  );
}
