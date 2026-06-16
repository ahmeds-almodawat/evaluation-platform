import React from "react";
import { cn } from "@/lib/utils";

/**
 * App-wide page container. Keep it purely presentational.
 */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl p-4 md:p-6", className)}>
      {children}
    </div>
  );
}
