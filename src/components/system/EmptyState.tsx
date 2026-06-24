import React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-8 text-center", className)}>
      <div className="mx-auto max-w-xl">
        <div className="text-lg font-semibold">{title}</div>
        {description ? <div className="mt-2 text-sm text-muted-foreground">{description}</div> : null}
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
