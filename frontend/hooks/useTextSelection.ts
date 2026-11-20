"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ActiveTextSelection = {
  text: string;
  top: number;
  left: number;
  turnIndex?: number;
};

export function useTextSelection({
  onTriggerReply,
}: {
  onTriggerReply: (text: string) => void;
}) {
  const [selection, setSelection] = useState<ActiveTextSelection | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const inspectSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const rawText = sel.toString().trim();
    if (rawText.length < 3) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const commonEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as HTMLElement)
        : range.commonAncestorContainer.parentElement;

    const selectableContainer = commonEl?.closest<HTMLElement>("[data-reply-selectable='true']");
    if (!selectableContainer) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setSelection(null);
      return;
    }

    const turnAttr = selectableContainer.getAttribute("data-turn-index");
    const turnIndex = turnAttr !== null ? Number(turnAttr) : undefined;

    setSelection({
      text: rawText.slice(0, 280),
      top: Math.max(12, rect.top - 42),
      left: Math.min(window.innerWidth - 110, Math.max(16, rect.left + rect.width / 2 - 42)),
      turnIndex: Number.isFinite(turnIndex) ? turnIndex : undefined,
    });
  }, []);

  useEffect(() => {
    function handlePointerUp() {
      requestAnimationFrame(inspectSelection);
    }

    function handlePointerDown(event: PointerEvent) {
      if (buttonRef.current && event.target instanceof Node && buttonRef.current.contains(event.target)) {
        return;
      }
      setSelection(null);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.shiftKey || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        requestAnimationFrame(inspectSelection);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!selection) return;
      const target = event.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isInput) return;

      if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onTriggerReply(selection.text);
        window.getSelection()?.removeAllRanges();
        setSelection(null);
      } else if (event.key === "Escape") {
        setSelection(null);
      }
    }

    function handleScroll() {
      setSelection(null);
    }

    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mouseup", handlePointerUp);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [inspectSelection, onTriggerReply, selection]);

  return { selection, buttonRef, clearSelection };
}
