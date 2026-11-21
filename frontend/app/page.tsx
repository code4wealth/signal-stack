"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-[#4B5058]">
            <span>Existing workspaces:</span>
            {existingCompanies.slice(0, 4).map((company) => (
              <Link
                key={company.id}
                href={`/company/${company.id}/dashboard`}
                className="focus-ring inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/60 px-3 py-1 font-medium text-[#1F2125] no-underline shadow-sm backdrop-blur-md hover:bg-white"
              >
                {company.name} <ArrowRight size={11} />
              </Link>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
