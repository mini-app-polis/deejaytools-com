import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

/**
 * Gate around routes that require a signed-in Clerk user. Signed-out
 * visitors get redirected to the public landing page; signed-in users
 * see the wrapped content.
 *
 * Pairs with AdminGuard, which is stricter (admin role required) and
 * which can be applied INSIDE this guard if a route needs both.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedOut>
        <Navigate to="/" replace />
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}
