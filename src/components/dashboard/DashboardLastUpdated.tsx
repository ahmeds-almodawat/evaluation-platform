import React from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

type Props = {
  /** ISO string */
  value?: string | null;
  label?: string;
};

export default function DashboardLastUpdated({ value, label }: Props) {
  if (!value) return null;
  const dt = new Date(value);
  const formatted = isNaN(dt.getTime()) ? String(value) : dt.toLocaleString();

  return (
    <Badge variant="secondary" className="gap-2">
      <Clock className="h-3.5 w-3.5" />
      <span className="text-xs">
        {label ? `${label}: ` : ""}
        {formatted}
      </span>
    </Badge>
  );
}
