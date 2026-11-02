import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { createQueryClient } from "../api/queryClient";

/**
 * A query client for one test: the production defaults (so staleTime and the
 * like behave as in the app), except no retries, so a failure shows at once.
 * Each render gets its own client, so one test's cache never reaches another.
 */
export function createTestQueryClient(): QueryClient {
  const defaults = createQueryClient().getDefaultOptions();
  return new QueryClient({
    defaultOptions: {
      queries: { ...defaults.queries, retry: false },
      mutations: { ...defaults.mutations, retry: false },
    },
  });
}

/**
 * `render()` inside a `QueryClientProvider` with a fresh client. Use it for
 * any component that reads through `useEndpointQuery` / `useEndpointMutation`.
 * `rerender` keeps the same client.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient } = {}
): RenderResult & { queryClient: QueryClient } {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper, ...renderOptions }) };
}
