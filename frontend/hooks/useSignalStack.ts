"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addSignalStackSource,
  ApiError,
  applyAudit,
  bulkUpdateSources,
  confirmSignalStack,
  deleteInternalFile,
  deleteSignalStackSource,
  getSignalStack,
  recheckSignalStackSource,
  runSignalStackDiscovery,
  updateSignalStackSource,
  uploadInternalFile,
} from "@/lib/api";
import { buildDevMockSignalStack } from "@/lib/company-adapter";
import type {
  SignalStack,
  SignalStackSource,
  SignalStackSourcePatch,
  SourceCategory,
} from "@/lib/types";

function recomputeCounts(sources: SignalStackSource[], internalCount: number): SignalStack["counts"] {
  const counts: SignalStack["counts"] = {
    customers: 0,
    competitors: 0,
    market: 0,
    internal: internalCount,
    approved: 0,
    needs_review: 0,
    rejected: 0,
    failing: 0,
    blocked: 0,
  };
  for (const s of sources) {
    if (s.category in counts) {
      counts[s.category as keyof typeof counts] += 1;
    }
    if (s.status in counts) {
      counts[s.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

export function useSignalStack(companyId: number, enabled = true) {
  const queryClient = useQueryClient();
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const queryKey = ["signal-stack", companyId] as const;

  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");
  const [justApprovedId, setJustApprovedId] = useState<number | null>(null);
  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());

  const query = useQuery<SignalStack>({
    queryKey,
    queryFn: async () => {
      if (useMocks) return buildDevMockSignalStack(companyId);
      return getSignalStack(companyId);
    },
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    staleTime: 30_000,
    refetchInterval: (q) => {
      const st = q.state.data?.discoveryStatus;
      return st === "queued" || st === "running" ? 3000 : false;
    },
  });

  const patchSourceMutation = useMutation({
    mutationFn: async (vars: { sourceId: number; patch: SignalStackSourcePatch }) => {
      if (useMocks) return null;
      return updateSignalStackSource(companyId, vars.sourceId, vars.patch);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<SignalStack>(queryKey);
      if (previous) {
        const nextSources = previous.sources.map((src) =>
          src.id === vars.sourceId ? { ...src, ...vars.patch } : src,
        );
        queryClient.setQueryData<SignalStack>(queryKey, {
          ...previous,
          sources: nextSources,
          counts: recomputeCounts(nextSources, previous.internalFiles.length),
        });
      }
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      const msg = err instanceof ApiError ? err.message : "Could not update source — rolled back.";
      setToast({ message: msg, tone: "error" });
      setLiveAnnouncement(msg);
    },
    onSuccess: (updated, vars) => {
      if (updated) {
        const prev = queryClient.getQueryData<SignalStack>(queryKey);
        if (prev) {
          const nextSources = prev.sources.map((src) =>
            src.id === updated.id ? updated : src,
          );
          queryClient.setQueryData<SignalStack>(queryKey, {
            ...prev,
            sources: nextSources,
            counts: recomputeCounts(nextSources, prev.internalFiles.length),
          });
        }
      }
      if (vars.patch.status === "approved") {
        setJustApprovedId(vars.sourceId);
        setTimeout(() => setJustApprovedId((cur) => (cur === vars.sourceId ? null : cur)), 800);
        setToast({ message: "Source approved.", tone: "ok" });
        setLiveAnnouncement("Source approved.");
      } else if (vars.patch.status === "rejected") {
        setToast({ message: "Source rejected.", tone: "ok" });
        setLiveAnnouncement("Source rejected.");
      } else {
        setToast({ message: "Source updated.", tone: "ok" });
      }
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["crawler-overview", companyId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (vars: { ids: number[]; patch: SignalStackSourcePatch }) => {
      if (useMocks) return null;
      return bulkUpdateSources(companyId, vars.ids, vars.patch);
    },
    onSuccess: (next, vars) => {
      if (next) queryClient.setQueryData(queryKey, next);
      const msg = `Approved ${vars.ids.length} recommended source${vars.ids.length === 1 ? "" : "s"}.`;
      setToast({ message: msg, tone: "ok" });
      setLiveAnnouncement(msg);
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["crawler-overview", companyId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Bulk update failed.";
      setToast({ message: msg, tone: "error" });
      setLiveAnnouncement(msg);
    },
  });

  const discoverMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return null;
      return runSignalStackDiscovery(companyId);
    },
    onSuccess: () => {
      setToast({ message: "Running live source discovery…", tone: "ok" });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not start discovery.",
        tone: "error",
      });
    },
  });

  const recheckMutation = useMutation({
    mutationFn: async (sourceId: number) => {
      setCheckingIds((prev) => new Set(prev).add(sourceId));
      if (useMocks) return null;
      return recheckSignalStackSource(companyId, sourceId);
    },
    onSettled: (_data, _err, sourceId) => {
      setCheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
    },
    onSuccess: (updated) => {
      if (updated) {
        const prev = queryClient.getQueryData<SignalStack>(queryKey);
        if (prev) {
          const nextSources = prev.sources.map((src) =>
            src.id === updated.id ? updated : src,
          );
          queryClient.setQueryData<SignalStack>(queryKey, {
            ...prev,
            sources: nextSources,
            counts: recomputeCounts(nextSources, prev.internalFiles.length),
          });
        }
      }
      setToast({ message: "Source check finished.", tone: "ok" });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not re-check source.",
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sourceId: number) => {
      if (useMocks) return;
      return deleteSignalStackSource(companyId, sourceId);
    },
    onSuccess: (_data, sourceId) => {
      const prev = queryClient.getQueryData<SignalStack>(queryKey);
      if (prev) {
        const nextSources = prev.sources.filter((src) => src.id !== sourceId);
        queryClient.setQueryData<SignalStack>(queryKey, {
          ...prev,
          sources: nextSources,
          counts: recomputeCounts(nextSources, prev.internalFiles.length),
        });
      }
      setToast({ message: "Source removed.", tone: "ok" });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not remove source.",
        tone: "error",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: {
      url: string;
      name?: string;
      category: SourceCategory;
      reason?: string;
      forceAdd?: boolean;
    }) => {
      if (useMocks) return {};
      return addSignalStackSource(companyId, body);
    },
    onSuccess: () => {
      setToast({ message: "Source added to review queue.", tone: "ok" });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (vars: { file: File; documentType?: string }) => {
      if (useMocks) {
        return {
          filename: vars.file.name,
          document_type: vars.documentType ?? "general",
          characters: vars.file.size,
          label: "user-provided",
        };
      }
      return uploadInternalFile(companyId, vars.file, vars.documentType ?? "general");
    },
    onSuccess: (res) => {
      setToast({ message: `Uploaded ${res.filename}.`, tone: "ok" });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "File upload failed.",
        tone: "error",
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      if (useMocks) return;
      return deleteInternalFile(companyId, fileId);
    },
    onSuccess: () => {
      setToast({ message: "Internal file removed.", tone: "ok" });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not remove file.",
        tone: "error",
      });
    },
  });

  const auditMutation = useMutation({
    mutationFn: async (decisions: { proposalId: string; accepted: boolean }[]) => {
      if (useMocks) return buildDevMockSignalStack(companyId);
      return applyAudit(companyId, decisions);
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      setToast({ message: "Applied monthly source audit changes.", tone: "ok" });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not apply audit changes.",
        tone: "error",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return null;
      return confirmSignalStack(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not confirm Signal Stack.",
        tone: "error",
      });
    },
  });

  return {
    signalStack: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    toast,
    dismissToast: () => setToast(null),
    liveAnnouncement,
    justApprovedId,
    checkingIds,
    patchSource: (sourceId: number, patch: SignalStackSourcePatch) =>
      patchSourceMutation.mutateAsync({ sourceId, patch }),
    bulkApprove: (ids: number[]) =>
      bulkMutation.mutateAsync({ ids, patch: { status: "approved" } }),
    isBulkUpdating: bulkMutation.isPending,
    runDiscovery: () => discoverMutation.mutateAsync(),
    isStartingDiscovery: discoverMutation.isPending,
    recheckSource: (sourceId: number) => recheckMutation.mutateAsync(sourceId),
    deleteSource: (sourceId: number) => deleteMutation.mutateAsync(sourceId),
    addSource: (body: {
      url: string;
      name?: string;
      category: SourceCategory;
      reason?: string;
      forceAdd?: boolean;
    }) => addMutation.mutateAsync(body),
    isAddingSource: addMutation.isPending,
    uploadFile: (file: File, documentType?: string) =>
      uploadFileMutation.mutateAsync({ file, documentType }),
    isUploadingFile: uploadFileMutation.isPending,
    deleteFile: (fileId: number) => deleteFileMutation.mutateAsync(fileId),
    applyAudit: (decisions: { proposalId: string; accepted: boolean }[]) =>
      auditMutation.mutateAsync(decisions),
    isApplyingAudit: auditMutation.isPending,
    confirm: () => confirmMutation.mutateAsync(),
    isConfirming: confirmMutation.isPending,
  };
}
