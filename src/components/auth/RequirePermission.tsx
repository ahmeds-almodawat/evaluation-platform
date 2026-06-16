import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSupabaseAuth, PermissionCode } from "@/hooks/useSupabaseAuth";
import LoadingScreen from "@/components/common/LoadingScreen";

/**
 * Permission-based route guard.
 *
 * NOTE: UI guards are convenience. Real security must be enforced with Supabase RLS.
 */
const RequirePermission: React.FC<
  React.PropsWithChildren<{ anyOf: PermissionCode[]; redirectTo?: string }>
> = ({ anyOf, redirectTo = "/dashboard/employee", children }) => {
  const { user, loading, hasPermission } = useSupabaseAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  const allowed = anyOf.some((p) => hasPermission(p));
  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RequirePermission;
