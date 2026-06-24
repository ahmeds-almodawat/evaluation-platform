import React from "react";
import { useLocation } from "react-router-dom";

/**
 * Simple route transition without extra dependencies.
 * Keyed by pathname so each navigation triggers a fresh enter animation.
 */
const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-page-enter">
      {children}
    </div>
  );
};

export default PageTransition;
