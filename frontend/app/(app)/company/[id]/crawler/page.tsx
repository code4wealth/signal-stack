"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { SkeletonBlock } from "@/components/ui-shared";

export default function CrawlerRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const companyId = params?.id;

  useEffect(() => {
    if (companyId) {
      router.replace(`/company/${companyId}/intelligence`);
    }
  }, [companyId, router]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <SkeletonBlock className="h-8 w-52" />
      <SkeletonBlock className="h-44 w-full rounded-2xl" />
    </div>
  );
}
