import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SupabaseAuthProvider } from "@/hooks/useSupabaseAuth";
import { BrandingProvider } from "@/contexts/BrandingContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
const AuthPage = React.lazy(() => import("./pages/AuthPage"));
const RedirectPage = React.lazy(() => import("./pages/RedirectPage"));
const EmployeeDashboard = React.lazy(() => import("./pages/dashboard/EmployeeDashboard"));
const DashboardHome = React.lazy(() => import("./pages/dashboard/DashboardHome"));
const DepartmentDashboard = React.lazy(() => import("./pages/dashboard/DepartmentDashboard"));
const CompanyDashboard = React.lazy(() => import("./pages/dashboard/CompanyDashboard"));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage"));
const ReportsAnalyticsPage = React.lazy(() => import("./pages/ReportsAnalyticsPage"));
const EvaluationsPage = React.lazy(() => import("./pages/EvaluationsPage"));
const EvaluationCyclesPage = React.lazy(() => import("./pages/evaluations/EvaluationCyclesPage"));
const MyEvaluationsPage = React.lazy(() => import("./pages/MyEvaluationsPage"));
const EvaluationSurveyPage = React.lazy(() => import("./pages/EvaluationSurveyPage"));
const AnonymousEvaluationsAdminPage = React.lazy(() => import("./pages/AnonymousEvaluationsAdminPage"));
const AnonymousEvaluationSurveyPage = React.lazy(() => import("./pages/AnonymousEvaluationSurveyPage"));
const UserProfilePage = React.lazy(() => import("./pages/UserProfilePage"));
const UserManagementPage = React.lazy(() => import("./pages/UserManagementPage"));
const DepartmentManagementPage = React.lazy(() => import("./pages/DepartmentManagementPage"));
const DepartmentDetailsPage = React.lazy(() => import("./pages/departments/DepartmentDetailsPage"));
const StationDetailsPage = React.lazy(() => import("./pages/departments/StationDetailsPage"));
const EmployeesPage = React.lazy(() => import("./pages/EmployeesPage"));
const EmployeeReportPage = React.lazy(() => import("./pages/reports/EmployeeReportPage"));
const DepartmentReportPage = React.lazy(() => import("./pages/reports/DepartmentReportPage"));
const CompanyReportPage = React.lazy(() => import("./pages/reports/CompanyReportPage"));
const AuditLogsPage = React.lazy(() => import("./pages/AuditLogsPage"));
const CustomEvaluationPage = React.lazy(() => import("./pages/CustomEvaluationPage"));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage"));
const EvaluationTemplatesPage = React.lazy(() => import("./pages/EvaluationTemplatesPage"));
const MessagesPage = React.lazy(() => import("./pages/MessagesPage"));
const BrandingSettingsPage = React.lazy(() => import("./pages/BrandingSettingsPage"));
const ExportCenterPage = React.lazy(() => import("./pages/settings/ExportCenterPage"));
const SystemHealthPage = React.lazy(() => import("./pages/settings/SystemHealthPage"));
const DataHealthPage = React.lazy(() => import("./pages/settings/DataHealthPage"));
const SmokeTestsPage = React.lazy(() => import("./pages/settings/SmokeTestsPage"));
const RestoreCenterPage = React.lazy(() => import("./pages/settings/RestoreCenterPage"));
const RolesPermissionsPage = React.lazy(() => import("./pages/settings/RolesPermissionsPage"));
const SensitiveAccessLogsPage = React.lazy(() => import("./pages/settings/SensitiveAccessLogsPage"));
const ExecutiveDashboardsPage = React.lazy(() => import("./pages/ExecutiveDashboardsPage"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
import RequireAuth from "./components/auth/RequireAuth";
import RequireRole from "./components/auth/RequireRole";
import RequirePermission from "./components/auth/RequirePermission";
import ErrorBoundary from "./components/ErrorBoundary";
import ConfigErrorPage from "./pages/ConfigErrorPage";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

// App-wide react-query defaults:
// - Reduce refetch spam
// - Keep UI snappy
// - Avoid infinite retries on auth-protected endpoints
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

const PageLoading = () => (
  <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => {
  if (!isSupabaseConfigured) {
    return <ConfigErrorPage />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SupabaseAuthProvider>
          <BrandingProvider>
            <LanguageProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <React.Suspense fallback={<PageLoading />}>
                  <Routes>
                  {/* Opening screen should be Login */}
                  <Route path="/" element={<Navigate to="/auth" replace />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/redirect" element={<RedirectPage />} />
                  
                  {/* Dashboard Routes */}
                  <Route path="/dashboard" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<DashboardHome />} />
                    <Route path="employee" element={<EmployeeDashboard />} />
                    <Route path="department" element={<RequirePermission anyOf={["dashboards.department.view"]}><DepartmentDashboard /></RequirePermission>} />
                    <Route path="company" element={<RequirePermission anyOf={["dashboards.company.view"]}><CompanyDashboard /></RequirePermission>} />
                  </Route>
                  
                  {/* Report Routes with Layout */}
                  <Route path="/reports" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["reports.view"]}><ReportsAnalyticsPage /></RequirePermission>} />
                    <Route path="legacy" element={<RequirePermission anyOf={["reports.view"]}><ReportsPage /></RequirePermission>} />
                    <Route path="employee" element={<RequirePermission anyOf={["reports.view"]}><EmployeeReportPage /></RequirePermission>} />
                    <Route path="employee/:userId" element={<RequirePermission anyOf={["reports.view"]}><EmployeeReportPage /></RequirePermission>} />
                    <Route path="department" element={<RequirePermission anyOf={["reports.view"]}><DepartmentReportPage /></RequirePermission>} />
                    <Route path="company" element={<RequirePermission anyOf={["reports.view"]}><CompanyReportPage /></RequirePermission>} />
                  </Route>


                  {/* Audit Logs */}
                  <Route path="/audit-logs" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["audit.read"]}><AuditLogsPage /></RequirePermission>} />
                  </Route>
                  
                  {/* Evaluations */}
                  <Route path="/evaluations" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["evaluations.manage"]}><EvaluationsPage /></RequirePermission>} />
                    <Route path="cycles" element={<RequirePermission anyOf={["evaluations.manage"]}><EvaluationCyclesPage /></RequirePermission>} />
                    <Route path=":evaluationId" element={<EvaluationSurveyPage />} />
                    <Route path="anonymous" element={<RequirePermission anyOf={["evaluations.anonymous.manage"]}><AnonymousEvaluationsAdminPage /></RequirePermission>} />
                  </Route>
                  
                  {/* My Evaluations */}
                  <Route path="/my-evaluations" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<MyEvaluationsPage />} />
                  </Route>

                  <Route path="/anonymous-evaluations" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route path=":evaluationId" element={<AnonymousEvaluationSurveyPage />} />
                  </Route>

                  {/* Custom Evaluation */}
                  <Route path="/custom-evaluation" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["evaluations.custom.create"]}><CustomEvaluationPage /></RequirePermission>} />
                  </Route>
                  
                  {/* User Management */}
                  <Route path="/users" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["users.manage"]}><UserManagementPage /></RequirePermission>} />
                  </Route>

                  {/* Executive Dashboards */}
                  <Route path="/executive-dashboards" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route
                      index
                      element={
                        <RequirePermission anyOf={["dashboards.company.view"]}>
                          <ExecutiveDashboardsPage />
                        </RequirePermission>
                      }
                    />
                  </Route>
                  
                  {/* Employees List */}
                  <Route path="/employees" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["employees.read"]}><EmployeesPage /></RequirePermission>} />
                  </Route>
                  
                  {/* Department Management */}
                  <Route path="/departments" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<RequirePermission anyOf={["departments.manage"]}><DepartmentManagementPage /></RequirePermission>} />
                    <Route
                      path=":departmentId"
                      element={
                        <RequirePermission anyOf={["departments.manage", "departments.manage_members"]}>
                          <DepartmentDetailsPage />
                        </RequirePermission>
                      }
                    />
                    <Route
                      path=":departmentId/units/:unitId"
                      element={
                        <RequirePermission anyOf={["departments.manage", "departments.manage_members"]}>
                          <StationDetailsPage />
                        </RequirePermission>
                      }
                    />
                  </Route>
                  
                  {/* User Profile */}
                  <Route path="/profile" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<UserProfilePage />} />
                    <Route path=":userId" element={<UserProfilePage />} />
                  </Route>

                  {/* Settings */}
                  <Route path="/settings" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<SettingsPage />} />
                    <Route path="templates" element={<RequirePermission anyOf={["templates.manage"]}><EvaluationTemplatesPage /></RequirePermission>} />
                    <Route path="branding" element={<RequirePermission anyOf={["branding.manage"]}><BrandingSettingsPage /></RequirePermission>} />
                    <Route path="export-center" element={<RequirePermission anyOf={["reports.export"]}><ExportCenterPage /></RequirePermission>} />
                    <Route path="restore-center" element={<RequireRole allowed={["admin"]}><RequirePermission anyOf={["roles.manage"]}><RestoreCenterPage /></RequirePermission></RequireRole>} />
                    <Route path="system-health" element={<RequirePermission anyOf={["reports.view"]}><SystemHealthPage /></RequirePermission>} />
                    <Route path="data-health" element={<RequirePermission anyOf={["users.manage"]}><DataHealthPage /></RequirePermission>} />
                    <Route path="smoke-tests" element={<RequirePermission anyOf={["roles.manage"]}><SmokeTestsPage /></RequirePermission>} />
                    <Route
                      path="roles-permissions"
                      element={
                        <RequirePermission anyOf={["roles.manage"]}>
                          <RolesPermissionsPage />
                        </RequirePermission>
                      }
                    />

                    <Route
                      path="sensitive-access"
                      element={
                        <RequirePermission anyOf={["audit.read"]}>
                          <SensitiveAccessLogsPage />
                        </RequirePermission>
                      }
                    />
                  </Route>

                  {/* Messages & Notifications */}
                  <Route path="/messages" element={<RequireAuth><ErrorBoundary><DashboardLayout /></ErrorBoundary></RequireAuth>}>
                    <Route index element={<MessagesPage />} />
                  </Route>

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                </React.Suspense>
              </TooltipProvider>
            </LanguageProvider>
          </BrandingProvider>
        </SupabaseAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
