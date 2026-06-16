import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon?: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "w-full rounded-xl border bg-card text-card-foreground p-6 flex flex-col items-center text-center gap-2",
        className,
      )}
    >
      {Icon ? (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      ) : null}
      <div className="text-base font-semibold">{title}</div>
      {description ? <div className="text-sm text-muted-foreground max-w-xl">{description}</div> : null}
      {actionLabel && onAction ? (
        <div className="pt-2">
          <Button type="button" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default EmptyState;
