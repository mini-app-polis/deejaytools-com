import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { Navigate } from "react-router-dom";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { me, loading, isAdmin } = useAuthMe();

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full max-w-lg" />
      </div>
    );
  }

  if (!isAdmin || !me) {
    return <Navigate to="/events" replace />;
  }

  return <>{children}</>;
}
