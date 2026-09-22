// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: vi.fn() }),
}));

import SongUploadForm from "./SongUploadForm";

const EXPECTED_UPLOAD_DIVISIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Sophisticated",
  "Masters",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
  "Carolina Shag Divisions",
];

function mockLoadedSelfForm() {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/partners") {
      return Promise.resolve([{ id: "p1", first_name: "Alex", last_name: "Lee", partner_role: "leader" }]);
    }
    if (path === "/v1/auth/me") {
      return Promise.resolve({ id: "u1", first_name: "Alex", last_name: "Lee" });
    }
    return Promise.resolve([]);
  });
}

function renderForm() {
  return render(
    <MemoryRouter>
      <SongUploadForm variant="self" />
    </MemoryRouter>
  );
}

describe("SongUploadForm division pills", () => {
  beforeEach(() => {
    apiGet.mockReset();
    mockLoadedSelfForm();
  });

  it("hides portal-only divisions from the division pills", async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: "Division" })).toBeInTheDocument();
    });

    for (const hidden of ["Teams", "Cabaret", "My Division Is Not Listed"]) {
      expect(screen.queryByRole("radio", { name: hidden })).not.toBeInTheDocument();
    }
  });

  it("shows the remaining divisions in the new display order", async () => {
    renderForm();

    const group = await screen.findByRole("radiogroup", { name: "Division" });
    const labels = [...group.querySelectorAll('[role="radio"]')].map((el) => el.textContent);
    expect(labels).toEqual(EXPECTED_UPLOAD_DIVISIONS);
  });

  it("renders one row per non-empty division group with no blank rows", async () => {
    renderForm();

    const group = await screen.findByRole("radiogroup", { name: "Division" });
    const rows = group.querySelectorAll(".flex.flex-wrap.gap-2");
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.querySelectorAll('[role="radio"]').length).toBeGreaterThan(0);
    }
  });
});
