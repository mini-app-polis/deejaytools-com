import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import ManagerGuard from "@/components/ManagerGuard";
import Layout from "@/components/Layout";
import RequireAuth from "@/components/RequireAuth";
import LandingPage from "./LandingPage";
import AdminPage from "./AdminPage";
import ManagerPage from "./ManagerPage";
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
import EventSubmissionsPage from "./EventSubmissionsPage";
import OpenSubmissionsPage from "./OpenSubmissionsPage";
import SongsPage from "./SongsPage";
import FeedbackPage from "./FeedbackPage";

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
          {/* The Open has its own submission page. /event-submissions filters The
              Open out of its event list and links here instead. */}
          <Route
            path="open-submissions"
            element={
              <RequireAuth>
                <OpenSubmissionsPage />
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
          <Route
            path="events"
            element={
              <RequireAuth>
                <EventsPage />
              </RequireAuth>
            }
          />
          <Route
            path="events/:id"
            element={
              <RequireAuth>
                <EventDetailPage />
              </RequireAuth>
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
                <AdminPage />
              </AdminGuard>
            }
          />
          <Route path="manager" element={<Navigate to="/manager/active-sessions" replace />} />
          <Route
            path="manager/:section"
            element={
              <ManagerGuard>
                <ManagerPage />
              </ManagerGuard>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
