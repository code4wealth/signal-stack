"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";

import { BriefReaderView } from "@/components/brief";
import { SkeletonBlock } from "@/components/ui-shared";

export default function CompanyBriefDetailPage() {
  const params = useParams<{ id: string; briefId: string }>();
  const companyId = Number(params?.id ?? "0");
  const briefId = typeof params?.briefId === "string" ? params.briefId : undefined;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6">
          <SkeletonBlock className="h-56 w-full rounded-[24px]" />
        </div>
      }
    >
      <BriefReaderView companyId={companyId} briefId={briefId} />
    </Suspense>
  );
}
