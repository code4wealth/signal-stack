"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { AmbientBlobs } from "@/components/motion/AmbientBlobs";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { api, getCompany } from "@/lib/api";
import { adaptCompanyDetail, buildDevMockCompany } from "@/lib/company-adapter";
import { DURATIONS, MOTION_EASE } from "@/lib/motion";

type AppShellContextValue = {
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  toggleFocusMode: () => void;
  openCommandPalette: () => void;
};

const AppShellContext = createContext<AppShellContextValue>({
  focusMode: false,
  setFocusMode: () => {},
  toggleFocusMode: () => {},
  openCommandPalette: () => {},
});

export function useAppShell() {
  return useContext(AppShellContext);
}

function AppShellInner({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const companyId = Number(params?.id || 1);
  const resolvedCompanyId = Number.isFinite(companyId) ? companyId : 1;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { reduced } = useMotionSafe();

  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Warm Next.js route chunks for the current company workspace so tab switches feel instant.
  useEffect(() => {
    if (!Number.isFinite(resolvedCompanyId) || resolvedCompanyId <= 0) return;
    const base = `/company/${resolvedCompanyId}`;
    const timer = window.setTimeout(() => {
      for (const route of [
        `${base}/dashboard`,
        base,
        `${base}/interview`,
        `${base}/signal-stack`,
        `${base}/competitors`,
        `${base}/crawler`,
        `${base}/signals`,
        `${base}/brief`,
        `${base}/automation`,
      ]) {
        router.prefetch(route);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [resolvedCompanyId, router]);

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (useMocks) return buildDevMockCompany(companyId);
      const raw = await getCompany(companyId);
      return adaptCompanyDetail(raw);
    },
    enabled: Number.isFinite(companyId) && companyId > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => api.listCompanies(),
    staleTime: 60_000,
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
        openCommandPalette: () => setCmdOpen(true),
      }}
    >
      <div className="relative flex min-h-screen">
        <AmbientBlobs className="bg-blobs-app" />

        {!focusMode ? (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATIONS.base, ease: MOTION_EASE }}
            className="flex"
          >
            <Sidebar
              companyId={resolvedCompanyId}
              company={company}
              companies={companies}
              mobileOpen={mobileOpen}
              onCloseMobile={() => setMobileOpen(false)}
              onOpenCommandPalette={() => setCmdOpen(true)}
            />
          </motion.div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            companyId={resolvedCompanyId}
            companyName={company?.name ?? `Company #${companyId}`}
            onOpenMobileMenu={() => setMobileOpen(true)}
            onOpenCommandPalette={() => setCmdOpen(true)}
          />
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
        </div>

        <CommandPalette
          companyId={resolvedCompanyId}
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
        />
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
            staleTime: 30_000,
            gcTime: 5 * 60_000,
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
