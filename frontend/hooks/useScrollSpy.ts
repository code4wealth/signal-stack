"use client";

import { useEffect, useState } from "react";

export function useScrollSpy(sectionIds: string[], defaultId?: string): string {
  const [activeId, setActiveId] = useState<string>(defaultId ?? sectionIds[0] ?? "");

  useEffect(() => {
    if (sectionIds.length === 0) return;

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) {
          setActiveId(first.target.id);
        }
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0, 0.2, 0.6],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}
