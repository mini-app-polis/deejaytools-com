import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import Layout from "@/components/Layout";
import RequireAuth from "@/components/RequireAuth";
import LandingPage from "./LandingPage";
import AdminPage from "./AdminPage";
import FloorTrialsPage from "./FloorTrialsPage";
import EventDetailPage from "./EventDetailPage";
import EventsPage from "./EventsPage";
import HowItWorksPage from "./HowItWorksPage";
import PartnersPage from "./PartnersPage";
import SessionDetailPage from "./SessionDetailPage";
import SessionsPage from "./SessionsPage";
import AddSongPage from "./AddSongPage";
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
          {/* Long-form floor-trial process guide. Linked from the homepage
              card grid and from contextual tips on FloorTrialsPage /
              AddSongPage. The legacy-songs catalog used to live at
              /music-history; that page was removed because the same search
              already exists as the "Claim from history" dialog inside
              AddSongPage and a separate top-level entry just confused
              first-time visitors. */}
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="feedback" element={<FeedbackPage />} />

          {/* Auth-required routes */}
          <Route
            path="partners"
            element={
              <RequireAuth>
                <PartnersPage />
              </RequireAuth>
            }
          />
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

          {/* Admin-required */}
          <Route
            path="admin"
            element={
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
