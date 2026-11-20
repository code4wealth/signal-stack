"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { api, getCompany } from "@/lib/api";
import { adaptCompanyDetail, buildDevMockCompany } from "@/lib/company-adapter";
import { DURATIONS, MOTION_EASE } from "@/lib/motion";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

type AppShellContextValue = {
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  toggleFocusMode: () => void;
};

const AppShellContext = createContext<AppShellContextValue>({
  focusMode: false,
  setFocusMode: () => {},
  toggleFocusMode: () => {},
});

export function useAppShell() {
  return useContext(AppShellContext);
}

function AppShellInner({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const companyId = Number(params?.id || 1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const reduced = Boolean(useReducedMotion());

  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (useMocks) return buildDevMockCompany(companyId);
      const raw = await getCompany(companyId);
      return adaptCompanyDetail(raw);
    },
    enabled: Number.isFinite(companyId) && companyId > 0,
    retry: 1,
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.listCompanies(),
    retry: 1,
  });

  const company = companyQuery.data ?? null;
  const companies = companiesQuery.data?.items ?? [];

  return (
    <AppShellContext.Provider
      value={{
        focusMode,
        setFocusMode,
        toggleFocusMode: () => setFocusMode((prev) => !prev),
      }}
    >
      <div className="relative flex min-h-screen">
        {/* Subtle 50%-opacity backdrop for dense workspace readability */}
        <div className="bg-blobs bg-blobs-app" aria-hidden="true">
          <div className="bg-blob-tl" />
          <div className="bg-blob-tc" />
          <div className="bg-blob-br" />
        </div>

        {!focusMode ? (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATIONS.base, ease: MOTION_EASE }}
            className="flex"
          >
            <Sidebar
              companyId={Number.isFinite(companyId) ? companyId : 1}
              company={company}
              companies={companies}
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
            />
          </motion.div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            companyId={Number.isFinite(companyId) ? companyId : 1}
            companyName={company?.name ?? `Company #${companyId}`}
            onOpenMobileMenu={() => setMobileOpen(true)}
          />
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppShellInner>{children}</AppShellInner>
    </QueryClientProvider>
  );
}
