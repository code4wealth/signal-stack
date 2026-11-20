"use client";

import { ExternalLink } from "lucide-react";

import type { CompanyPatchPayload, CompanyRecord } from "@/lib/types";
import { formatDomainPath, formatShortDate } from "@/lib/company-adapter";
import { EditableField } from "@/components/ui-shared";

export function DetailsPanel({
  company,
  onPatchField,
}: {
  company: CompanyRecord;
  onPatchField: (patch: CompanyPatchPayload) => void;
}) {
  const primaryEvidence = company.evidence[0] ?? null;

  const breakdownRows = [
    { label: "Services", pct: company.confidenceBreakdown.services, color: "bg-[#4F46E5]" },
    { label: "Customers", pct: company.confidenceBreakdown.customers, color: "bg-[#0D9488]" },
    { label: "Competitors", pct: company.confidenceBreakdown.competitors, color: "bg-[#EA580C]" },
  ];

  return (
    <aside
      aria-label="Company details"
      className="glass-strong w-full shrink-0 space-y-6 border-t border-white/70 p-5 xl:w-[320px] xl:border-l xl:border-t-0"
    >
      <div>
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
          Company details
        </h2>
        <div className="mt-2 space-y-1">
          <EditableField
            label="Domain"
            value={company.domain}
            mono
            evidence={primaryEvidence}
            onSave={(next) =>
              onPatchField({
                website: /^https?:\/\//i.test(next) ? next : `https://${next}`,
              })
            }
          />
          <EditableField
            label="Industry"
            value={company.industry}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ industry: next })}
          />
          <EditableField
            label="Business model"
            value={company.businessModel}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ business_model: next })}
          />
          <EditableField
            label="Headquarters"
            value={company.headquarters}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ headquarters: next })}
          />
          <EditableField
            label="Founded"
            value={company.founded}
            mono
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ founded: next })}
          />
          <EditableField
            label="Company size"
            value={company.size}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ company_size: next })}
          />
          <EditableField
            label="Primary region"
            value={company.primaryRegion}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ primary_region: next })}
          />
          <EditableField
            label="Primary language"
            value={company.primaryLanguage}
            evidence={primaryEvidence}
            onSave={(next) => onPatchField({ primary_language: next })}
          />
        </div>
      </div>

      <div className="border-t border-[#1F2125]/8 pt-5">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
          Key pages used
        </h3>
        {company.evidence.length === 0 ? (
          <p className="mt-2 text-xs italic text-[#9AA0AA]">No public pages fetched yet.</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {company.evidence.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-[#4B5058] no-underline hover:text-[#2563EB]"
                >
                  <ExternalLink size={11} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
                  <span className="truncate">{formatDomainPath(item.url)}</span>
                </a>
                <span className="shrink-0 font-mono text-[10px] text-[#9AA0AA]">
                  {formatShortDate(item.fetchedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[#1F2125]/8 pt-5">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
          Confidence breakdown
        </h3>
        <div className="mt-3 space-y-3">
          {breakdownRows.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#4B5058]">{row.label}</span>
                <span className="tabular font-mono text-[11px] font-medium text-[#1F2125]">
                  {row.pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                <div
                  className={`h-full rounded-full ${row.color}`}
                  style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
