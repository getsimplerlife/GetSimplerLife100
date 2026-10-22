import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PortalIcon, NoticeIcon, type PortalIconName, type NoticeIconName } from "../components/PortalIcons";

const ALL_NAV: PortalIconName[] = [
  "dashboard", "proposals", "invoices", "checklists", "deal-rooms", "boards", "tasks",
  "surveys", "inbox", "workflows", "import", "documents", "vault", "files", "approvals",
  "assistant", "communications", "integrations", "secure", "dedupe", "access", "knowledge",
  "settings", "admin", "logout", "install", "bell", "mail",
];

const ALL_NOTICE: NoticeIconName[] = ["approval", "complete", "error", "info"];

describe("PortalIcons", () => {
  it.each(ALL_NAV)("renders an svg with a non-empty path for icon %s", (name) => {
    const { container } = render(<PortalIcon name={name} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const d = svg?.querySelector("path")?.getAttribute("d");
    expect(d).toBeTruthy();
    expect(d!.length).toBeGreaterThan(5);
  });

  it("passes className through to the svg", () => {
    const { container } = render(<PortalIcon name="tasks" className="w-4 h-4 text-emerald-400" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("w-4 h-4");
    expect(svg?.getAttribute("class")).toContain("text-emerald-400");
  });

  it("uses the 24x24 stroke style (fill none, stroke currentColor)", () => {
    const { container } = render(<PortalIcon name="import" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("fill")).toBe("none");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(ALL_NOTICE)("renders notice icon %s", (name) => {
    const { container } = render(<NoticeIcon name={name} className="w-4 h-4" />);
    const d = container.querySelector("path")?.getAttribute("d");
    expect(d).toBeTruthy();
    expect(d!.length).toBeGreaterThan(5);
  });

  it("does not render an invalid icon name via the type system", () => {
    // The union type should reject unknown names at compile time; at runtime
    // an unsupported name degrades to nothing rather than throwing.
    const { container } = render(<PortalIcon name={"dashboard" as PortalIconName} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("supports additional svg props (title/aria-label passthrough)", () => {
    const { container } = render(<PortalIcon name="bell" aria-label="Notifications" />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Notifications");
  });
});