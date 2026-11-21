"use client";

import type { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/company/${params?.id ?? ""}`;
  const isFullBleed =
    pathname === base ||
    pathname === `${base}/interview` ||
    pathname === `${base}/dashboard`;

  if (isFullBleed) {
    return <>{children}</>;
  }

  return <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">{children}</div>;
}
