"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
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
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted no-underline hover:text-ink"
        >
          <ArrowLeft size={13} /> All companies
        </Link>
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
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-accent no-underline hover:underline"
              >
                {company.website} <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <nav
        aria-label="Company sections"
        className="flex gap-1 overflow-x-auto rounded-[12px] border border-[rgba(233,237,243,0.09)] bg-surface p-1.5"
      >
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === "" ? pathname === base : pathname === href;
          return (
            <Link
              key={tab.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-[8px] px-3.5 py-2 text-sm font-medium no-underline transition-colors ${
                active
                  ? "bg-accent text-[#07101d]"
                  : "text-muted hover:bg-[rgba(233,237,243,0.06)] hover:text-ink"
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
    </div>
  );
}
