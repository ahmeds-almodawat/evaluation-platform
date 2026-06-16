import React from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Building2, LayoutDashboard, Users2 } from "lucide-react";

import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { role, hasPermission } = useSupabaseAuth();

  const isAr = language === "ar";

  // For regular users, the "home" dashboard is their personal dashboard.
  if (role === "user") {
    return (
      <div className="space-y-6">
        <Header
          title={isAr ? "لوحة المتابعة" : "Dashboard"}
          subtitle={isAr ? "نظرة سريعة على أدائك" : "A quick view of your performance"}
        />

        <Card className="border-muted/60">
          <CardHeader>
            <CardTitle className="text-base">{isAr ? "ابدأ من هنا" : "Start here"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isAr
                ? "يمكنك متابعة نتيجتك وآخر التقييمات من لوحة الموظف." 
                : "You can view your score and recent activity from the Employee dashboard."}
            </div>
            <Button onClick={() => navigate("/dashboard/employee")}> {isAr ? "فتح لوحة الموظف" : "Open Employee Dashboard"}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards: Array<{
    title: string;
    desc: string;
    icon: React.ReactNode;
    path: string;
    enabled: boolean;
  }> = [
    {
      title: isAr ? "لوحات تنفيذية" : "Executive Dashboards",
      desc: isAr ? "KPIs, اتجاهات, ومخاطر" : "KPIs, trends, and risks",
      icon: <BarChart3 className="h-5 w-5" />,
      path: "/executive-dashboards",
      enabled: hasPermission("dashboards.company.view"),
    },
    {
      title: isAr ? "لوحة الشركة" : "Company Dashboard",
      desc: isAr ? "عرض شامل على مستوى الشركة" : "Company-wide view",
      icon: <Building2 className="h-5 w-5" />,
      path: "/dashboard/company",
      enabled: hasPermission("dashboards.company.view"),
    },
    {
      title: isAr ? "لوحة القسم" : "Department Dashboard",
      desc: isAr ? "تفاصيل الأقسام والفرق" : "Department and team details",
      icon: <Users2 className="h-5 w-5" />,
      path: "/dashboard/department",
      enabled: hasPermission("dashboards.department.view"),
    },
    {
      title: isAr ? "لوحة الموظف" : "Employee Dashboard",
      desc: isAr ? "نظرة فردية" : "Individual view",
      icon: <LayoutDashboard className="h-5 w-5" />,
      path: "/dashboard/employee",
      enabled: true,
    },
  ];

  return (
    <div className="space-y-6">
      <Header
        title={isAr ? "لوحة المتابعة" : "Dashboard"}
        subtitle={isAr ? "اختر لوحة لعرض البيانات" : "Pick a dashboard to view insights"}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} className="border-muted/60">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{c.title}</CardTitle>
                <div className="text-muted-foreground">{c.icon}</div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="text-xs text-muted-foreground">{c.desc}</div>
              <Button
                variant={c.enabled ? "default" : "secondary"}
                disabled={!c.enabled}
                onClick={() => navigate(c.path)}
              >
                {isAr ? "فتح" : "Open"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-muted/60">
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "اختصارات" : "Shortcuts"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div>{isAr ? "Ctrl + K لفتح البحث السريع." : "Press Ctrl + K for quick search."}</div>
          <div>{isAr ? "استخدم مركز التصدير للحصول على نسخ Excel." : "Use Export Center for Excel backups."}</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardHome;
