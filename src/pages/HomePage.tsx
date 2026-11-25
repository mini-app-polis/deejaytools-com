import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";

/**
 * The site root. A signed-in visitor goes straight to My Content, their home
 * on the site; everyone else gets the public landing page.
 *
 * Covers every way a sign-in can end up at "/": a sign-in or sign-up with no
 * redirect of its own, an email verification link, or a bookmark of the
 * root. Sign-ins started from a page (a session's check-in CTA, say) keep
 * their own redirect and stay where they were.
 *
 * The landing page shows while Clerk loads, and stays if Clerk never loads,
 * so the root is never blank.
 */
export default function HomePage() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Navigate to="/my-content" replace />;
  return <LandingPage />;
}
