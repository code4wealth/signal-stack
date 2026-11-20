"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";

import { BackendStatus } from "@/components/backend-status";

function resolveStepLabel(pathname: string, companyId: number): string {
  const base = `/company/${companyId}`;
  if (pathname === base) return "Step 1 of 6: Review company profile";
  if (pathname === `${base}/interview`) return "Step 2 of 6: Founder interview";
  if (pathname === `${base}/signal-stack` || pathname === `${base}/sources`) {
    return "Step 3 of 6: Build your Signal Stack";
  }
  if (pathname === `${base}/competitors`) return "Step 4 of 6: Competitor discovery";
  if (pathname === `${base}/intelligence` || pathname === `${base}/crawler`) {
    return "Step 4 of 6: Crawl & rank intelligence";
  }
  if (pathname === `${base}/briefs`) return "Step 6 of 6: Monday Morning Brief";
  if (pathname === `${base}/automation`) return "Operations: Automation & documents";
  return "Signal Stack workspace";
}

function resolveSectionLabel(pathname: string, companyId: number): string | null {
  const base = `/company/${companyId}`;
  if (pathname === `${base}/interview`) return "Interview";
  if (pathname === `${base}/competitors`) return "Competitors";
  if (pathname === `${base}/sources` || pathname === `${base}/signal-stack`) return "Signal Stack";
  if (pathname === `${base}/intelligence`) return "Signals";
  if (pathname === `${base}/crawler`) return "Crawler";
  if (pathname === `${base}/briefs`) return "Briefs";
  if (pathname === `${base}/automation`) return "Automation";
  return null;
}

export function TopBar({
  companyId,
  companyName,
  onOpenMobileMenu,
}: {
  companyId: number;
  companyName: string;
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const stepText = resolveStepLabel(pathname, companyId);
  const sectionLabel = resolveSectionLabel(pathname, companyId);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-white/60 bg-white/55 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open workspace navigation"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/75 text-[#1F2125] md:hidden"
        >
          <Menu size={16} strokeWidth={1.75} />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
          <Link
            href="/"
            className="text-[#9AA0AA] no-underline transition-colors hover:text-[#1F2125]"
          >
            Companies
          </Link>
          <ChevronRight size={13} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
          {sectionLabel ? (
            <>
              <Link
                href={`/company/${companyId}`}
                className="truncate text-[#9AA0AA] no-underline transition-colors hover:text-[#1F2125]"
              >
                {companyName}
              </Link>
              <ChevronRight size={13} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
              <span className="truncate font-medium text-[#1F2125]">{sectionLabel}</span>
            </>
          ) : (
            <span className="truncate font-medium text-[#1F2125]">{companyName}</span>
          )}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden font-mono text-[11.5px] text-[#4B5058] sm:inline">{stepText}</span>
        <BackendStatus />
      </div>
    </header>
  );
}
