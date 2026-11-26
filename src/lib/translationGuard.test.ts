// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it } from "vitest";
import { guardAgainstTranslators } from "./translationGuard";

beforeAll(() => {
  guardAgainstTranslators();
  guardAgainstTranslators(); // twice is harmless
});

/** What a translator does: wraps each text node in its own <font>. */
function translate(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const text of texts) {
    const font = document.createElement("font");
    font.textContent = text.textContent?.toUpperCase() ?? "";
    text.parentNode!.replaceChild(font, text);
  }
}

describe("guardAgainstTranslators", () => {
  it("leaves ordinary removes and inserts as they were", () => {
    const parent = document.createElement("div");
    const a = parent.appendChild(document.createElement("a"));
    const b = document.createElement("b");
    parent.insertBefore(b, a);
    expect([...parent.childNodes]).toEqual([b, a]);
    parent.removeChild(b);
    expect([...parent.childNodes]).toEqual([a]);
  });

  it("skips removing a node that is no longer there, and inserts before one at the end", () => {
    const parent = document.createElement("div");
    const gone = document.createTextNode("gone");
    expect(() => parent.removeChild(gone)).not.toThrow();
    const kept = parent.appendChild(document.createElement("i"));
    const added = document.createElement("b");
    expect(() => parent.insertBefore(added, gone)).not.toThrow();
    expect([...parent.childNodes]).toEqual([kept, added]);
  });

  it("keeps a React page rendering after a translator rewrote its text", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    // A badge appears before the text, then the text goes: React inserts
    // before, then removes, a text node the translator has replaced.
    const view = (step: number) =>
      createElement(
        "p",
        null,
        step >= 1 ? createElement("b", { key: "badge" }, "!") : null,
        step < 2 ? "Not checked in" : null
      );

    act(() => root.render(view(0)));
    translate(container);
    expect(() => act(() => root.render(view(1)))).not.toThrow();
    expect(container.querySelector("b")?.textContent).toBe("!");
    expect(() => act(() => root.render(view(2)))).not.toThrow();
    act(() => root.unmount());
  });
});
