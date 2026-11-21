"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

import { api } from "@/lib/api";
import type { Company } from "@/lib/types";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { SignalStackIllustration } from "@/components/landing/SignalStackIllustration";
import { CompanySetupPanel } from "@/components/landing/CompanySetupPanel";
import { QuickFillChips } from "@/components/landing/QuickFillChips";

export default function LandingPage() {
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [existingCompanies, setExistingCompanies] = useState<Company[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listCompanies()
      .then((res) => {
        if (active) setExistingCompanies(res.items);
      })
      .catch(() => {
        // Keep the hero clean if the backend is offline until the user submits
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = workspaceSearch.trim().toLowerCase();
    if (!q) return existingCompanies.slice(0, 6);
    return existingCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.website.toLowerCase().includes(q) ||
        (c.context || "").toLowerCase().includes(q),
    );
  }, [existingCompanies, workspaceSearch]);

  function scrollToSetupAndFocus() {
    const panel = document.getElementById("company-setup");
    panel?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => nameInputRef.current?.focus(), 220);
  }

  return (
    <div className="flex min-h-screen flex-col px-4 pb-12 pt-6 sm:px-6">
      <Navbar onScrollToSetup={scrollToSetupAndFocus} />

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center"
      >
        <Hero onStartClick={scrollToSetupAndFocus} />

        <SignalStackIllustration />

        <CompanySetupPanel
          companyName={companyName}
          websiteUrl={websiteUrl}
          onCompanyNameChange={setCompanyName}
          onWebsiteUrlChange={setWebsiteUrl}
          nameInputRef={nameInputRef}
        />

        <QuickFillChips
          onSelect={(sample) => {
            setCompanyName(sample.name);
            setWebsiteUrl(sample.website);
            nameInputRef.current?.focus();
          }}
        />

        {existingCompanies.length > 0 ? (
          <div className="mt-6 flex w-full max-w-2xl flex-col items-center gap-3 text-xs text-[#4B5058]">
            {existingCompanies.length > 3 ? (
              <div className="relative w-full max-w-sm">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                  placeholder="Search your existing companies…"
                  aria-label="Search existing company workspaces"
                  className="focus-ring w-full rounded-full border border-white/80 bg-white/70 py-1.5 pl-8 pr-3 text-xs text-[#1F2125] shadow-sm backdrop-blur-md placeholder:text-[#9AA0AA]"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span>Your workspaces:</span>
              {filteredCompanies.length > 0 ? (
                filteredCompanies.map((company) => (
                  <Link
                    key={company.id}
                    href={`/company/${company.id}/dashboard`}
                    className="focus-ring inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/60 px-3 py-1 font-medium text-[#1F2125] no-underline shadow-sm backdrop-blur-md hover:bg-white"
                  >
                    {company.name} <ArrowRight size={11} />
                  </Link>
                ))
              ) : (
                <span className="text-[#9AA0AA]">
                  No workspace matches &ldquo;{workspaceSearch.trim()}&rdquo; — submit the form above to research it.
                </span>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
