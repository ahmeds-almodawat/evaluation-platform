import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSupabaseAuth, UserRole } from "@/hooks/useSupabaseAuth";
import LoadingScreen from "@/components/common/LoadingScreen";

/**
 * Role-based route guard.
 *
 * NOTE: UI guards are convenience. Real security must be enforced with Supabase RLS.
 */
const RequireRole: React.FC<
  React.PropsWithChildren<{ allowed: UserRole[]; redirectTo?: string }>
> = ({ allowed, redirectTo = "/dashboard/employee", children }) => {
  const { role, loading, user } = useSupabaseAuth();
  const location = useLocation();

  // RequireAuth should already handle this, but keep it safe.
  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (!allowed.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RequireRole;
