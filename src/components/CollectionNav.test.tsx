// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CollectionNav from "./CollectionNav";

const pages = [
  { id: "home", label: "Home", href: "/melbourne-daily/" },
  { id: "parking", label: "Parking", href: "/melbourne-parking-dashboard/" },
  { id: "weather", label: "Weather & UV", href: "/melbourne-daily/weather.html" },
  { id: "air", label: "Air quality", href: "/melbourne-daily/air.html" },
  { id: "transport", label: "Transport", href: "/melbourne-daily/transport.html" },
] as const;

afterEach(cleanup);

describe("dashboard collection navigation", () => {
  it.each(pages)("offers all five same-tab destinations from $id with one current page", ({ id, label }) => {
    render(<CollectionNav current={id} placement="sidebar" />);
    const navigation = within(screen.getByRole("navigation", { name: "Dashboard series" }));
    const links = navigation.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(pages.map((page) => page.href));
    for (const page of pages) {
      const link = navigation.getByRole("link", { name: page.label });
      expect(link.getAttribute("target")).toBeNull();
      expect(link.getAttribute("aria-current")).toBe(page.id === id ? "page" : null);
    }
    expect(navigation.getAllByRole("link", { current: "page" })).toEqual([navigation.getByRole("link", { name: label })]);
  });

  it("gives mobile shortcuts full accessible names and removes them while a drawer is open", () => {
    const view = render(<CollectionNav current="weather" placement="mobile" />);
    const mobile = within(screen.getByRole("navigation", { name: "Dashboard series mobile" }));
    expect(mobile.getByRole("link", { name: "Weather & UV", current: "page" }).getAttribute("href"))
      .toBe("/melbourne-daily/weather.html");
    expect(mobile.getByRole("link", { name: "Air quality" })).toBeTruthy();
    view.rerender(<CollectionNav current="weather" placement="mobile" hidden />);
    expect(screen.queryByRole("navigation", { name: "Dashboard series mobile" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("closes the surrounding drawer when a page link is selected without cancelling navigation", () => {
    const onNavigate = vi.fn();
    let preventedByNavigation: boolean | undefined;
    render(<div onClick={(event) => {
      preventedByNavigation = event.defaultPrevented;
      // The test observes the component's event, then avoids a jsdom page navigation.
      event.preventDefault();
    }}><CollectionNav current="home" placement="sidebar" onNavigate={onNavigate} /></div>);
    const link = screen.getByRole("link", { name: "Air quality" });
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(preventedByNavigation).toBe(false);
    expect(link.getAttribute("href")).toBe("/melbourne-daily/air.html");
  });
});
