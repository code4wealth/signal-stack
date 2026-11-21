"use client";

import type { BriefSourceItem } from "@/lib/types";
import { Cite } from "./Cite";

export function ClaimText({
  text,
  citations,
  sources = [],
  onJumpToSource,
  className = "",
}: {
  text: string;
  citations: number[];
  sources?: BriefSourceItem[];
  onJumpToSource?: (n: number) => void;
  className?: string;
}) {
  return (
    <span className={className}>
      <span>{text}</span>
      <Cite ids={citations} sources={sources} onJumpToSource={onJumpToSource} />
    </span>
  );
}
