// @vitest-environment jsdom
import { useCallback, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationDrawer } from "./useNavigationDrawer";

function Harness() {
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const onClose = useCallback(() => setOpen(false), []);
  useNavigationDrawer({ open, onClose, sidebar, trigger });
  return <>
    <button ref={trigger} aria-expanded={open} onClick={() => setOpen(true)}>Open navigation</button>
    {open && <aside ref={sidebar} role="dialog" aria-label="Test navigation">
      <button onClick={onClose}>Close navigation</button>
      <a href="#hidden" hidden>Hidden link</a>
      <a href="#home">Home</a>
      <a href="#air">Air quality</a>
    </aside>}
    <button>Outside control</button>
  </>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("innerWidth", 375);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.hidden ? [] : [{ width: 120, height: 44 }]) as unknown as DOMRectList;
  });
  document.body.style.overflow = "auto";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

async function openDrawer() {
  const view = render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  trigger.focus();
  fireEvent.click(trigger);
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  return { view, trigger };
}

describe("shared mobile navigation drawer", () => {
  it("locks scrolling, focuses the first visible control, and restores the trigger with Escape", async () => {
    const { trigger } = await openDrawer();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close navigation" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps both Tab directions and recovers focus from outside the modal", async () => {
    await openDrawer();
    const first = screen.getByRole("button", { name: "Close navigation" });
    const last = screen.getByRole("link", { name: "Air quality" });
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    screen.getByRole("button", { name: "Outside control" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    screen.getByRole("button", { name: "Outside control" }).focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes the drawer when returning to desktop and releases the scroll lock", async () => {
    await openDrawer();
    vi.stubGlobal("innerWidth", 760);
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    vi.stubGlobal("innerWidth", 761);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("restores prior scrolling and cancels delayed focus when unmounted", async () => {
    const { view } = await openDrawer();
    view.unmount();
    expect(document.body.style.overflow).toBe("auto");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
