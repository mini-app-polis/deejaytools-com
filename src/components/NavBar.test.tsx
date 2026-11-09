// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Clerk's <SignedIn> / <SignedOut> wrappers render their children based on
// real Clerk state. For tests we wire each one to a global flag the test sets
// before rendering — this lets us toggle "signed in" vs. "signed out" without
// pulling in real Clerk state.
let signedIn = false;

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    signedIn ? null : <>{children}</>,
  // Render children directly — wrapping in a real <button> would create the
  // invalid <button><button> nesting that React warns about, since the
  // SignInButton's child in real code is a shadcn Button (also a <button>).
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
  UserButton: () => <div data-testid="user-button" />,
}));

// Drive useAuthMe via mutable flags.
let isAdmin = false;
let eventRoles: { event_id: string; role: "coordinator" | "dj" | "event-manager" }[] = [];
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: signedIn
      ? { id: "u1", role: isAdmin ? "admin" : "user" }
      : null,
    loading: false,
    reload: vi.fn(),
    isAdmin,
    eventRoles: signedIn ? eventRoles : [],
  }),
}));

// The caller's staff events, as useStaffEvents joins them to the events list.
let staffEvents: { eventId: string; role: "coordinator" | "dj" | "event-manager"; event: { name: string } | null }[] = [];
vi.mock("@/hooks/useStaffEvents", () => ({
  useStaffEvents: () => ({ items: signedIn ? staffEvents : [], loading: false }),
}));

afterEach(() => {
  eventRoles = [];
  staffEvents = [];
  eventsList = [];
});

// The events list, which the admin view-as strip picks from.
let eventsList: { id: string; name: string; status: string; start_date: string }[] = [];
vi.mock("@/api/queries", () => ({
  useEndpointQuery: (_endpoint: unknown, opts?: { enabled?: boolean }) => ({
    data: opts?.enabled === false ? undefined : eventsList,
  }),
}));

// The API version label; each test sets what GET /version reports.
let apiVersion: { version: string; commit: string | null } | null = null;
vi.mock("@/hooks/useApiVersion", () => ({
  useApiVersion: () => apiVersion,
}));

import NavBar from "./NavBar";

function renderNav(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
    </MemoryRouter>
  );
}

describe("NavBar — signed out", () => {
  it("shows public nav links and the Sign in button", () => {
    signedIn = false;
    isAdmin = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^help$/i }).length).toBeGreaterThan(0);
    // Events is public — signed-out visitors get the listing from the nav.
    const eventsLinks = screen.getAllByRole("link", { name: /^events$/i });
    expect(eventsLinks.some((link) => link.getAttribute("href") === "/events")).toBe(true);
    // Sign in CTA renders.
    expect(screen.getByTestId("sign-in-button")).toBeInTheDocument();
    // Authenticated-only items must not appear.
    expect(screen.queryByRole("link", { name: /^my partners$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^my songs$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^admin$/i })).toBeNull();
    expect(screen.queryByTestId("user-button")).toBeNull();
  });
});

