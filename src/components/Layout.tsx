import { SignedIn } from "@clerk/clerk-react";
import { Outlet } from "react-router-dom";
import AuthSync from "@/components/AuthSync";
import NavBar from "@/components/NavBar";

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      {/* AuthSync only fires when the user is signed in. Mounting it here keeps
          it out of the public-only landing page. */}
      <SignedIn>
        <AuthSync />
      </SignedIn>

      <NavBar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full">
        <Outlet />
      </main>
    </div>
  );
}
