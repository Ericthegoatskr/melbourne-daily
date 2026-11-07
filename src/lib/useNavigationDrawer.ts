import { useEffect, useRef, type RefObject } from "react";

/** Shared keyboard and scroll behaviour for each collection page's mobile drawer. */
export function useNavigationDrawer({ open, onClose, sidebar, trigger }: {
  open: boolean;
  onClose: () => void;
  sidebar: RefObject<HTMLElement | null>;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") || [])
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    const close = () => { closeRef.current(); trigger.current?.focus(); };
    const focusFirst = () => items()[0]?.focus();
    focusFirst();
    const frame = requestAnimationFrame(focusFirst);
    const afterReveal = setTimeout(() => {
      if (!sidebar.current?.contains(document.activeElement)) focusFirst();
    }, 260);
    const resize = () => { if (window.innerWidth > 760) close(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const first = items()[0], last = items().at(-1);
      if (!sidebar.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("resize", resize);
    document.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(afterReveal);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, sidebar, trigger]);
}
