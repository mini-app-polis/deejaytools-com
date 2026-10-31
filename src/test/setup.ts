/**
 * Global vitest setup.
 *
 * The default test environment is `node` (pure-function tests don't need a
 * DOM). Component tests opt into jsdom with `// @vitest-environment jsdom`
 * at the top of the file — and only those tests need Testing Library.
 *
 * To avoid forcing every test to load `@testing-library/jest-dom` (which
 * pulls in chalk, redent, etc.), this file detects the environment at
 * runtime and only imports Testing Library's setup when a DOM is available.
 */

// export {} makes this a module so top-level await is valid
export {};

import { vi } from "vitest";

// Components read the division list from GET /v1/divisions through
// useDivisions. Every test sees it already loaded, so a test's API mock does
// not have to serve the route. useDivisions.test.ts unmocks it to test the
// hook itself.
vi.mock("@/hooks/useDivisions", async () => {
  const { LOADED_DIVISIONS } = await import("./divisions");
  return { useDivisions: () => LOADED_DIVISIONS, resetDivisionsCache: () => {} };
});

if (typeof window !== "undefined") {
  // jsdom environment — wire up Testing Library.
  await import("@testing-library/jest-dom/vitest");
  const rtl = await import("@testing-library/react");
  const { afterEach } = await import("vitest");
  afterEach(() => {
    rtl.cleanup();
  });

  // Radix UI (and other pointer-events-based libraries) call these methods on
  // DOM elements. jsdom doesn't implement them, so stub them out so components
  // that use Radix Select, Combobox, etc. can render without crashing.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};

  // Radix Select scrolls the highlighted option into view — jsdom doesn't
  // implement scrollIntoView, so provide a no-op.
  if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
  }

  // jsdom's Blob lacks arrayBuffer(); chunkedSongUpload probes file readability via
  // slice().arrayBuffer(), so component upload tests need this polyfill.
  if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
}
