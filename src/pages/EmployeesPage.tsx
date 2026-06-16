import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import DebouncedInput from "@/components/common/DebouncedInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Filter, ArrowUpDown, Users, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

interface Employee {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  phone: string | null;
  position: string | null;
  department_id: string | null;
  department?: Department;
  staff_id: string | null;
  is_active: boolean;
  latestSameScore: number | null;
  latestCrossScore: number | null;
}

type SortOption = "name_asc" | "name_desc" | "score_asc" | "score_desc";

const EMPLOYEE_PAGE_SIZE = 75;

const EmployeesPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { role, loading: authLoading, hasPermission, isAdmin } = useSupabaseAuth();
  const canAssignDepartment = isAdmin || (hasPermission?.("departments.manage_members") ?? false) || (hasPermission?.("departments.manage") ?? false) || role === "admin" || role === "super_user";
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Department quick-assign
  const [deptAssignOpen, setDeptAssignOpen] = useState(false);
  const [deptAssignEmployee, setDeptAssignEmployee] = useState<Employee | null>(null);
  const [deptAssignValue, setDeptAssignValue] = useState<string>("");
  const [deptAssignSaving, setDeptAssignSaving] = useState(false);

  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [listPage, setListPage] = useState(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Check if user has permission to view this page
  const canViewPage = role === "admin" || role === "super_user" || role === "audit";
  
  // Check if user can see calculation logic (admin only)
  const canViewCalculationLogic = role === "admin";

  useEffect(() => {
    if (!authLoading && !canViewPage) {
      navigate("/dashboard/employee");
      return;
    }
    
    if (canViewPage) {
      fetchData();
    }
  }, [canViewPage, authLoading]);

  const fetchData = async () => {
  setLoading(true);
  try {
    // Fetch departments
    const { data: deptData, error: deptErr } = await supabase
      .from("departments")
      .select("id,name_en,name_ar");

    if (deptErr) throw deptErr;
    setDepartments(deptData || []);

    // Fetch all profiles
    const { data: profilesData, error: profErr } = await supabase
      .from("profiles")
      .select("id,name_en,name_ar,email,phone,position,department_id,staff_id,is_active");

    if (profErr) throw profErr;

    // Fetch latest scores for these users (fast RPC)
    const userIds = (profilesData || []).map((p: any) => p.id);
    let latestMap = new Map<string, any>();
    try {
      const { data: latestRows, error: latestErr } = await supabase.rpc(
        "rpc_employee_latest_scores",
        { p_user_ids: userIds }
      );
      if (latestErr) throw latestErr;
      (latestRows as any[] | null)?.forEach((r) => {
        latestMap.set(r.user_id, r);
      });
    } catch (e) {
      // If RPC is not available or permission denied, we keep scores as null.
      console.warn("Latest scores RPC failed:", e);
    }

    const employeeList: Employee[] = (profilesData || []).map((profile: any) => {
      const department = (deptData || []).find((d: any) => d.id === profile.department_id);
      const latest = latestMap.get(profile.id);

      const latestSameScore =
        typeof latest?.latest_same_score === "number"
          ? Math.round(latest.latest_same_score * 100) / 100
          : null;

      const latestCrossScore =
        typeof latest?.latest_cross_score === "number"
          ? Math.round(latest.latest_cross_score * 100) / 100
          : null;

      return {
        id: profile.id,
        name_en: profile.name_en || "",
        name_ar: profile.name_ar || "",
        email: profile.email || "",
        phone: profile.phone || null,
        position: profile.position || null,
        department_id: profile.department_id || null,
        department,
        staff_id: profile.staff_id || null,
        is_active: Boolean(profile.is_active),
        latestSameScore,
        latestCrossScore,
      };
    });

    setEmployees(employeeList);
  } catch (error) {
    console.error("Error fetching employees:", error);
    setEmployees([]);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    setListPage(0);
  }, [deferredSearchQuery, departmentFilter, activeFilter, sortOption]);

  // Filter and sort employees. Search is deferred to keep the input responsive on large employee lists.
  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    // Global search
    const search = deferredSearchQuery.trim().toLowerCase();
    if (search) {
      result = result.filter(
        (emp) =>
          emp.name_en.toLowerCase().includes(search) ||
          emp.name_ar.toLowerCase().includes(search) ||
          emp.email.toLowerCase().includes(search) ||
          (emp.phone && emp.phone.toLowerCase().includes(search)) ||
          (emp.staff_id && emp.staff_id.toLowerCase().includes(search))
      );
    }

    // Department filter
    if (departmentFilter !== "all") {
      result = result.filter((emp) => emp.department_id === departmentFilter);
    }


// Active filter
if (activeFilter !== "all") {
  const wantActive = activeFilter === "active";
  result = result.filter((emp) => emp.is_active === wantActive);
}

    // Sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return (language === "ar" ? a.name_ar : a.name_en).localeCompare(
            language === "ar" ? b.name_ar : b.name_en
          );
        case "name_desc":
          return (language === "ar" ? b.name_ar : b.name_en).localeCompare(
            language === "ar" ? a.name_ar : a.name_en
          );
        case "score_asc":
          return (a.latestSameScore || 0) - (b.latestSameScore || 0);
        case "score_desc":
          return (b.latestSameScore || 0) - (a.latestSameScore || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [employees, deferredSearchQuery, departmentFilter, activeFilter, sortOption, language]);


  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredEmployees.length / EMPLOYEE_PAGE_SIZE)),
    [filteredEmployees.length],
  );
  const visibleEmployees = useMemo(
    () => filteredEmployees.slice(listPage * EMPLOYEE_PAGE_SIZE, (listPage + 1) * EMPLOYEE_PAGE_SIZE),
    [filteredEmployees, listPage],
  );

  const handleRowClick = (employeeId: string) => {
    // Navigate to the Employee Report page (stable and exists for all profiles).
    navigate(`/reports/employee/${employeeId}`);
  };
  async function openDeptAssign(employee: Employee) {
    setDeptAssignEmployee(employee);
    setDeptAssignValue(employee.department_id ?? "none");
    setDeptAssignOpen(true);
  }

  async function saveDeptAssignment() {
    if (!deptAssignEmployee) return;
    setDeptAssignSaving(true);
    try {
      const newDept = deptAssignValue === "none" ? null : deptAssignValue;
      const { error } = await supabase
        .from("profiles")
        .update({ department_id: newDept })
        .eq("id", deptAssignEmployee.id);
      if (error) throw error;

      // update local state
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === deptAssignEmployee.id
            ? { ...e, department_id: newDept, department: departments.find((d) => d.id === newDept) || null }
            : e
        )
      );
      toast.success(language === "ar" ? "تم تحديث القسم" : "Department updated");
      setDeptAssignOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update department");
    } finally {
      setDeptAssignSaving(false);
    }
  }


  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canViewPage) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Header title={language === "ar" ? "الموظفين" : "Employees"} />

      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5" />
            {language === "ar" ? "إجمالي الموظفين" : "Total Employees"}: {employees.length}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <DebouncedInput
                placeholder={
                  language === "ar"
                    ? "بحث بالاسم (ع/إنج)، رقم الموظف، أو الهاتف..."
                    : "Search by name (AR/EN), staff ID, or phone..."
                }
                value={searchQuery}
                onValueChange={setSearchQuery}
                className="pl-10"
              />
            </div>

            {/* Department Filter */}
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue
                  placeholder={language === "ar" ? "القسم" : "Department"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {language === "ar" ? "جميع الأقسام" : "All Departments"}
                </SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {language === "ar" ? dept.name_ar : dept.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

{/* Active Filter */}
<Select value={activeFilter} onValueChange={setActiveFilter}>
  <SelectTrigger className="w-full md:w-40">
    <SelectValue placeholder={language === "ar" ? "الحالة" : "Status"} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">
      {language === "ar" ? "الكل" : "All"}
    </SelectItem>
    <SelectItem value="active">
      {language === "ar" ? "نشط" : "Active"}
    </SelectItem>
    <SelectItem value="inactive">
      {language === "ar" ? "غير نشط" : "Inactive"}
    </SelectItem>
  </SelectContent>
</Select>

            {/* Sort */}
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-full md:w-48">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue
                  placeholder={language === "ar" ? "ترتيب" : "Sort"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">
                  {language === "ar" ? "الاسم (أ-ي)" : "Name (A-Z)"}
                </SelectItem>
                <SelectItem value="name_desc">
                  {language === "ar" ? "الاسم (ي-أ)" : "Name (Z-A)"}
                </SelectItem>
                <SelectItem value="score_asc">
                  {language === "ar" ? "الدرجة (تصاعدي)" : "Score (Low-High)"}
                </SelectItem>
                <SelectItem value="score_desc">
                  {language === "ar" ? "الدرجة (تنازلي)" : "Score (High-Low)"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === "ar" ? "الاسم (إنجليزي)" : "Name (EN)"}</TableHead>
                <TableHead>{language === "ar" ? "الاسم (عربي)" : "Name (AR)"}</TableHead>
                <TableHead>{language === "ar" ? "البريد الإلكتروني" : "Email"}</TableHead>
                <TableHead>{language === "ar" ? "الهاتف" : "Phone"}</TableHead>
                <TableHead>{language === "ar" ? "القسم" : "Department"}</TableHead>
                <TableHead>{language === "ar" ? "رقم الموظف" : "Staff ID"}</TableHead>
                <TableHead>{language === "ar" ? "الحالة" : "Status"}</TableHead>
                <TableHead className="text-center">
                  {language === "ar" ? "تقييم نفس القسم" : "Same-Dept Score"}
                </TableHead>
                <TableHead className="text-center">
                  {language === "ar" ? "تقييم أقسام أخرى" : "Cross-Dept Score"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmployees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد نتائج" : "No results found"}
                  </TableCell>
                </TableRow>
              ) : (
                visibleEmployees.map((employee) => (
                  <TableRow
                    key={employee.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(employee.id)}
                  >
                    <TableCell className="font-medium">{employee.name_en}</TableCell>
                    <TableCell>{employee.name_ar}</TableCell>
                    <TableCell>{employee.email}</TableCell>
                    <TableCell>{employee.phone || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="truncate">
                          {employee.department
                            ? language === "ar"
                              ? employee.department.name_ar
                              : employee.department.name_en
                            : "-"}
                        </span>
                        {canAssignDepartment && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeptAssign(employee);
                            }}
                            title={language === "ar" ? "تعيين/نقل القسم" : "Assign/transfer department"}
                          >
                            <Building2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell><TableCell>{employee.staff_id || "-"}</TableCell>
<TableCell>
  <Badge variant={employee.is_active ? "default" : "secondary"}>
    {employee.is_active
      ? language === "ar"
        ? "نشط"
        : "Active"
      : language === "ar"
      ? "غير نشط"
      : "Inactive"}
  </Badge>
</TableCell>
                    <TableCell className="text-center">
                      {employee.latestSameScore !== null ? (
                        <span
                          className={`font-semibold ${
                            employee.latestSameScore >= 80
                              ? "text-green-600"
                              : employee.latestSameScore >= 60
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {employee.latestSameScore}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.latestCrossScore !== null ? (
                        <span
                          className={`font-semibold ${
                            employee.latestCrossScore >= 80
                              ? "text-green-600"
                              : employee.latestCrossScore >= 60
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {employee.latestCrossScore}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        {filteredEmployees.length > EMPLOYEE_PAGE_SIZE && (
          <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {language === "ar"
                ? `عرض ${visibleEmployees.length} من ${filteredEmployees.length}`
                : `Showing ${visibleEmployees.length} of ${filteredEmployees.length}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={listPage === 0}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
              >
                {language === "ar" ? "السابق" : "Previous"}
              </Button>
              <span>
                {listPage + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={listPage >= pageCount - 1}
                onClick={() => setListPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                {language === "ar" ? "التالي" : "Next"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    
      <Dialog open={deptAssignOpen} onOpenChange={(v) => setDeptAssignOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === "ar" ? "تعيين القسم" : "Assign Department"}
            </DialogTitle>
          </DialogHeader>

          {deptAssignEmployee ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {language === "ar" ? "الموظف:" : "Employee:"}{" "}
                <span className="font-medium text-foreground">
                  {language === "ar" ? deptAssignEmployee.name_ar : deptAssignEmployee.name_en}
                </span>
              </div>

              <Select value={deptAssignValue} onValueChange={setDeptAssignValue}>
                <SelectTrigger>
                  <SelectValue placeholder={language === "ar" ? "اختر القسم" : "Select department"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {language === "ar" ? "بدون قسم" : "Unassigned"}
                  </SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {language === "ar" ? d.name_ar : d.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeptAssignOpen(false)}>
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button onClick={saveDeptAssignment} disabled={deptAssignSaving}>
                  {deptAssignSaving
                    ? language === "ar"
                      ? "جارٍ الحفظ..."
                      : "Saving..."
                    : language === "ar"
                    ? "حفظ"
                    : "Save"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

</div>
  );
};

export default EmployeesPage;
