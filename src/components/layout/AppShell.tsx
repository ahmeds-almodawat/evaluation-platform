import React, { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Search } from "lucide-react";
import LoadingScreen from "@/components/common/LoadingScreen";
import CommandPalette from "@/components/system/CommandPalette";
import PageTransition from "@/components/system/PageTransition";

/**
 * AppShell is the single source of truth for layout, RTL/LTR sidebar placement,
 * and responsive navigation behavior. Keep it presentational.
 */
const AppShell: React.FC = () => {
  const { direction } = useLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const mobileSide = direction === "rtl" ? "right" : "left";

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className={cn("hidden md:block", direction === "rtl" ? "order-2" : "order-1")}>
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      </div>

      {/* Mobile header + sidebar */}
      <div className={cn("md:hidden fixed top-0 left-0 right-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60")}>
        <div className="flex h-12 items-center justify-between px-3">
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={mobileSide} className="p-0 w-72">
              <Sidebar collapsed={false} onToggle={() => {}} onNavigate={() => setMobileSidebarOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="text-sm font-medium text-muted-foreground">
            {/* Reserved for optional breadcrumbs/title */}
          </div>

          <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setCommandOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <main className={cn("flex-1 overflow-auto", "pt-12 md:pt-0", direction === "rtl" ? "order-1" : "order-2")}>
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <Suspense fallback={<LoadingScreen />}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
};

export default AppShell;
