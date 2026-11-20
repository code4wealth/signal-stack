"use client";

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={`glass rounded-2xl border border-dashed px-6 py-8 text-center ${
        tone === "error" ? "border-[#DC2626]/30 bg-[#DC2626]/5" : "border-[#94A3B8]/50"
      }`}
    >
      {icon ? <div className="mx-auto mb-3 flex justify-center text-[#4B5058]">{icon}</div> : null}
      <p className={`text-sm font-semibold ${tone === "error" ? "text-[#991B1B]" : "text-[#1F2125]"}`}>{title}</p>
      {description ? (
        <p className={`mx-auto mt-1 max-w-[54ch] text-xs leading-relaxed ${tone === "error" ? "text-[#991B1B]/85" : "text-[#4B5058]"}`}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}
