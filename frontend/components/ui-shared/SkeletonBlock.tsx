"use client";

export function SkeletonBlock({ className = "h-5 w-full" }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-xl ${className}`} aria-hidden="true" />;
}
