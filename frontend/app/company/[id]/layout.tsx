"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
import { ErrorNote, Loading } from "@/components/ui";

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Company</p>
          <h1 className="text-2xl font-semibold text-slate-100">{company ? company.name : `#${companyId}`}</h1>
          {company ? (
            <a href={company.website} target="_blank" rel="noreferrer" className="text-xs text-accent">
              {company.website}
            </a>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-white/5 bg-secondary/60 p-1">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === "" ? pathname === base : pathname === href;
          return (
            <Link
              key={tab.href}
              href={href}
              className={`rounded-lg px-3 py-2 text-sm no-underline transition ${
                active ? "bg-primary text-white" : "text-slate-300 hover:bg-white/5 hover:text-accent"
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
