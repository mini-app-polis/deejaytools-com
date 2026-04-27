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
import PartnersPage from "./PartnersPage";
import SessionDetailPage from "./SessionDetailPage";
import SessionsPage from "./SessionsPage";
import SongsPage from "./SongsPage";

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
            path="sessions"
            element={
              <RequireAuth>
                <SessionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="sessions/:id"
            element={
              <RequireAuth>
                <SessionDetailPage />
              </RequireAuth>
            }
          />
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
