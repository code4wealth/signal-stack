"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function IntelligenceRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!params?.id) return;
    const qs = searchParams.toString();
    router.replace(`/company/${params.id}/signals${qs ? `?${qs}` : ""}`);
  }, [params?.id, router, searchParams]);

  return null;
}
