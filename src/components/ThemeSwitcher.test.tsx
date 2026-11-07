// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeSwitcher from "./ThemeSwitcher";

const preferenceKey = "melbourne-collection:theme";
const switchName = "Navy, cream and coral theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("collection palette preference", () => {
  it("starts in navy and preserves the original palette choice across page mounts", () => {
    const firstPage = render(<ThemeSwitcher />);
    const toggle = screen.getByRole("switch", { name: switchName });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("navy");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(preferenceKey)).toBe("light");

    firstPage.unmount();
    delete document.documentElement.dataset.theme;
    render(<ThemeSwitcher />);
    expect(screen.getByRole("switch", { name: switchName }).getAttribute("aria-checked"))
      .toBe("false");
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByRole("switch", { name: switchName }));
    expect(document.documentElement.dataset.theme).toBe("navy");
    expect(localStorage.getItem(preferenceKey)).toBe("navy");
  });

  it("keeps the palette already applied before React mounts", () => {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem(preferenceKey, "navy");
    render(<ThemeSwitcher />);
    expect(screen.getByRole("switch", { name: switchName }).getAttribute("aria-checked"))
      .toBe("false");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still switches both ways when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
    render(<ThemeSwitcher />);
    const toggle = screen.getByRole("switch", { name: switchName });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("navy");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("synchronises changes from another dashboard tab without reacting to unrelated preferences", () => {
    render(<ThemeSwitcher />);
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: preferenceKey, newValue: "light", storageArea: localStorage,
    })));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("switch", { name: switchName }).getAttribute("aria-checked"))
      .toBe("false");

    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "melbourne-daily:location", newValue: "navy", storageArea: localStorage,
    })));
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: preferenceKey, newValue: "navy", storageArea: localStorage,
    })));
    expect(document.documentElement.dataset.theme).toBe("navy");
    expect(screen.getByRole("switch", { name: switchName }).getAttribute("aria-checked"))
      .toBe("true");
  });

  it("uses the weather palette without changing the shared preference or other pages", () => {
    const themeColour = document.createElement("meta");
    themeColour.name = "theme-color";
    document.head.append(themeColour);
    try {
      const weatherPage = render(<ThemeSwitcher palette="sunset" />);
      const toggle = screen.getByRole("switch", { name: "Sunset colour theme" });
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(screen.getByText("Sunset glow")).toBeTruthy();
      expect(themeColour.content).toBe("#210c22");

      fireEvent.click(toggle);
      expect(screen.getByText("Original light")).toBeTruthy();
      expect(themeColour.content).toBe("#f7f6fa");
      expect(localStorage.getItem(preferenceKey)).toBe("light");

      fireEvent.click(toggle);
      expect(screen.getByText("Sunset glow")).toBeTruthy();
      expect(themeColour.content).toBe("#210c22");
      expect(document.documentElement.dataset.theme).toBe("navy");
      expect(localStorage.getItem(preferenceKey)).toBe("navy");

      weatherPage.unmount();
      render(<ThemeSwitcher />);
      expect(screen.getByRole("switch", { name: switchName }).getAttribute("aria-checked"))
        .toBe("true");
      expect(screen.getByText("Navy & coral")).toBeTruthy();
      expect(themeColour.content).toBe("#14213D");
    } finally {
      themeColour.remove();
    }
  });
});
