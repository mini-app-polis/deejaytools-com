import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import EventRoleGuard from "@/components/EventRoleGuard";
import Layout from "@/components/Layout";
import RequireAuth from "@/components/RequireAuth";
import RouteFallback from "@/components/RouteFallback";
import LandingPage from "./LandingPage";
import FloorTrialsPage from "./FloorTrialsPage";
import EventDetailPage from "./EventDetailPage";
import EventsPage from "./EventsPage";
import HowItWorksPage from "./HowItWorksPage";
import HelpCheckingInPage from "./help/HelpCheckingInPage";
import HelpFloorTrialsPage from "./help/HelpFloorTrialsPage";
import HelpOnTheFloorPage from "./help/HelpOnTheFloorPage";
import HelpPartnersPage from "./help/HelpPartnersPage";
import HelpSubmittingMusicPage from "./help/HelpSubmittingMusicPage";
import HelpTheQueuePage from "./help/HelpTheQueuePage";
import TroubleshootingPage from "./help/TroubleshootingPage";
import MyContentPage from "./MyContentPage";
import MyProfilePage from "./MyProfilePage";
import SessionDetailPage from "./SessionDetailPage";
import SessionsPage from "./SessionsPage";
import AddSongPage from "./AddSongPage";
import EventSubmissionsPage, { OpenSubmissionsRedirect } from "./EventSubmissionsPage";
import SongsPage from "./SongsPage";
import FeedbackPage from "./FeedbackPage";
import MyEventsPage from "./MyEventsPage";

// Admin, manager and per-event staff pages are split into their own chunks:
// most visitors are dancers who never open them, so they stay out of the
// main bundle and download on first visit to the route.
const AdminPage = lazy(() => import("./AdminPage"));
const ManagerPage = lazy(() => import("./ManagerPage"));
const CoordinatorPortalPage = lazy(() => import("./CoordinatorPortalPage"));
const DjPortalPage = lazy(() => import("./DjPortalPage"));
const EventManagerPortalPage = lazy(() => import("./EventManagerPortalPage"));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors closeButton position="top-center" />
      <Routes>
        {/* Public landing page — always accessible */}
        <Route path="/" element={<LandingPage />} />

        {/* Shared layout. Floor Trials is public; everything else is gated below. */}
        <Route element={<Layout />}>
          {/* Public app routes */}
          <Route path="floor-trials" element={<FloorTrialsPage />} />
          {/* Back-compat for the old /check-in URL — re-render Floor Trials. */}
          <Route path="check-in" element={<FloorTrialsPage />} />
          {/* Help section. Hub at /how-it-works; topic pages below. Legacy
              anchor links on /how-it-works#… redirect in HowItWorksPage.
              Linked from the homepage card grid, NavBar, FloorTrialsPage,
              and AddSongPage. */}
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="how-it-works/floor-trials" element={<HelpFloorTrialsPage />} />
          <Route path="how-it-works/submitting-music" element={<HelpSubmittingMusicPage />} />
          <Route path="how-it-works/checking-in" element={<HelpCheckingInPage />} />
          <Route path="how-it-works/the-queue" element={<HelpTheQueuePage />} />
          <Route path="how-it-works/partners" element={<HelpPartnersPage />} />
          <Route path="how-it-works/on-the-floor" element={<HelpOnTheFloorPage />} />
          <Route path="how-it-works/troubleshooting" element={<TroubleshootingPage />} />
          <Route path="feedback" element={<FeedbackPage />} />

          {/* Auth-required routes */}
          <Route
            path="my-content"
            element={
              <RequireAuth>
                <MyContentPage />
              </RequireAuth>
            }
          />
          <Route
            path="my-profile"
            element={
              <RequireAuth>
                <MyProfilePage />
              </RequireAuth>
            }
          />
          {/* Legacy routes — kept so existing links don't break */}
          <Route
            path="songs"
            element={
              <RequireAuth>
                <SongsPage />
              </RequireAuth>
            }
          />
          <Route
            path="songs/add"
            element={
              <RequireAuth>
                <AddSongPage />
              </RequireAuth>
            }
          />
          <Route
            path="event-submissions"
            element={
              <RequireAuth>
                <EventSubmissionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="event-submissions/:eventId"
            element={
              <RequireAuth>
                <EventSubmissionsPage />
              </RequireAuth>
            }
          />
          {/* Old link for The Open's submission page; forwards to its event page. */}
          <Route
            path="open-submissions"
            element={
              <RequireAuth>
                <OpenSubmissionsRedirect />
              </RequireAuth>
            }
          />
          <Route
            path="sessions"
            element={
              <RequireAuth>
                <SessionsPage />
              </RequireAuth>
            }
          />
          {/* Session detail is public-readable; the page itself shows a
              sign-in CTA in place of the check-in form when signed out. */}
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          {/* Events are public — the nav links here for signed-out visitors.
              The detail page gates only its entity roster behind sign-in. */}
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />

          {/* Per-event staff portals. Each guard admits the role it names,
              or a richer one, held on the event in the URL; the API checks
              every call again against the same event. "My events" lists
              the caller's events, each linking to its richest portal. */}
          <Route
            path="my-events"
            element={
              <RequireAuth>
                <MyEventsPage />
              </RequireAuth>
            }
          />
          <Route
            path="events/:eventId/coordinator"
            element={
              <EventRoleGuard role="coordinator">
                <Lazy>
                  <CoordinatorPortalPage />
                </Lazy>
              </EventRoleGuard>
            }
          />
          <Route
            path="events/:eventId/dj"
            element={
              <EventRoleGuard role="dj">
                <Lazy>
                  <DjPortalPage />
                </Lazy>
              </EventRoleGuard>
            }
          />
          <Route
            path="events/:eventId/dj/:section"
            element={
              <EventRoleGuard role="dj">
                <Lazy>
                  <DjPortalPage />
                </Lazy>
              </EventRoleGuard>
            }
          />
          <Route
            path="events/:eventId/manage"
            element={
              <EventRoleGuard role="event-manager">
                <Lazy>
                  <EventManagerPortalPage />
                </Lazy>
              </EventRoleGuard>
            }
          />
          <Route
            path="events/:eventId/manage/:section"
            element={
              <EventRoleGuard role="event-manager">
                <Lazy>
                  <EventManagerPortalPage />
                </Lazy>
              </EventRoleGuard>
            }
          />

          {/* Admin-required.
              /admin is split into one route per section so each admin
              page is independently bookmarkable / linkable. Bare /admin
              redirects to the default section so existing links keep
              working. */}
          <Route path="admin" element={<Navigate to="/admin/events" replace />} />
          <Route
            path="admin/:section"
            element={
              <AdminGuard>
                <Lazy>
                  <AdminPage />
                </Lazy>
              </AdminGuard>
            }
          />
          <Route path="manager" element={<Navigate to="/manager/active-sessions" replace />} />
          <Route
            path="manager/:section"
            element={
              <AdminGuard>
                <Lazy>
                  <ManagerPage />
                </Lazy>
              </AdminGuard>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
