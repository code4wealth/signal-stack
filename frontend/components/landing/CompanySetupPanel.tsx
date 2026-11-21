"use client";

import { useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bot, FileText, Globe, Paperclip } from "lucide-react";

import { api, ApiError, startResearch, type ResearchStatus } from "@/lib/api";
import { normalizeAndValidateWebsite, validateCompanyName } from "@/lib/validators";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { ResearchProgress } from "@/components/landing/ResearchProgress";

function suggestDomainFromName(name: string): string | null {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|corp|pvt|limited|technologies|tech)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
  return slug.length >= 2 ? `${slug}.com` : null;
}

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

  const [contextText, setContextText] = useState("");
  const [touchedName, setTouchedName] = useState(false);
  const [touchedWebsite, setTouchedWebsite] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [researchError, setResearchError] = useState<string | null>(null);
  const [submittedWebsite, setSubmittedWebsite] = useState("");
  const [continuingAnyway, setContinuingAnyway] = useState(false);

  const nameCheck = validateCompanyName(companyName);
  const siteCheck = normalizeAndValidateWebsite(websiteUrl);
  const isFormValid = nameCheck.valid && siteCheck.valid;
  const suggestedDomain = !websiteUrl.trim() && nameCheck.valid ? suggestDomainFromName(companyName) : null;

  const showNameError = (touchedName || submitAttempted) && !nameCheck.valid;
  const showWebsiteError = (touchedWebsite || submitAttempted) && !siteCheck.valid;

  async function executeResearch(name: string, normalizedSite: string) {
    setResearchError(null);
    setSubmittedWebsite(normalizedSite);
    try {
      const result = await startResearch({
        companyName: name,
        websiteUrl: normalizedSite,
        context: contextText,
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

  async function handleContinueAnyway() {
    if (!nameCheck.valid || !siteCheck.valid) return;
    setContinuingAnyway(true);
    try {
      const created = await api.createCompany({
        name: nameCheck.value,
        website: siteCheck.normalized,
        context: contextText.trim(),
      });
      await api
        .updateCompany(created.id, {
          summary:
            contextText.trim() ||
            `${nameCheck.value} (${siteCheck.normalized}) — initialized without automated website extraction.`,
          unverified: [
            "Initialized from user details because live website extraction was unavailable.",
          ],
        })
        .catch(() => {});
      router.push(`/company/${created.id}`);
    } catch (caught) {
      setResearchError(
        caught instanceof ApiError
          ? caught.message
          : "Could not create workspace right now.",
      );
    } finally {
      setContinuingAnyway(false);
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
            onContinueAnyway={() => void handleContinueAnyway()}
            continuingAnyway={continuingAnyway}
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
                  placeholder="Enter any company name, e.g. Stripe, Swiggy, Acme"
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
                      placeholder="Company website, e.g. stripe.com or yourcompany.io"
                      className="rounded-lg py-1.5 text-[15px] sm:text-base"
                      autoComplete="url"
                    />
                  </div>
                  {suggestedDomain ? (
                    <button
                      type="button"
                      onClick={() => onWebsiteUrlChange(suggestedDomain)}
                      className="focus-ring self-start rounded-full border border-[#4F46E5]/25 bg-[#4F46E5]/8 px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#4F46E5]/15 sm:self-center"
                    >
                      Use {suggestedDomain}
                    </button>
                  ) : null}
                </div>
                {showWebsiteError ? (
                  <p id="company-website-error" className="mt-1 px-2 text-xs font-medium text-[#DC2626]/90">
                    {siteCheck.error}
                  </p>
                ) : null}
              </div>

              {/* Row 3: Optional context */}
              <div className="border-t border-[#1F2125]/8 pt-3">
                <label htmlFor="company-context-input" className="sr-only">
                  What does this company do (optional)
                </label>
                <div className="flex items-center gap-2.5 sm:px-2">
                  <FileText size={16} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
                  <Input
                    id="company-context-input"
                    name="companyContext"
                    type="text"
                    aria-label="Company focus or industry context (optional)"
                    value={contextText}
                    onChange={(event) => setContextText(event.target.value)}
                    placeholder="Optional context: industry, product, or market focus (helps if site blocks crawlers)"
                    className="rounded-lg py-1 text-sm text-[#4B5058]"
                  />
                </div>
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
                <Tooltip content="Upload internal files later in Signal Stack (TXT, CSV, XLSX, PDF — max 2 MB)">
                  <button
                    type="button"
                    aria-label="Upload internal files later in Signal Stack (TXT, CSV, XLSX, PDF — max 2 MB)"
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
