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

if (typeof window !== "undefined") {
  // jsdom environment — wire up Testing Library.
  await import("@testing-library/jest-dom/vitest");
  const rtl = await import("@testing-library/react");
  const { afterEach } = await import("vitest");
  afterEach(() => {
    rtl.cleanup();
  });
}
