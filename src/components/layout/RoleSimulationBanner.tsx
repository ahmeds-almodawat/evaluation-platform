import React from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

/**
 * Admin-only banner shown when Role Simulator is active.
 * This is UI-only and does not change any DB roles.
 */
export default function RoleSimulationBanner() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { isRoleSimulating, simulatedRoleName, simulatedRoleKey, stopRoleSimulation } = useSupabaseAuth();

  if (!isRoleSimulating) return null;

  const label = isAr
    ? `وضع المحاكاة: ${simulatedRoleName?.ar || simulatedRoleKey}`
    : `Simulation: ${simulatedRoleName?.en || simulatedRoleKey}`;

  return (
    <div className="w-full border-b border-border bg-destructive/10 text-foreground">
      <div className="h-10 px-6 flex items-center justify-between gap-3">
        <div className="text-sm font-medium truncate">{label}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void stopRoleSimulation()}
          className="h-8"
        >
          {isAr ? "إيقاف" : "Exit"}
        </Button>
      </div>
    </div>
  );
}
