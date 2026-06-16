import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import LoadingScreen from "@/components/common/LoadingScreen";

/**
 * Simple route guard:
 * - While auth state is loading: show a centered spinner.
 * - If not logged in: redirect to /auth.
 * - If logged in: render children.
 */
const RequireAuth: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, loading } = useSupabaseAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default RequireAuth;
