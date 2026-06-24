import React from "react";
import { cn } from "@/lib/utils";

export function Toolbar({
  left,
  right,
  className,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-center md:justify-between", className)}>
      {left ? <div className="flex flex-col gap-2 md:flex-row md:items-center">{left}</div> : <span />}
      {right ? <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">{right}</div> : null}
    </div>
  );
}
