/**
 * Shown instead of the whole app while `VITE_MAINTENANCE=1`. Rendered outside
 * ClerkProvider and the router on purpose: it must not depend on anything
 * that talks to the network.
 */
export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">DeejayTools is down for maintenance</h1>
        <p className="text-muted-foreground">
          We're moving to new servers. This should only take a few minutes, and nothing you've
          submitted will be lost.
        </p>
        <p className="text-muted-foreground">Please check back shortly.</p>
      </div>
    </main>
  );
}
