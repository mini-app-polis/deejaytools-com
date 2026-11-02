import AuthMeError from "@/components/AuthMeError";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Navigate } from "react-router-dom";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { me, loading, isAdmin, error, reload } = useAuthMe();

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full max-w-lg" />
      </div>
    );
  }

  if (!me && error) {
    return <AuthMeError message={error} onRetry={() => void reload()} />;
  }

  // Guards the manager area too: the API has no global manager role, so it is admin-only.
  if (!isAdmin || !me) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
