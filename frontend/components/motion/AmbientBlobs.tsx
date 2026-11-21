"use client";

import { useMotionSafe } from "@/hooks/useMotionSafe";

export function AmbientBlobs({ className = "bg-blobs-app" }: { className?: string }) {
  const { canAnimate } = useMotionSafe();

  return (
    <div
      className={`bg-blobs ${className} ${canAnimate ? "ambient-blobs-active" : "ambient-blobs-paused"}`}
      aria-hidden="true"
    >
      <div className="bg-blob-tl" />
      <div className="bg-blob-tc" />
      <div className="bg-blob-br" />
    </div>
  );
}
