"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, Globe, Paperclip } from "lucide-react";

import { ApiError, startResearch, type ResearchStatus } from "@/lib/api";
import { normalizeAndValidateWebsite, validateCompanyName } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { ResearchProgress } from "@/components/landing/ResearchProgress";

export function CompanySetupPanel({
  companyName,
  websiteUrl,
  onCompanyNameChange,
  onWebsiteUrlChange,
  nameInputRef,
}: {
  companyName: string;
  websiteUrl: string;
  onCompanyNameChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  nameInputRef: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [touchedName, setTouchedName] = useState(false);
  const [touchedWebsite, setTouchedWebsite] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [researchError, setResearchError] = useState<string | null>(null);
  const [submittedWebsite, setSubmittedWebsite] = useState("");

  const nameCheck = validateCompanyName(companyName);
  const siteCheck = normalizeAndValidateWebsite(websiteUrl);
  const isFormValid = nameCheck.valid && siteCheck.valid;

  const showNameError = (touchedName || submitAttempted) && !nameCheck.valid;
  const showWebsiteError = (touchedWebsite || submitAttempted) && !siteCheck.valid;

  async function executeResearch(name: string, normalizedSite: string) {
    setResearchError(null);
    setSubmittedWebsite(normalizedSite);
    try {
      const result = await startResearch({
        companyName: name,
        websiteUrl: normalizedSite,
        onStatus: setResearchStatus,
      });
      router.push(`/company/${result.companyId}`);
    } catch (caught) {
      setResearchStatus("error");
      if (caught instanceof ApiError) {
        setResearchError(caught.message);
      } else {
        setResearchError("Backend not reachable. Check that the API is running.");
      }
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    setTouchedName(true);
    setTouchedWebsite(true);
    if (!isFormValid) return;
    await executeResearch(nameCheck.value, siteCheck.normalized);
  }

  const isResearchActive = researchStatus !== "idle";

  return (
    <motion.section
      id="company-setup"
      aria-label="Company research setup"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-40 mx-auto w-full max-w-4xl"
    >
      <div className="glass-panel rounded-[28px] p-4 sm:rounded-[32px] sm:p-6">
        {isResearchActive ? (
          <ResearchProgress
            companyName={nameCheck.value || companyName}
            websiteUrl={submittedWebsite || siteCheck.normalized || websiteUrl}
            status={researchStatus}
            error={researchError}
            onRetry={() => void executeResearch(nameCheck.value, siteCheck.normalized)}
            onEdit={() => {
              setResearchStatus("idle");
              setResearchError(null);
            }}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-3 sm:space-y-3.5">
              {/* Row 1: Company name */}
              <div>
                <label htmlFor="company-name-input" className="sr-only">
                  Company name
                </label>
                <Input
                  ref={nameInputRef}
                  id="company-name-input"
                  name="companyName"
                  type="text"
                  aria-label="Company name"
                  aria-invalid={showNameError}
                  aria-describedby={showNameError ? "company-name-error" : undefined}
                  value={companyName}
                  onChange={(event) => onCompanyNameChange(event.target.value)}
                  onBlur={() => setTouchedName(true)}
                  placeholder="Enter your company name, e.g. MeetUniversity"
                  className="rounded-xl px-2 py-2 text-lg font-medium tracking-[-0.015em] sm:text-[21px]"
                  autoComplete="organization"
                />
                {showNameError ? (
                  <p id="company-name-error" className="mt-1 px-2 text-xs font-medium text-[#DC2626]/90">
                    {nameCheck.error}
                  </p>
                ) : null}
              </div>

              {/* Row 2: Website URL */}
              <div className="border-t border-[#1F2125]/8 pt-3">
                <label htmlFor="company-website-input" className="sr-only">
                  Company website
                </label>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5 sm:px-2">
                  <div className="flex items-center gap-2.5 flex-1">
                    <Globe size={17} className="shrink-0 text-[#4B5058]" aria-hidden="true" />
                    <Input
                      id="company-website-input"
                      name="websiteUrl"
                      type="text"
                      inputMode="url"
                      aria-label="Company website"
                      aria-invalid={showWebsiteError}
                      aria-describedby={showWebsiteError ? "company-website-error" : undefined}
                      value={websiteUrl}
                      onChange={(event) => onWebsiteUrlChange(event.target.value)}
                      onBlur={() => setTouchedWebsite(true)}
                      placeholder="Company website, e.g. meetuniversity.com"
                      className="rounded-lg py-1.5 text-[15px] sm:text-base"
                      autoComplete="url"
                    />
                  </div>
                </div>
                {showWebsiteError ? (
                  <p id="company-website-error" className="mt-1 px-2 text-xs font-medium text-[#DC2626]/90">
                    {siteCheck.error}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Bottom bar: decorative source/tool hints + submit button */}
            <div className="mt-5 flex items-center justify-between gap-3 pt-1">
              <div id="sources" className="flex items-center gap-2">
                <Tooltip content="Public sources only">
                  <button
                    type="button"
                    aria-label="Public sources only"
                    className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/60 text-[#4B5058] transition-colors hover:bg-white hover:text-[#1F2125]"
                  >
                    <Globe size={16} />
                  </button>
                </Tooltip>
                <Tooltip content="Upload internal files later (CSV, Excel, PDF, TXT)">
                  <button
                    type="button"
                    aria-label="Upload internal files later (CSV, Excel, PDF, TXT)"
                    className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/60 text-[#4B5058] transition-colors hover:bg-white hover:text-[#1F2125]"
                  >
                    <Paperclip size={16} />
                  </button>
                </Tooltip>
                <Tooltip content="AI will research and interview you">
                  <button
                    type="button"
                    aria-label="AI will research and interview you"
                    className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white/60 text-[#4B5058] transition-colors hover:bg-white hover:text-[#1F2125]"
                  >
                    <Bot size={16} />
                  </button>
                </Tooltip>
              </div>

              <button
                type="submit"
                aria-label="Start company research"
                className={`btn-motion focus-ring flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                  isFormValid
                    ? "bg-[#1C1D21] text-white shadow-[0_8px_20px_rgba(28,29,33,0.22)] hover:bg-[#2a2c32]"
                    : "bg-[#1F2125]/12 text-[#4B5058] hover:bg-[#1F2125]/18"
                }`}
              >
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        )}
      </div>
    </motion.section>
  );
}
