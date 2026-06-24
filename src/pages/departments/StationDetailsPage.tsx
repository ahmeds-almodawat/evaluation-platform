import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import Header from "@/components/layout/Header";
import DebouncedInput from "@/components/common/DebouncedInput";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Download, FileSpreadsheet, RefreshCw, UserMinus, UserPlus, Users } from "lucide-react";

const db = supabase as any;
const PAGE_SIZE = 50;

type Department = {
  id: string;
  name_en: string;
  name_ar: string;
};

type OrgUnit = {
  id: string;
  department_id: string;
  name_en: string;
  name_ar: string;
  code: string | null;
  is_active: boolean;
};

type ProfileRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  email: string | null;
  staff_id: string | null;
  department_id: string | null;
  unit_id: string | null;
  position: string | null;
  is_active?: boolean | null;
};

type AvailableScope = "same_department_unassigned" | "same_department_other_station" | "no_department";

type ImportRow = {
  rowNumber: number;
  staff_id: string;
  email: string;
  status: "matched" | "missing_key" | "not_found" | "duplicate_in_file";
  profile?: ProfileRow;
};

function normalizeHeader(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

function normalizeValue(value: unknown) {
  return String(value ?? "").trim();
}

function displayIdentifier(row: ProfileRow) {
  return row.email || row.staff_id || row.id;
}

export default function StationDetailsPage() {
  const { departmentId, unitId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { hasPermission, isAdmin } = useSupabaseAuth();

  const canManage =
    isAdmin || hasPermission("departments.manage") || hasPermission("departments.manage_members");

  const [department, setDepartment] = useState<Department | null>(null);
  const [unit, setUnit] = useState<OrgUnit | null>(null);
  const [loadingShell, setLoadingShell] = useState(true);

  const [assignedRows, setAssignedRows] = useState<ProfileRow[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [assignedPage, setAssignedPage] = useState(0);
  const [assignedSearch, setAssignedSearch] = useState("");
  const [selectedAssigned, setSelectedAssigned] = useState<string[]>([]);

  const [availableRows, setAvailableRows] = useState<ProfileRow[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [availablePage, setAvailablePage] = useState(0);
  const [availableSearch, setAvailableSearch] = useState("");
  const [availableScope, setAvailableScope] = useState<AvailableScope>("same_department_unassigned");
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const title = unit
    ? `${isAr ? unit.name_ar : unit.name_en}${unit.code ? ` (${unit.code})` : ""}`
    : isAr
      ? "الوحدة / المحطة"
      : "Unit / Station";

  const assignedPageCount = useMemo(() => Math.max(1, Math.ceil(assignedCount / PAGE_SIZE)), [assignedCount]);
  const availablePageCount = useMemo(() => Math.max(1, Math.ceil(availableCount / PAGE_SIZE)), [availableCount]);

  const allAssignedSelected = assignedRows.length > 0 && selectedAssigned.length === assignedRows.length;
  const allAvailableSelected = availableRows.length > 0 && selectedAvailable.length === availableRows.length;

  const matchedImportRows = useMemo(
    () => importRows.filter((row) => row.status === "matched" && row.profile),
    [importRows],
  );

  function displayName(row?: ProfileRow | null) {
    if (!row) return "—";
    return isAr ? row.name_ar || row.name_en || row.email || "—" : row.name_en || row.name_ar || row.email || "—";
  }

  const fetchShell = useCallback(async () => {
    if (!departmentId || !unitId) return;
    setLoadingShell(true);
    try {
      const [{ data: deptData, error: deptError }, { data: unitData, error: unitError }] = await Promise.all([
        supabase.from("departments").select("id,name_en,name_ar").eq("id", departmentId).maybeSingle(),
        db
          .from("org_units")
          .select("id,department_id,name_en,name_ar,code,is_active")
          .eq("id", unitId)
          .eq("department_id", departmentId)
          .maybeSingle(),
      ]);

      if (deptError) throw deptError;
      if (unitError) throw unitError;
      setDepartment((deptData as Department | null) ?? null);
      setUnit((unitData as OrgUnit | null) ?? null);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to load station");
    } finally {
      setLoadingShell(false);
    }
  }, [departmentId, unitId]);

  const applySearch = (query: any, search: string) => {
    const s = search.trim();
    if (!s) return query;
    const esc = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
    return query.or(`name_en.ilike.%${esc}%,name_ar.ilike.%${esc}%,email.ilike.%${esc}%,staff_id.ilike.%${esc}%`);
  };

  const fetchAssigned = useCallback(async () => {
    if (!departmentId || !unitId) return;
    const from = assignedPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    try {
      let query = db
        .from("profiles")
        .select("id,name_en,name_ar,email,staff_id,department_id,unit_id,position,is_active", { count: "exact" })
        .eq("department_id", departmentId)
        .eq("unit_id", unitId);
      query = applySearch(query, assignedSearch);
      const { data, error, count } = await query.order("name_en", { ascending: true }).range(from, to);
      if (error) throw error;
      setAssignedRows((data ?? []) as ProfileRow[]);
      setAssignedCount(count ?? 0);
      setSelectedAssigned([]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to load station employees");
    }
  }, [assignedPage, assignedSearch, departmentId, unitId]);

  const fetchAvailable = useCallback(async () => {
    if (!departmentId || !unitId) return;
    const from = availablePage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    try {
      let query = db
        .from("profiles")
        .select("id,name_en,name_ar,email,staff_id,department_id,unit_id,position,is_active", { count: "exact" });

      if (availableScope === "no_department") {
        query = query.is("department_id", null);
      } else if (availableScope === "same_department_other_station") {
        query = query.eq("department_id", departmentId).not("unit_id", "is", null).neq("unit_id", unitId);
      } else {
        query = query.eq("department_id", departmentId).is("unit_id", null);
      }

      query = applySearch(query, availableSearch);
      const { data, error, count } = await query.order("name_en", { ascending: true }).range(from, to);
      if (error) throw error;
      setAvailableRows((data ?? []) as ProfileRow[]);
      setAvailableCount(count ?? 0);
      setSelectedAvailable([]);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to load available employees");
    }
  }, [availablePage, availableScope, availableSearch, departmentId, unitId]);

  const refreshBoth = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.all([fetchAssigned(), fetchAvailable()]);
    } finally {
      setBusy(false);
    }
  }, [fetchAssigned, fetchAvailable]);

  useEffect(() => {
    void fetchShell();
  }, [fetchShell]);

  useEffect(() => {
    void fetchAssigned();
  }, [fetchAssigned]);

  useEffect(() => {
    void fetchAvailable();
  }, [fetchAvailable]);

  function toggleSelected(setter: React.Dispatch<React.SetStateAction<string[]>>, id: string) {
    setter((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function assignSelectedToStation() {
    if (!canManage || !departmentId || !unitId || selectedAvailable.length === 0) return;
    setBusy(true);
    try {
      const { error } = await db
        .from("profiles")
        .update({ department_id: departmentId, unit_id: unitId })
        .in("id", selectedAvailable);
      if (error) throw error;
      toast.success(isAr ? "تمت إضافة الموظفين للمحطة" : "Employees assigned to station");
      await refreshBoth();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to assign employees");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedFromStation() {
    if (!canManage || selectedAssigned.length === 0) return;
    setBusy(true);
    try {
      const { error } = await db.from("profiles").update({ unit_id: null }).in("id", selectedAssigned);
      if (error) throw error;
      toast.success(isAr ? "تمت إزالة الموظفين من المحطة" : "Employees removed from station");
      await refreshBoth();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to remove employees");
    } finally {
      setBusy(false);
    }
  }

  function downloadStationAssignmentTemplate() {
    const sample = [
      {
        staff_id: "12950",
        email: "12950@almodawat.sa",
        department_name_en: department?.name_en ?? "Nursing",
        unit_code: unit?.code ?? "NST-001",
        unit_name_en: unit?.name_en ?? "ICU",
        note: "Only staff_id or email is required. Import assigns existing users only.",
      },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample), "Station_Assignment");
    XLSX.writeFile(wb, `station_assignment_${unit?.code || "template"}.xlsx`);
  }

  async function handleImportFile(file?: File | null) {
    if (!file || !departmentId || !unitId) return;
    setImportBusy(true);
    setImportRows([]);
    setImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const seen = new Set<string>();
      const parsed: ImportRow[] = rows.map((raw, index) => {
        const normalized: Record<string, unknown> = {};
        Object.entries(raw).forEach(([key, value]) => {
          normalized[normalizeHeader(key)] = value;
        });
        const staffId = normalizeValue(normalized.staff_id ?? normalized.staffid ?? normalized.id ?? normalized.employee_id);
        const email = normalizeValue(normalized.email ?? normalized.user_email);
        const key = staffId || email.toLowerCase();
        if (!key) return { rowNumber: index + 2, staff_id: staffId, email, status: "missing_key" };
        const normalizedKey = key.toLowerCase();
        if (seen.has(normalizedKey)) return { rowNumber: index + 2, staff_id: staffId, email, status: "duplicate_in_file" };
        seen.add(normalizedKey);
        return { rowNumber: index + 2, staff_id: staffId, email, status: "not_found" };
      });

      const staffIds = parsed.map((row) => row.staff_id).filter(Boolean);
      const emails = parsed.map((row) => row.email).filter(Boolean).map((email) => email.toLowerCase());
      const matchedProfiles: ProfileRow[] = [];

      for (let i = 0; i < staffIds.length; i += 100) {
        const chunk = staffIds.slice(i, i + 100);
        const { data, error } = await db
          .from("profiles")
          .select("id,name_en,name_ar,email,staff_id,department_id,unit_id,position,is_active")
          .in("staff_id", chunk);
        if (error) throw error;
        matchedProfiles.push(...((data ?? []) as ProfileRow[]));
      }

      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const { data, error } = await db
          .from("profiles")
          .select("id,name_en,name_ar,email,staff_id,department_id,unit_id,position,is_active")
          .in("email", chunk);
        if (error) throw error;
        matchedProfiles.push(...((data ?? []) as ProfileRow[]));
      }

      const byStaff = new Map(matchedProfiles.filter((p) => p.staff_id).map((p) => [String(p.staff_id), p]));
      const byEmail = new Map(matchedProfiles.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]));

      const preview = parsed.map((row) => {
        if (row.status === "missing_key" || row.status === "duplicate_in_file") return row;
        const profile = (row.staff_id ? byStaff.get(row.staff_id) : undefined) || (row.email ? byEmail.get(row.email.toLowerCase()) : undefined);
        return profile ? { ...row, status: "matched" as const, profile } : row;
      });

      setImportRows(preview);
      setImportOpen(true);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to read import file");
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImportAssignments() {
    if (!departmentId || !unitId || matchedImportRows.length === 0) return;
    setImportBusy(true);
    try {
      const ids = Array.from(new Set(matchedImportRows.map((row) => row.profile?.id).filter(Boolean))) as string[];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error } = await db.from("profiles").update({ department_id: departmentId, unit_id: unitId }).in("id", chunk);
        if (error) throw error;
      }
      toast.success(isAr ? `تم تعيين ${ids.length} موظف/موظفين` : `Assigned ${ids.length} employee(s)`);
      setImportOpen(false);
      setImportRows([]);
      await refreshBoth();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to import assignments");
    } finally {
      setImportBusy(false);
    }
  }

  const renderEmployeeRow = (row: ProfileRow, selected: boolean, onToggle: () => void) => (
    <TableRow key={row.id}>
      <TableCell className="w-[48px]">
        <div className="flex justify-center">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium">{displayName(row)}</div>
        <div className="text-xs text-muted-foreground">{displayIdentifier(row)}</div>
      </TableCell>
      <TableCell>{row.staff_id || "—"}</TableCell>
      <TableCell>{row.position || "—"}</TableCell>
      <TableCell>
        <Badge variant={row.is_active === false ? "secondary" : "default"}>
          {row.is_active === false ? (isAr ? "غير نشط" : "Inactive") : (isAr ? "نشط" : "Active")}
        </Badge>
      </TableCell>
    </TableRow>
  );

  if (loadingShell) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={isAr ? "تحميل..." : "Loading..."} />
        <div className="container mx-auto p-4 text-muted-foreground">{isAr ? "جارٍ التحميل" : "Loading"}</div>
      </div>
    );
  }

  if (!department || !unit) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={isAr ? "غير موجود" : "Not found"} />
        <div className="container mx-auto p-4">
          <Button variant="outline" onClick={() => navigate(`/departments/${departmentId}`)}>{isAr ? "العودة" : "Back"}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={title}
        subtitle={
          isAr
            ? `${department.name_ar} — إدارة موظفي المحطة بشكل منفصل لتقليل بطء صفحة القسم`
            : `${department.name_en} — manage this station separately to keep the department page fast`
        }
      />

      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate(`/departments/${departmentId}`)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {isAr ? "العودة للقسم" : "Back to department"}
          </Button>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={downloadStationAssignmentTemplate} className="gap-2">
              <Download className="w-4 h-4" />
              {isAr ? "تحميل قالب التعيين" : "Download assignment template"}
            </Button>
            {canManage && (
              <Button asChild className="gap-2">
                <label>
                  <FileSpreadsheet className="w-4 h-4" />
                  {importBusy ? (isAr ? "جارٍ..." : "Working...") : (isAr ? "استيراد موظفين للمحطة" : "Import people to station")}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(event) => {
                      void handleImportFile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            )}
            <Button variant="secondary" onClick={() => void refreshBoth()} disabled={busy} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? "داخل المحطة" : "In station"}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{assignedCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? "متاح للإضافة" : "Available to add"}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{availableCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? "كود المحطة" : "Station code"}</CardTitle></CardHeader>
            <CardContent className="text-xl font-semibold">{unit.code || "—"}</CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />{isAr ? "موظفو المحطة" : "Station employees"}</CardTitle>
                {canManage && (
                  <Button variant="outline" disabled={selectedAssigned.length === 0 || busy} onClick={removeSelectedFromStation} className="gap-2">
                    <UserMinus className="w-4 h-4" />
                    {isAr ? `إزالة (${selectedAssigned.length})` : `Remove (${selectedAssigned.length})`}
                  </Button>
                )}
              </div>
              <DebouncedInput
                value={assignedSearch}
                onValueChange={(value) => { setAssignedPage(0); setAssignedSearch(value); }}
                placeholder={isAr ? "بحث بالاسم أو الرقم أو البريد..." : "Search by name, staff ID, or email..."}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[48px]">
                        <Checkbox
                          checked={allAssignedSelected}
                          onCheckedChange={() => setSelectedAssigned(allAssignedSelected ? [] : assignedRows.map((row) => row.id))}
                        />
                      </TableHead>
                      <TableHead>{isAr ? "الموظف" : "Employee"}</TableHead>
                      <TableHead>{isAr ? "الرقم" : "Staff ID"}</TableHead>
                      <TableHead>{isAr ? "المنصب" : "Position"}</TableHead>
                      <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedRows.map((row) => renderEmployeeRow(row, selectedAssigned.includes(row.id), () => toggleSelected(setSelectedAssigned, row.id)))}
                    {assignedRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{isAr ? "لا يوجد موظفون في هذه المحطة" : "No employees assigned to this station"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{isAr ? "صفحة" : "Page"} {assignedPage + 1} / {assignedPageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={assignedPage <= 0} onClick={() => setAssignedPage((page) => Math.max(0, page - 1))}>{isAr ? "السابق" : "Prev"}</Button>
                  <Button variant="outline" disabled={assignedPage + 1 >= assignedPageCount} onClick={() => setAssignedPage((page) => Math.min(assignedPageCount - 1, page + 1))}>{isAr ? "التالي" : "Next"}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" />{isAr ? "إضافة للمحطة" : "Add to station"}</CardTitle>
                {canManage && (
                  <Button disabled={selectedAvailable.length === 0 || busy} onClick={assignSelectedToStation} className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    {isAr ? `إضافة (${selectedAvailable.length})` : `Add (${selectedAvailable.length})`}
                  </Button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                <DebouncedInput
                  value={availableSearch}
                  onValueChange={(value) => { setAvailablePage(0); setAvailableSearch(value); }}
                  placeholder={isAr ? "بحث في الموظفين المتاحين..." : "Search available employees..."}
                />
                <Select value={availableScope} onValueChange={(value) => { setAvailablePage(0); setAvailableScope(value as AvailableScope); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same_department_unassigned">{isAr ? "نفس القسم بدون محطة" : "Same department, no station"}</SelectItem>
                    <SelectItem value="same_department_other_station">{isAr ? "نفس القسم بمحطة أخرى" : "Same department, other station"}</SelectItem>
                    <SelectItem value="no_department">{isAr ? "بدون قسم" : "No department"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "إضافة الموظف هنا ستعين القسم والمحطة معًا. لا يتم إنشاء مستخدمين جدد من هذه الصفحة."
                  : "Adding here assigns both department and station. This page does not create new users."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[48px]">
                        <Checkbox
                          checked={allAvailableSelected}
                          onCheckedChange={() => setSelectedAvailable(allAvailableSelected ? [] : availableRows.map((row) => row.id))}
                        />
                      </TableHead>
                      <TableHead>{isAr ? "الموظف" : "Employee"}</TableHead>
                      <TableHead>{isAr ? "الرقم" : "Staff ID"}</TableHead>
                      <TableHead>{isAr ? "المنصب" : "Position"}</TableHead>
                      <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableRows.map((row) => renderEmployeeRow(row, selectedAvailable.includes(row.id), () => toggleSelected(setSelectedAvailable, row.id)))}
                    {availableRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{isAr ? "لا يوجد موظفون متاحون حسب الفلتر" : "No available employees for this filter"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{isAr ? "صفحة" : "Page"} {availablePage + 1} / {availablePageCount}</span>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={availablePage <= 0} onClick={() => setAvailablePage((page) => Math.max(0, page - 1))}>{isAr ? "السابق" : "Prev"}</Button>
                  <Button variant="outline" disabled={availablePage + 1 >= availablePageCount} onClick={() => setAvailablePage((page) => Math.min(availablePageCount - 1, page + 1))}>{isAr ? "التالي" : "Next"}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isAr ? "معاينة استيراد موظفي المحطة" : "Station assignment import preview"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "الملف" : "File"}</div><div className="truncate font-medium">{importFileName}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "مطابق" : "Matched"}</div><div className="text-2xl font-bold">{matchedImportRows.length}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "غير موجود" : "Not found"}</div><div className="text-2xl font-bold">{importRows.filter((row) => row.status === "not_found").length}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "مشاكل" : "Issues"}</div><div className="text-2xl font-bold">{importRows.filter((row) => row.status !== "matched" && row.status !== "not_found").length}</div></CardContent></Card>
            </div>
            <div className="rounded-lg border overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? "الصف" : "Row"}</TableHead>
                    <TableHead>{isAr ? "الرقم" : "Staff ID"}</TableHead>
                    <TableHead>{isAr ? "البريد" : "Email"}</TableHead>
                    <TableHead>{isAr ? "الموظف" : "Matched employee"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.slice(0, 200).map((row, index) => (
                    <TableRow key={`${row.rowNumber}-${index}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.staff_id || "—"}</TableCell>
                      <TableCell>{row.email || "—"}</TableCell>
                      <TableCell>{row.profile ? displayName(row.profile) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "matched" ? "default" : row.status === "not_found" ? "secondary" : "destructive"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              {isAr
                ? "سيتم تعيين الموظفين المطابقين فقط لهذه المحطة. لن يتم إنشاء مستخدمين جدد، والصفوف غير المطابقة ستتجاهل."
                : "Only matched employees will be assigned to this station. No new users will be created, and unmatched rows will be skipped."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={confirmImportAssignments} disabled={importBusy || matchedImportRows.length === 0}>
                {isAr ? `تأكيد التعيين (${matchedImportRows.length})` : `Confirm assignment (${matchedImportRows.length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
