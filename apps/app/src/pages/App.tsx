import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import AuthSync from "@/components/AuthSync";
import Layout from "@/components/Layout";
import LandingPage from "./LandingPage";
import AdminPage from "./AdminPage";
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

        {/* Authenticated app */}
        <Route
          path="/*"
          element={
            <>
              <SignedOut>
                <Navigate to="/" replace />
              </SignedOut>
              <SignedIn>
                <AuthSync />
                <Layout />
              </SignedIn>
            </>
          }
        >
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventDetailPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:id" element={<SessionDetailPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="songs" element={<SongsPage />} />
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
