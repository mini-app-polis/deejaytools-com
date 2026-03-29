import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import AuthSync from "@/components/AuthSync";
import Layout from "@/components/Layout";
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
      <SignedOut>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-muted-foreground text-center">Sign in to manage routines and floor trials.</p>
          <SignInButton />
        </div>
      </SignedOut>
      <SignedIn>
        <AuthSync />
        <Toaster richColors closeButton position="top-center" />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/events" replace />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:id" element={<SessionDetailPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/songs" element={<SongsPage />} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminPage />
                </AdminGuard>
              }
            />
          </Route>
        </Routes>
      </SignedIn>
    </BrowserRouter>
  );
}
