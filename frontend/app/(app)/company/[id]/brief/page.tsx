"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function BriefRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params?.id) {
      router.replace(`/company/${params.id}/briefs`);
    }
  }, [params?.id, router]);

  return null;
}