describe("NavBar — signed in (regular user)", () => {
  it("shows Floor Trials, Help, My Content, My Profile and the UserButton; no admin bars", () => {
    signedIn = true;
    isAdmin = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^help$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my content$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my profile$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();

    expect(screen.queryByRole("navigation", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Event staff" })).toBeNull();
    expect(screen.queryByTestId("sign-in-button")).toBeNull();
  });
});

describe("NavBar — signed in (admin)", () => {
  it("shows one Admin bar with every admin and manager page", () => {
    signedIn = true;
    isAdmin = true;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my content$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
    const bar = screen.getByRole("navigation", { name: "Admin" });
    // The closed mobile menu repeats the heading, out of the accessibility tree.
    expect(within(bar).getByText("Admin")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Events" })).toHaveAttribute("href", "/admin/events");
    for (const name of ["Test Checkin", "Users", "Active Sessions", "CheckIn For", "Guide"]) {
      expect(within(bar).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("navigation", { name: "Manager" })).toBeNull();
    expect(screen.queryByText("Superuser")).toBeNull();
    // The public Events listing stays in the main bar.
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/events"
    );
  });
});

describe("NavBar — landmarks and order", () => {
  it("puts the main bar first, then Event staff, then Admin", () => {
    signedIn = true;
    isAdmin = true;
    eventRoles = [{ event_id: "ev-2", role: "dj" }];
    staffEvents = [{ eventId: "ev-2", role: "dj", event: { name: "Fall Fling" } }];
    renderNav();

    const bars = screen.getAllByRole("navigation").map((n) => n.getAttribute("aria-label"));
    expect(bars.filter((b) => ["Main", "Event staff", "Admin"].includes(b ?? ""))).toEqual(["Main", "Event staff", "Admin"]);
    expect(within(screen.getByRole("navigation", { name: "Admin" })).getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Event staff" })).getByRole("link", { name: "Live queue" })).toBeInTheDocument();
  });
});

describe("NavBar — signed in (not an admin)", () => {
  it("shows no Admin bar or admin links", () => {
    signedIn = true;
    isAdmin = false;
    renderNav();

    expect(screen.queryByRole("navigation", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^active sessions$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^upload for$/i })).toBeNull();
  });
});

describe("NavBar — admin view as", () => {
  const events = [
    { id: "old", name: "Old Jam", status: "completed", start_date: "2025-03-01" },
    { id: "open", name: "The Open", status: "upcoming", start_date: "2026-11-26" },
    { id: "dcsx", name: "DCSX", status: "upcoming", start_date: "2026-11-19" },
  ];

  it("offers each staff role's version of an admin page, on the soonest event to start", async () => {
    signedIn = true;
    isAdmin = true;
    eventsList = events;
    const user = userEvent.setup();
    renderNav("/admin/registrations");

    const strip = screen.getByRole("navigation", { name: "View as" });
    expect(within(strip).getByRole("combobox", { name: "Event to view" })).toHaveValue("dcsx");
    expect(within(strip).getByRole("link", { name: "Coordinator" })).toHaveAttribute(
      "href",
      "/events/dcsx/coordinator/registrations"
    );
    expect(within(strip).getByRole("link", { name: "DJ" })).toHaveAttribute("href", "/events/dcsx/dj/registrations");
    expect(within(strip).getByRole("link", { name: "Event manager" })).toHaveAttribute(
      "href",
      "/events/dcsx/manage/registrations"
    );

    await user.selectOptions(within(strip).getByRole("combobox", { name: "Event to view" }), "open");
    expect(within(strip).getByRole("link", { name: "DJ" })).toHaveAttribute("href", "/events/open/dj/registrations");
  });

  it("offers only the roles that have the page", () => {
    signedIn = true;
    isAdmin = true;
    eventsList = events;
    renderNav("/manager/active-sessions");
    const strip = screen.getByRole("navigation", { name: "View as" });
    expect(within(strip).queryByRole("link", { name: "Coordinator" })).toBeNull();
    expect(within(strip).getByRole("link", { name: "DJ" })).toHaveAttribute("href", "/events/dcsx/dj/queue");
  });

  it("shows nothing on an admin page with no staff version, or to anyone but an admin", () => {
    signedIn = true;
    isAdmin = true;
    eventsList = events;
    const { unmount } = renderNav("/admin/users");
    expect(screen.queryByRole("navigation", { name: "View as" })).toBeNull();
    unmount();

    isAdmin = false;
    renderNav("/admin/registrations");
    expect(screen.queryByRole("navigation", { name: "View as" })).toBeNull();
  });
});

describe("NavBar — mobile menu", () => {
  it("shows Help in the mobile nav for signed-out users", async () => {
    signedIn = false;
    isAdmin = false;
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    const helpLinks = screen.getAllByRole("link", { name: /^help$/i });
    expect(helpLinks.length).toBeGreaterThan(0);
    expect(helpLinks.some((link) => link.getAttribute("href") === "/how-it-works")).toBe(true);
  });

  it("lists the Admin sections for an admin, and closes when a link is followed", async () => {
    signedIn = true;
    isAdmin = true;
    const user = userEvent.setup();
    renderNav();
    // Desktop sub-bars are always in the DOM; the mobile menu adds a second copy.
    expect(screen.getAllByRole("link", { name: "Active Sessions" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Test Checkin" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(screen.getAllByRole("link", { name: "Active Sessions" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Test Checkin" })).toHaveLength(2);

    await user.click(screen.getAllByRole("link", { name: "Test Checkin" })[1]);
    expect(screen.getAllByRole("link", { name: "Test Checkin" })).toHaveLength(1);
  });

  it("says whether the menu is open and points at the labelled menu it controls", async () => {
    signedIn = false;
    isAdmin = false;
    const user = userEvent.setup();
    renderNav();
    const toggle = screen.getByRole("button", { name: /toggle menu/i });
    const menuId = toggle.getAttribute("aria-controls")!;
    const menu = document.getElementById(menuId)!;

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(menu.tagName).toBe("NAV");
    expect(menu).toHaveAttribute("aria-label", "Menu");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Menu" })).toBe(menu);
  });

  it("closes the menu on Escape and puts focus back on the toggle", async () => {
    signedIn = false;
    isAdmin = false;
    const user = userEvent.setup();
    renderNav();
    const toggle = screen.getByRole("button", { name: /toggle menu/i });

    await user.click(toggle);
    const menu = screen.getByRole("navigation", { name: "Menu" });
    menu.querySelector("a")!.focus();
    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("closes the menu when the toggle is pressed again", async () => {
    signedIn = false;
    isAdmin = false;
    const user = userEvent.setup();
    renderNav();
    const toggle = screen.getByRole("button", { name: /toggle menu/i });

    await user.click(toggle);
    expect(screen.getAllByRole("link", { name: /^contact$/i })).toHaveLength(2);
    await user.click(toggle);
    expect(screen.getAllByRole("link", { name: /^contact$/i })).toHaveLength(1);
  });

  it.each([
    ["Floor Trials", "/floor-trials"],
    ["My Content", "/my-content"],
    ["My events", "/my-events"],
    ["Help", "/how-it-works"],
    ["Contact", "/feedback"],
    ["Live queue", "/events/ev-2/dj/queue"],
    ["Guide", "/manager/guide"],
    ["Users", "/admin/users"],
  ])("closes after following the mobile %s link", async (name, href) => {
    signedIn = true;
    isAdmin = true;
    eventRoles = [{ event_id: "ev-2", role: "dj" }];
    staffEvents = [{ eventId: "ev-2", role: "dj", event: { name: "Fall Fling" } }];
    const user = userEvent.setup();
    renderNav();
    const before = screen.getAllByRole("link", { name }).length;

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    const links = screen.getAllByRole("link", { name });
    expect(links).toHaveLength(before + 1);
    const mobile = links[links.length - 1];
    expect(mobile).toHaveAttribute("href", href);
    await user.click(mobile);

    expect(screen.getAllByRole("link", { name })).toHaveLength(before);
  });

  it("shows Help in the mobile nav for signed-in users", async () => {
    signedIn = true;
    isAdmin = false;
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    const helpLinks = screen.getAllByRole("link", { name: /^help$/i });
    expect(helpLinks.length).toBeGreaterThan(0);
    expect(helpLinks.some((link) => link.getAttribute("href") === "/how-it-works")).toBe(true);
  });
});

describe("NavBar — wordmark", () => {
  it("renders the DJT icon, DeejayTools.com wordmark and version label", () => {
    signedIn = false;
    isAdmin = false;
    renderNav();
    // The new layout uses a square DJT icon (alt="DeejayTools") next to a
    // visible "DeejayTools.com" text wordmark, with a small version label.
    expect(screen.getByAltText("DeejayTools")).toBeInTheDocument();
    expect(screen.getByText("DeejayTools.com")).toBeInTheDocument();
    expect(screen.getByText(/^v\d/)).toBeInTheDocument();
  });
});

describe("NavBar — API version", () => {
  const originalLocation = window.location;

  afterEach(() => {
    apiVersion = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, hostname },
    });
  }

  it("is left out until the API reports one", () => {
    signedIn = false;
    apiVersion = null;
    renderNav();
    expect(screen.queryByText(/api /)).not.toBeInTheDocument();
  });

  it("shows the API release version in production", () => {
    signedIn = false;
    setHostname("deejaytools.com");
    apiVersion = { version: "1.2.3", commit: "0dc51f0b88b12830c0faacb1f5dfa7ca9a7c35e6" };
    renderNav();
    expect(screen.getByText("· api v1.2.3")).toBeInTheDocument();
  });

  it("shows the API commit on dev hosts", () => {
    signedIn = false;
    setHostname("dev.deejaytools.com");
    apiVersion = { version: "1.0.0", commit: "0dc51f0b88b12830c0faacb1f5dfa7ca9a7c35e6" };
    renderNav();
    expect(screen.getByText("· api #0dc51f0")).toBeInTheDocument();
  });

  it("falls back to the version on dev when the API has no commit", () => {
    signedIn = false;
    setHostname("localhost");
    apiVersion = { version: "1.0.0", commit: null };
    renderNav();
    expect(screen.getByText("· api v1.0.0")).toBeInTheDocument();
  });
});

describe("NavBar — environment badge", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, hostname },
    });
  }

  it("shows a DEV badge on non-production hosts (e.g. localhost)", () => {
    signedIn = false;
    isAdmin = false;
    renderNav();
    expect(screen.getByText("DEV")).toBeInTheDocument();
  });

  it("hides the DEV badge on the production host", () => {
    signedIn = false;
    isAdmin = false;
    setHostname("deejaytools.com");
    renderNav();
    expect(screen.queryByText("DEV")).toBeNull();
  });
});

