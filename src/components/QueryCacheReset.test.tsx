// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const authState: { isLoaded: boolean; userId: string | null } = { isLoaded: true, userId: "user_a" };

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => authState,
}));

import QueryCacheReset from "./QueryCacheReset";

const songsKey = ["songs", "list"];
const checkinsKey = ["checkins", "mine"];

function setup() {
  const queryClient = new QueryClient();
  // A fresh element each call: rerendering the same element would bail out.
  const ui = () => (
    <QueryClientProvider client={queryClient}>
      <QueryCacheReset />
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui()), ui };
}

describe("QueryCacheReset", () => {
  it("keeps the cache while the same user stays signed in", () => {
    authState.userId = "user_a";
    const { queryClient, rerender, ui } = setup();
    queryClient.setQueryData(songsKey, ["a song"]);
    rerender(ui());
    expect(queryClient.getQueryData(songsKey)).toEqual(["a song"]);
  });

  it("never shows the first user's songs or check-ins to a second user", () => {
    authState.userId = "user_a";
    const { queryClient, rerender, ui } = setup();
    queryClient.setQueryData(songsKey, ["a's song"]);
    queryClient.setQueryData(checkinsKey, ["a's check-in"]);

    authState.userId = null;
    rerender(ui());
    expect(queryClient.getQueryData(songsKey)).toBeUndefined();
    expect(queryClient.getQueryData(checkinsKey)).toBeUndefined();

    authState.userId = "user_b";
    rerender(ui());
    queryClient.setQueryData(songsKey, ["b's song"]);
    rerender(ui());
    expect(queryClient.getQueryData(songsKey)).toEqual(["b's song"]);
  });

  it("clears when one user is replaced directly by another", () => {
    authState.userId = "user_a";
    const { queryClient, rerender, ui } = setup();
    queryClient.setQueryData(songsKey, ["a's song"]);

    authState.userId = "user_b";
    rerender(ui());
    expect(queryClient.getQueryData(songsKey)).toBeUndefined();
  });
});
