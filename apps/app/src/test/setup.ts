/**
 * Global vitest setup for apps/app.
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
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.setPointerCapture = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  Element.prototype.releasePointerCapture = () => {};

  // Radix Select scrolls the highlighted option into view — jsdom doesn't
  // implement scrollIntoView, so provide a no-op.
  if (!Element.prototype.scrollIntoView) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    Element.prototype.scrollIntoView = () => {};
  }
}