describe("NavBar — event staff", () => {
  function signInAsStaff(roles: typeof eventRoles, events: typeof staffEvents) {
    signedIn = true;
    isAdmin = false;
    eventRoles = roles;
    staffEvents = events;
  }

  it("shows no My events entry or Event staff bar to a user with no event roles", () => {
    signInAsStaff([], []);
    renderNav();
    expect(screen.queryByRole("link", { name: /^my events$/i })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Event staff" })).toBeNull();
  });

  it("shows a coordinator their role, event and portal sections, and no admin links", () => {
    signInAsStaff(
      [{ event_id: "ev-1", role: "coordinator" }],
      [{ eventId: "ev-1", role: "coordinator", event: { name: "Spring Swing" } }]
    );
    renderNav();
    const bar = screen.getByRole("navigation", { name: "Event staff" });
    expect(within(bar).getByRole("link", { name: "My events" })).toHaveAttribute("href", "/my-events");
    expect(within(bar).getByText("Coordinator")).toBeInTheDocument();
    expect(within(bar).getByText("Spring Swing")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Registrations" })).toHaveAttribute(
      "href",
      "/events/ev-1/coordinator/registrations"
    );
    expect(within(bar).getByRole("link", { name: "Submissions" })).toHaveAttribute(
      "href",
      "/events/ev-1/coordinator/submissions"
    );
    expect(within(bar).queryByRole("link", { name: "Live queue" })).toBeNull();
    // My events lives in the staff bar, not the main one.
    expect(within(screen.getByRole("navigation", { name: "Main" })).queryByRole("link", { name: "My events" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Admin" })).toBeNull();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/admin") || h.startsWith("/manager"))).toBe(false);
  });

  it("shows a DJ the DJ portal's sections", () => {
    signInAsStaff(
      [{ event_id: "ev-2", role: "dj" }],
      [{ eventId: "ev-2", role: "dj", event: { name: "Fall Fling" } }]
    );
    renderNav();
    const bar = screen.getByRole("navigation", { name: "Event staff" });
    expect(within(bar).getByText("DJ")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Live queue" })).toHaveAttribute("href", "/events/ev-2/dj/queue");
    expect(within(bar).queryByRole("link", { name: "Staff" })).toBeNull();
  });

  it("shows an event manager the manage portal's sections", () => {
    signInAsStaff(
      [{ event_id: "ev-3", role: "event-manager" }],
      [{ eventId: "ev-3", role: "event-manager", event: { name: "Winter Ball" } }]
    );
    renderNav();
    const bar = screen.getByRole("navigation", { name: "Event staff" });
    expect(within(bar).getByText("Event manager")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Staff" })).toHaveAttribute("href", "/events/ev-3/manage/staff");
  });

  it("groups each event with its own role", () => {
    signInAsStaff(
      [
        { event_id: "ev-1", role: "coordinator" },
        { event_id: "ev-2", role: "dj" },
      ],
      [
        { eventId: "ev-1", role: "coordinator", event: { name: "Spring Swing" } },
        { eventId: "ev-2", role: "dj", event: { name: "Fall Fling" } },
      ]
    );
    renderNav();
    const bar = screen.getByRole("navigation", { name: "Event staff" });
    const hrefs = within(bar).getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/events/ev-1/coordinator/registrations");
    expect(hrefs).toContain("/events/ev-2/dj/queue");
  });

  it("lists My events and the staff sections in the mobile menu", async () => {
    signInAsStaff(
      [{ event_id: "ev-2", role: "dj" }],
      [{ eventId: "ev-2", role: "dj", event: { name: "Fall Fling" } }]
    );
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    expect(screen.getAllByRole("link", { name: /^my events$/i })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Live queue" })).toHaveLength(2);
  });
});

describe("NavBar — active route", () => {
  it("marks the current page's link in the main nav, the sub-bars and the mobile menu", async () => {
    signedIn = true;
    isAdmin = true;
    const user = userEvent.setup();
    renderNav("/admin/users");

    const users = screen.getByRole("link", { name: "Users" });
    expect(users).toHaveAttribute("aria-current", "page");
    expect(users.className).toContain("text-primary");
    expect(screen.getByRole("link", { name: "Songs" })).not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));
    const mobileUsers = screen.getAllByRole("link", { name: "Users" })[1];
    expect(mobileUsers).toHaveAttribute("aria-current", "page");
    expect(mobileUsers.className).toContain("bg-primary/10");
  });

  it("marks a public page in the desktop nav", () => {
    signedIn = false;
    isAdmin = false;
    renderNav("/floor-trials");

    const link = screen.getByRole("link", { name: /^floor trials$/i });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.className).toContain("text-primary");
  });
});

describe("NavBar — staff event without a loaded event", () => {
  it("names the event 'Event' until the events list has it", () => {
    signedIn = true;
    isAdmin = false;
    eventRoles = [{ event_id: "ev-9", role: "coordinator" }];
    staffEvents = [{ eventId: "ev-9", role: "coordinator", event: null }];
    renderNav();

    const bar = screen.getByRole("navigation", { name: "Event staff" });
    expect(within(bar).getByText("Event")).toBeInTheDocument();
    expect(within(bar).getByRole("link", { name: "Registrations" })).toHaveAttribute(
      "href",
      "/events/ev-9/coordinator/registrations"
    );
  });
});
