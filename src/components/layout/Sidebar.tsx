import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  BarChart3,
  Settings,
  User,
  LogOut,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth, PermissionCode } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Called after navigation (useful for closing mobile drawer). */
  onNavigate?: () => void;
}

type Role = "admin" | "super_user" | "audit" | "user";

type NavChild = {
  label: string;
  path: string;
  roles: Role[];
  anyOf?: PermissionCode[];
};

type NavGroup = {
  id: string;
  icon: React.ElementType;
  title: string;
  titleAr: string;
  defaultPath: string;
  children: NavChild[];
};

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onNavigate }) => {
  const { t, language, setLanguage, direction } = useLanguage();
  const { user: supabaseUser, profile, role: supabaseRole, signOut, hasPermission } = useSupabaseAuth();

  const role = (supabaseRole || "user") as Role;
  const location = useLocation();
  const navigate = useNavigate();

  const [pendingCount, setPendingCount] = useState<number>(0);

  const groups: NavGroup[] = useMemo(() => {
    const isAr = language === "ar";

    return [
      {
        id: "dashboards",
        icon: LayoutDashboard,
        title: "Dashboards",
        titleAr: "لوحات المتابعة",
        defaultPath: "/dashboard",
        children: [
          { label: isAr ? "نظرة عامة" : "Overview", path: "/dashboard", roles: ["admin", "super_user", "audit", "user"] },
          { label: isAr ? "لوحة الموظف" : "Employee", path: "/dashboard/employee", roles: ["admin", "super_user", "audit", "user"] },
          {
            label: isAr ? "لوحات تنفيذية" : "Executive",
            path: "/executive-dashboards",
            roles: ["admin", "super_user", "audit"],
            anyOf: ["dashboards.company.view"],
          },
          { label: isAr ? "لوحة القسم" : "Department", path: "/dashboard/department", roles: ["admin", "super_user"], anyOf: ["dashboards.department.view"] },
          { label: isAr ? "لوحة الشركة" : "Company", path: "/dashboard/company", roles: ["admin", "super_user", "audit"], anyOf: ["dashboards.company.view"] },
        ],
      },
      {
        id: "people",
        icon: Users,
        title: "People",
        titleAr: "الأشخاص",
        defaultPath: "/employees",
        children: [
          { label: isAr ? "الموظفين" : "Employees", path: "/employees", roles: ["admin", "super_user", "audit"], anyOf: ["employees.read"] },
          { label: isAr ? "إدارة الأقسام" : "Departments", path: "/departments", roles: ["admin", "super_user"], anyOf: ["departments.manage"] },
        ],
      },
      {
        id: "evaluations",
        icon: ClipboardList,
        title: "Evaluations",
        titleAr: "التقييمات",
        defaultPath: "/my-evaluations",
        children: [
          { label: isAr ? "تقييماتي" : "My Evaluations", path: "/my-evaluations", roles: ["admin", "super_user", "audit", "user"] },
          { label: isAr ? "إدارة التقييمات" : "Manage Evaluations", path: "/evaluations", roles: ["admin", "super_user"], anyOf: ["evaluations.manage"] },
          { label: isAr ? "دورات التقييم" : "Evaluation Cycles", path: "/evaluations/cycles", roles: ["admin", "super_user"], anyOf: ["evaluations.manage"] },
          { label: isAr ? "تقييم مخصص" : "Custom Evaluation", path: "/custom-evaluation", roles: ["admin", "super_user"], anyOf: ["evaluations.custom.create"] },
          // Admin-only: Anonymous Evaluation (create/send/manage)
          { label: isAr ? "التقييم المجهول" : "Anonymous Evaluation", path: "/evaluations/anonymous", roles: ["admin"], anyOf: ["evaluations.anonymous.manage"] },
        ],
      },
      {
        id: "reports",
        icon: BarChart3,
        title: "Reports",
        titleAr: "التقارير",
        defaultPath: "/reports",
        children: [
          { label: isAr ? "التحليلات" : "Analytics", path: "/reports", roles: ["admin", "super_user", "audit"], anyOf: ["reports.view"] },
          { label: isAr ? "تقرير موظف" : "Employee Report", path: "/reports/employee", roles: ["admin", "super_user", "audit"], anyOf: ["reports.view"] },
          { label: isAr ? "تقرير قسم" : "Department Report", path: "/reports/department", roles: ["admin", "super_user", "audit"], anyOf: ["reports.view"] },
          { label: isAr ? "تقرير شركة" : "Company Report", path: "/reports/company", roles: ["admin", "super_user", "audit"], anyOf: ["reports.view"] },
        ],
      },
      {
        id: "settings",
        icon: Settings,
        title: "Settings",
        titleAr: "الإعدادات",
        defaultPath: "/settings",
        children: [
          { label: isAr ? "الإعدادات" : "Settings", path: "/settings", roles: ["admin", "super_user", "audit", "user"] },
          { label: isAr ? "المستخدمين" : "Users", path: "/users", roles: ["admin", "super_user"], anyOf: ["users.manage"] },
          { label: isAr ? "صحة البيانات" : "Data Health", path: "/settings/data-health", roles: ["admin", "super_user"], anyOf: ["users.manage"] },
          { label: isAr ? "اختبار سريع" : "Smoke Tests", path: "/settings/smoke-tests", roles: ["admin"], anyOf: ["roles.manage"] },
          { label: isAr ? "الأدوار والصلاحيات" : "Roles & Permissions", path: "/settings/roles-permissions", roles: ["admin"], anyOf: ["roles.manage"] },
          { label: isAr ? "قوالب التقييم" : "Evaluation Templates", path: "/settings/templates", roles: ["admin"], anyOf: ["templates.manage"] },
          { label: isAr ? "الهوية البصرية" : "Branding", path: "/settings/branding", roles: ["admin", "super_user"], anyOf: ["branding.manage"] },
          { label: isAr ? "مركز التصدير والنسخ" : "Export & Backup Center", path: "/settings/export-center", roles: ["admin", "super_user", "audit"], anyOf: ["reports.export"] },
          { label: isAr ? "مركز الاستعادة" : "Restore Center", path: "/settings/restore-center", roles: ["admin"], anyOf: ["roles.manage"] },
          { label: isAr ? "صحة النظام" : "System Health", path: "/settings/system-health", roles: ["admin", "super_user", "audit"], anyOf: ["reports.view"] },
          { label: isAr ? "الرسائل والإشعارات" : "Messages & Notifications", path: "/messages", roles: ["admin", "super_user", "audit", "user"] },
          { label: isAr ? "سجل التدقيق" : "Audit Logs", path: "/audit-logs", roles: ["admin", "super_user", "audit"], anyOf: ["audit.read"] },
        ],
      },
    ];
  }, [language]);

  const visibleGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        children: g.children.filter((c) => {
          // Permission-first navigation:
          // Custom roles are applied via permissions, and core role is set to "user".
          // So we must not hide items based on core role name.
          if (!c.anyOf || c.anyOf.length === 0) return true;
          return c.anyOf.some((p) => hasPermission(p));
        }),
      }))
      .filter((g) => g.children.length > 0);
  }, [groups, role, hasPermission]);

  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({});

  // Pending count badge (regular + anonymous)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (!supabaseUser?.id) {
          if (!cancelled) setPendingCount(0);
          return;
        }

        // Prefer a single RPC (faster, fewer round trips)
        const { data: pcData, error: pcErr } = await supabase.rpc("get_my_pending_counts");
        if (!pcErr && pcData) {
          const row = Array.isArray(pcData) ? pcData[0] : pcData;
          const total = Number((row as any)?.pending_total ?? 0);
          if (!cancelled) setPendingCount(Number.isFinite(total) ? total : 0);
          return;
        }

        // Fallback for older DBs: compute in client (slower)
        const { count: pendingEvalCount, error: peErr } = await supabase
          .from("evaluations")
          .select("id", { count: "exact", head: true })
          .eq("evaluator_id", supabaseUser.id)
          .eq("status", "pending");
        if (peErr) throw peErr;

        const { data: anonRecs, error: arErr } = await supabase
          .from("anonymous_evaluation_recipients")
          .select("evaluation_id")
          .eq("user_id", supabaseUser.id);
        if (arErr) throw arErr;

        let anonPending = 0;
        const evalIds = Array.from(new Set((anonRecs || []).map((r: any) => r.evaluation_id))).slice(0, 50);
        if (evalIds.length) {
          const results = await Promise.all(
            evalIds.map((id) => supabase.rpc("anonymous_evaluation_has_submitted", { p_evaluation_id: id }))
          );
          anonPending = results.filter((r) => !r.error && r.data === false).length;
        }

        if (!cancelled) setPendingCount((pendingEvalCount || 0) + anonPending);
      } catch (e) {
        console.warn("pendingCount", e);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [supabaseUser?.id]);

  // Auto-open the group that contains the active route (desktop expanded only)
  useEffect(() => {
    if (collapsed) return;

    const next: Record<string, boolean> = {};
    visibleGroups.forEach((g) => {
      const active = g.children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + "/"));
      next[g.id] = active;
    });
    setOpenGroup((prev) => ({ ...next, ...prev }));
  }, [location.pathname, collapsed, visibleGroups]);

  const toggleLanguage = () => setLanguage(language === "en" ? "ar" : "en");

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayName = profile
    ? language === "ar"
      ? profile.name_ar
      : profile.name_en
    : supabaseUser?.email ?? "";

  const GroupIcon = ({ icon: Icon }: { icon: React.ElementType }) => <Icon className="w-5 h-5 flex-shrink-0" />;

  const GroupRow: React.FC<{
    g: NavGroup;
    isActive: boolean;
    isOpen: boolean;
    onToggleOpen: () => void;
  }> = ({ g, isActive, isOpen, onToggleOpen }) => {
    const title = language === "ar" ? g.titleAr : g.title;

    const content = (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <GroupIcon icon={g.icon} />

        {!collapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold truncate">{title}</span>
            <button
              type="button"
              className="p-1 rounded hover:bg-sidebar-primary/10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleOpen();
              }}
              aria-label="Toggle section"
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
            </button>
          </div>
        )}
      </div>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => navigate(g.defaultPath)} className="w-full text-left">
              {content}
            </button>
          </TooltipTrigger>
          <TooltipContent side={direction === "rtl" ? "left" : "right"}>{title}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <button type="button" onClick={() => navigate(g.defaultPath)} className="w-full text-left">
        {content}
      </button>
    );
  };

  const ChildLink: React.FC<{ child: NavChild }> = ({ child }) => {
    const isActive = location.pathname === child.path || location.pathname.startsWith(child.path + "/");
    const label = child.label;

    return (
      <NavLink
        to={child.path}
        onClick={() => onNavigate?.()}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
          "ml-2",
          isActive
            ? "bg-sidebar-primary/10 text-sidebar-foreground"
            : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <span className="w-2 h-2 rounded-full bg-sidebar-foreground/40" />
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-sm truncate">{label}</span>
          {child.path === "/my-evaluations" && pendingCount > 0 && !collapsed ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-danger text-white">{pendingCount}</span>
          ) : null}
        </div>
      </NavLink>
    );
  };

  return (
    <aside
      className={cn(
        "h-full md:h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 border-sidebar-border",
        direction === "rtl" ? "border-l" : "border-r",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">Almodawat Employee Portal</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Toggle sidebar"
        >
          {collapsed ? (
            direction === "rtl" ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
          ) : direction === "rtl" ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* User Info */}
      {!collapsed && !!supabaseUser && (
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-sidebar-foreground/70 capitalize">{role.replace("_", " ")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleGroups.map((g) => {
          const isActive = g.children.some((c) => location.pathname === c.path || location.pathname.startsWith(c.path + "/"));
          const isOpen = !!openGroup[g.id];

          if (collapsed) {
            return (
              <div key={g.id} className="mb-1">
                <GroupRow g={g} isActive={isActive} isOpen={false} onToggleOpen={() => {}} />
              </div>
            );
          }

          return (
            <Collapsible key={g.id} open={isOpen} onOpenChange={(v) => setOpenGroup((p) => ({ ...p, [g.id]: v }))}>
              <CollapsibleTrigger asChild>
                <div>
                  <GroupRow
                    g={g}
                    isActive={isActive}
                    isOpen={isOpen}
                    onToggleOpen={() => setOpenGroup((p) => ({ ...p, [g.id]: !p[g.id] }))}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-2 mt-1 space-y-1">
                {g.children.map((child) => (
                  <ChildLink key={child.path} child={child} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      {/* Footer Actions */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <button
          onClick={toggleLanguage}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          aria-label="Toggle language"
          title={language === "en" ? "العربية" : "English"}
        >
          <Globe className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{language === "en" ? "العربية" : "English"}</span>}
        </button>

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
          aria-label="Logout"
          title={t("nav.logout")}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
