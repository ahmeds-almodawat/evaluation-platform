import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useNavigate, useParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import {
  ArrowLeft,
  UserPlus,
  ArrowRightLeft,
  UserMinus,
  Network,
  Plus,
  Trash2,
  UserCog,
  ExternalLink,
  Download,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";

const db = supabase as any;
const PAGE_SIZE = 50;
const NO_UNIT_VALUE = "__no_unit__";
const DEPARTMENT_SCOPE_VALUE = "__department__";

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
  phone: string | null;
  staff_id: string | null;
  department_id: string | null;
  unit_id: string | null;
  direct_manager_id: string | null;
  position: string | null;
};

type ManagerAssignment = {
  id: string;
  manager_id: string;
  department_id: string;
  unit_id: string | null;
  assignment_scope: "department" | "unit";
  is_primary: boolean;
  is_active: boolean;
};
type MasterStationImportStatus =
  | "matched"
  | "missing_employee_key"
  | "duplicate_in_file"
  | "employee_not_found"
  | "missing_unit"
  | "unit_not_found";

type MasterStationImportRow = {
  rowNumber: number;
  staff_id: string;
  email: string;
  unit_code: string;
  unit_name_en: string;
  unit_name_ar: string;
  status: MasterStationImportStatus;
  profile?: ProfileRow;
  unit?: OrgUnit;
  message: string;
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

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


export default function DepartmentDetailsPage() {
  const { departmentId } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { hasPermission, isAdmin } = useSupabaseAuth();

  const canManage =
    isAdmin || hasPermission("departments.manage") || hasPermission("departments.manage_members");

  const [dept, setDept] = useState<Department | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [managerAssignments, setManagerAssignments] = useState<ManagerAssignment[]>([]);
  const [managerCandidates, setManagerCandidates] = useState<ProfileRow[]>([]);
  const [unitEmployeeCounts, setUnitEmployeeCounts] = useState<Record<string, number>>({});
  const [noUnitCount, setNoUnitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeptId, setBulkDeptId] = useState<string>("");
  const [bulkUnitId, setBulkUnitId] = useState<string>("");

  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState<ProfileRow[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addSelectedIds, setAddSelectedIds] = useState<string[]>([]);

  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitNameEn, setUnitNameEn] = useState("");
  const [unitNameAr, setUnitNameAr] = useState("");
  const [unitCode, setUnitCode] = useState("");

  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentManagerId, setAssignmentManagerId] = useState("");
  const [assignmentScopeValue, setAssignmentScopeValue] = useState(DEPARTMENT_SCOPE_VALUE);

  const [masterImportOpen, setMasterImportOpen] = useState(false);
  const [masterImportRows, setMasterImportRows] = useState<MasterStationImportRow[]>([]);
  const [masterImportFileName, setMasterImportFileName] = useState("");
  const [masterImportBusy, setMasterImportBusy] = useState(false);

  const allSelected = useMemo(
    () => rows.length > 0 && selectedIds.length === rows.length,
    [rows, selectedIds],
  );

  const addAllSelected = useMemo(
    () => addResults.length > 0 && addSelectedIds.length === addResults.length,
    [addResults, addSelectedIds],
  );

  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const memberById = useMemo(() => new Map(managerCandidates.map((m) => [m.id, m])), [managerCandidates]);
  const managersByUnitId = useMemo(() => {
    const map = new Map<string, number>();
    managerAssignments.forEach((assignment) => {
      if (assignment.assignment_scope === "unit" && assignment.unit_id) {
        map.set(assignment.unit_id, (map.get(assignment.unit_id) || 0) + 1);
      }
    });
    return map;
  }, [managerAssignments]);
  const departmentManagerCount = useMemo(
    () => managerAssignments.filter((assignment) => assignment.assignment_scope === "department").length,
    [managerAssignments],
  );

  const validMasterImportRows = useMemo(
    () => masterImportRows.filter((row) => row.status === "matched" && row.profile && row.unit),
    [masterImportRows],
  );

  const masterImportCountsByUnit = useMemo(() => {
    const map = new Map<string, { unit: OrgUnit; count: number }>();
    validMasterImportRows.forEach((row) => {
      if (!row.unit) return;
      const current = map.get(row.unit.id);
      if (current) current.count += 1;
      else map.set(row.unit.id, { unit: row.unit, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => (a.unit.code || a.unit.name_en).localeCompare(b.unit.code || b.unit.name_en));
  }, [validMasterImportRows]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);
  const title = dept ? (isAr ? dept.name_ar : dept.name_en) : isAr ? "القسم" : "Department";
  const toolbarVisible = canManage && selectedIds.length > 0;

  useEffect(() => {
    if (!departmentId) return;
    void fetchDepartmentShell();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    if (showMembers) void fetchMembers(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, page, showMembers]);

  async function fetchDepartmentShell() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [{ data: deptData, error: deptErr }, { data: depsData, error: depsErr }] = await Promise.all([
        supabase
          .from("departments")
          .select("id,name_en,name_ar")
          .eq("id", departmentId)
          .maybeSingle(),
        supabase.from("departments").select("id,name_en,name_ar").order("name_en"),
      ]);

      if (deptErr) throw deptErr;
      if (depsErr) throw depsErr;
      setDept(deptData ?? null);
      setDepartments(depsData ?? []);
      await Promise.all([fetchUnits(), fetchUnitStats(), fetchManagerCandidates(), fetchManagerAssignments()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load department");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnits() {
    if (!departmentId) return;
    const { data, error } = await db
      .from("org_units")
      .select("id,department_id,name_en,name_ar,code,is_active")
      .eq("department_id", departmentId)
      .order("name_en", { ascending: true });
    if (error && error.code !== "42P01") throw error;
    setUnits((data ?? []) as OrgUnit[]);
  }

  async function fetchUnitStats() {
    if (!departmentId) return;
    const { data, error } = await db
      .from("profiles")
      .select("id,unit_id")
      .eq("department_id", departmentId)
      .limit(5000);
    if (error) throw error;
    const counts: Record<string, number> = {};
    let withoutUnit = 0;
    ((data ?? []) as Array<{ id: string; unit_id: string | null }>).forEach((row) => {
      if (row.unit_id) counts[row.unit_id] = (counts[row.unit_id] || 0) + 1;
      else withoutUnit += 1;
    });
    setUnitEmployeeCounts(counts);
    setNoUnitCount(withoutUnit);
  }

  async function fetchManagerCandidates() {
    if (!departmentId) return;
    const { data, error } = await db
      .from("profiles")
      .select("id,name_en,name_ar,email,phone,staff_id,department_id,unit_id,direct_manager_id,position")
      .eq("department_id", departmentId)
      .order("name_en", { ascending: true })
      .limit(500);
    if (error) throw error;
    setManagerCandidates((data ?? []) as ProfileRow[]);
  }

  async function fetchManagerAssignments() {
    if (!departmentId) return;
    const { data, error } = await db
      .from("manager_unit_assignments")
      .select("id,manager_id,department_id,unit_id,assignment_scope,is_primary,is_active")
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error && error.code !== "42P01") throw error;
    setManagerAssignments((data ?? []) as ManagerAssignment[]);
  }

  async function fetchMembers(nextPage: number, nextSearch: string) {
    if (!departmentId) return;
    setLoading(true);
    try {
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = db
        .from("profiles")
        .select("id,name_en,name_ar,email,phone,staff_id,department_id,unit_id,direct_manager_id,position", { count: "exact" })
        .eq("department_id", departmentId);

      const s = nextSearch.trim();
      if (s) {
        const esc = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
        q = q.or(
          `name_en.ilike.%${esc}%,name_ar.ilike.%${esc}%,email.ilike.%${esc}%,staff_id.ilike.%${esc}%,phone.ilike.%${esc}%`,
        );
      }

      const { data, error, count } = await q.order("name_en", { ascending: true }).range(from, to);

      if (error) throw error;
      setRows((data as ProfileRow[] | null) ?? []);
      setTotalCount(count ?? 0);
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(rows.map((r) => r.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAddAll = () => {
    if (addAllSelected) setAddSelectedIds([]);
    else setAddSelectedIds(addResults.map((r) => r.id));
  };

  const toggleAddOne = (id: string) => {
    setAddSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  function displayName(row?: ProfileRow | null) {
    if (!row) return "—";
    return isAr ? row.name_ar || row.name_en || row.email || "—" : row.name_en || row.name_ar || row.email || "—";
  }

  function unitName(unitId?: string | null) {
    if (!unitId) return isAr ? "بدون وحدة" : "No unit";
    const unit = unitById.get(unitId);
    return unit ? (isAr ? unit.name_ar : unit.name_en) : "—";
  }

  function normalizeUnitCode(value: string) {
    return value.trim().toUpperCase().replace(/\s+/g, " ");
  }

  function duplicateActiveCodeMessage(code: string) {
    return isAr
      ? `الكود ${code} مستخدم بالفعل في وحدة/محطة نشطة داخل هذا القسم.`
      : `Code ${code} is already used by another active unit/station in this department.`;
  }

  async function saveUnit() {
    if (!canManage || !departmentId) return;
    if (!unitNameEn.trim() || !unitNameAr.trim()) {
      toast.error(isAr ? "يرجى إدخال اسم الوحدة باللغتين" : "Please enter the unit name in both languages");
      return;
    }

    const normalizedCode = normalizeUnitCode(unitCode);
    if (normalizedCode) {
      const duplicate = units.find((unit) => unit.is_active && normalizeUnitCode(unit.code || "") === normalizedCode);
      if (duplicate) {
        toast.error(duplicateActiveCodeMessage(normalizedCode));
        return;
      }
    }

    try {
      const { error } = await db.from("org_units").insert({
        department_id: departmentId,
        name_en: unitNameEn.trim().replace(/OUT\s*PAI?TIENT|OUTPAITENT/gi, "OUTPATIENT"),
        name_ar: unitNameAr.trim(),
        code: normalizedCode || null,
        is_active: true,
      });
      if (error) throw error;
      toast.success(isAr ? "تمت إضافة الوحدة" : "Unit added");
      setUnitDialogOpen(false);
      setUnitNameEn("");
      setUnitNameAr("");
      setUnitCode("");
      await fetchUnits();
    } catch (e: any) {
      const message = String(e?.message ?? "");
      if (message.toLowerCase().includes("duplicate") || e?.code === "23505") {
        toast.error(duplicateActiveCodeMessage(normalizedCode || unitCode));
      } else {
        toast.error(e?.message ?? "Failed to save unit");
      }
    }
  }

  async function deactivateUnit(unitId: string) {
    if (!canManage) return;
    if (!confirm(isAr ? "تعطيل هذه الوحدة؟ لن يتم حذف الموظفين." : "Deactivate this unit? Employees will not be deleted.")) return;
    try {
      const { error } = await db.from("org_units").update({ is_active: false }).eq("id", unitId);
      if (error) throw error;
      toast.success(isAr ? "تم تعطيل الوحدة" : "Unit deactivated");
      await fetchUnits();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to deactivate unit");
    }
  }

  async function deleteInactiveUnit(unit: OrgUnit) {
    if (!canManage || unit.is_active) return;
    if (!confirm(isAr ? "حذف الوحدة المعطلة نهائيًا؟ يجب أن تكون غير مستخدمة." : "Permanently delete this inactive unit? It must be unused.")) return;

    try {
      const [profilesRes, managersRes, campaignsSourceRes, campaignsTargetRes, evalEvaluatorRes, evalEvaluateeRes] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
        db.from("manager_unit_assignments").select("id", { count: "exact", head: true }).eq("unit_id", unit.id),
        db.from("evaluation_campaigns").select("id", { count: "exact", head: true }).eq("source_unit_id", unit.id),
        db.from("evaluation_campaigns").select("id", { count: "exact", head: true }).eq("target_unit_id", unit.id),
        db.from("evaluations").select("id", { count: "exact", head: true }).eq("evaluator_unit_id", unit.id),
        db.from("evaluations").select("id", { count: "exact", head: true }).eq("evaluatee_unit_id", unit.id),
      ]);

      const usedCount =
        (profilesRes.count || 0) +
        (managersRes.count || 0) +
        (campaignsSourceRes.count || 0) +
        (campaignsTargetRes.count || 0) +
        (evalEvaluatorRes.count || 0) +
        (evalEvaluateeRes.count || 0);

      if (usedCount > 0) {
        toast.error(
          isAr
            ? `لا يمكن الحذف. هذه الوحدة مرتبطة بـ ${usedCount} سجل/سجلات.`
            : `Cannot delete. This unit is referenced by ${usedCount} record(s).`,
        );
        return;
      }

      const { error } = await db.from("org_units").delete().eq("id", unit.id).eq("is_active", false);
      if (error) throw error;
      toast.success(isAr ? "تم حذف الوحدة المعطلة" : "Inactive unit deleted");
      await fetchUnits();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete inactive unit");
    }
  }

  function downloadMasterStationTemplate() {
    const sample = [
      {
        staff_id: "12950",
        email: "12950@almodawat.sa",
        department_name_en: dept?.name_en ?? "Nursing",
        unit_code: "NST-001",
        unit_name_en: "ICU",
        note: "Master import assigns existing users to existing active stations only.",
      },
      {
        staff_id: "13254",
        email: "13254@almodawat.sa",
        department_name_en: dept?.name_en ?? "Nursing",
        unit_code: "NST-003",
        unit_name_en: "CCU",
        note: "Rows with missing users or invalid station codes are skipped in preview.",
      },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample), "Master_Station_Assignment");
    XLSX.writeFile(wb, `master_station_assignment_${dept?.name_en || "department"}.xlsx`);
  }

  function findUnitForImport(row: { unit_code: string; unit_name_en: string; unit_name_ar: string }) {
    const activeUnits = units.filter((unit) => unit.is_active);
    const code = normalizeLookup(row.unit_code);
    if (code) {
      const byCode = activeUnits.find((unit) => normalizeLookup(unit.code) === code);
      if (byCode) return byCode;
    }
    const nameEn = normalizeLookup(row.unit_name_en);
    if (nameEn) {
      const byNameEn = activeUnits.find((unit) => normalizeLookup(unit.name_en) === nameEn);
      if (byNameEn) return byNameEn;
    }
    const nameAr = normalizeLookup(row.unit_name_ar);
    if (nameAr) {
      const byNameAr = activeUnits.find((unit) => normalizeLookup(unit.name_ar) === nameAr);
      if (byNameAr) return byNameAr;
    }
    return null;
  }

  async function handleMasterStationImportFile(file?: File | null) {
    if (!file || !departmentId) return;
    setMasterImportBusy(true);
    setMasterImportRows([]);
    setMasterImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const fileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const seenEmployees = new Set<string>();

      const parsed: MasterStationImportRow[] = fileRows.map((raw, index) => {
        const normalized: Record<string, unknown> = {};
        Object.entries(raw).forEach(([key, value]) => {
          normalized[normalizeHeader(key)] = value;
        });

        const staffId = normalizeValue(normalized.staff_id ?? normalized.staffid ?? normalized.id ?? normalized.employee_id);
        const email = normalizeValue(normalized.email ?? normalized.user_email).toLowerCase();
        const unitCode = normalizeValue(normalized.unit_code ?? normalized.station_code ?? normalized.code).toUpperCase();
        const unitNameEn = normalizeValue(normalized.unit_name_en ?? normalized.station_name_en ?? normalized.unit ?? normalized.station);
        const unitNameAr = normalizeValue(normalized.unit_name_ar ?? normalized.station_name_ar);
        const employeeKey = staffId || email;
        const rowNumber = index + 2;

        if (!employeeKey) {
          return {
            rowNumber,
            staff_id: staffId,
            email,
            unit_code: unitCode,
            unit_name_en: unitNameEn,
            unit_name_ar: unitNameAr,
            status: "missing_employee_key",
            message: isAr ? "لا يوجد رقم وظيفي أو بريد" : "Missing staff_id or email",
          };
        }

        const duplicateKey = employeeKey.toLowerCase();
        if (seenEmployees.has(duplicateKey)) {
          return {
            rowNumber,
            staff_id: staffId,
            email,
            unit_code: unitCode,
            unit_name_en: unitNameEn,
            unit_name_ar: unitNameAr,
            status: "duplicate_in_file",
            message: isAr ? "تكرار الموظف داخل الملف" : "Duplicate employee in file",
          };
        }
        seenEmployees.add(duplicateKey);

        if (!unitCode && !unitNameEn && !unitNameAr) {
          return {
            rowNumber,
            staff_id: staffId,
            email,
            unit_code: unitCode,
            unit_name_en: unitNameEn,
            unit_name_ar: unitNameAr,
            status: "missing_unit",
            message: isAr ? "لا يوجد كود أو اسم محطة" : "Missing station code/name",
          };
        }

        return {
          rowNumber,
          staff_id: staffId,
          email,
          unit_code: unitCode,
          unit_name_en: unitNameEn,
          unit_name_ar: unitNameAr,
          status: "employee_not_found",
          message: isAr ? "لم يتم العثور على الموظف" : "Employee not found",
        };
      });

      const staffIds = parsed.map((row) => row.staff_id).filter(Boolean);
      const emails = parsed.map((row) => row.email).filter(Boolean);
      const matchedProfiles: ProfileRow[] = [];

      for (let i = 0; i < staffIds.length; i += 100) {
        const chunk = staffIds.slice(i, i + 100);
        const { data, error } = await db
          .from("profiles")
          .select("id,name_en,name_ar,email,phone,staff_id,department_id,unit_id,direct_manager_id,position")
          .in("staff_id", chunk);
        if (error) throw error;
        matchedProfiles.push(...((data ?? []) as ProfileRow[]));
      }

      for (let i = 0; i < emails.length; i += 100) {
        const chunk = emails.slice(i, i + 100);
        const { data, error } = await db
          .from("profiles")
          .select("id,name_en,name_ar,email,phone,staff_id,department_id,unit_id,direct_manager_id,position")
          .in("email", chunk);
        if (error) throw error;
        matchedProfiles.push(...((data ?? []) as ProfileRow[]));
      }

      const byStaff = new Map(matchedProfiles.filter((p) => p.staff_id).map((p) => [String(p.staff_id), p]));
      const byEmail = new Map(matchedProfiles.filter((p) => p.email).map((p) => [String(p.email).toLowerCase(), p]));

      const preview = parsed.map((row): MasterStationImportRow => {
        if (row.status === "missing_employee_key" || row.status === "duplicate_in_file" || row.status === "missing_unit") return row;
        const profile = (row.staff_id ? byStaff.get(row.staff_id) : undefined) || (row.email ? byEmail.get(row.email) : undefined);
        if (!profile) return row;
        const unit = findUnitForImport(row);
        if (!unit) {
          return {
            ...row,
            profile,
            status: "unit_not_found",
            message: isAr ? "لم يتم العثور على محطة نشطة مطابقة داخل هذا القسم" : "No matching active station in this department",
          };
        }
        return {
          ...row,
          profile,
          unit,
          status: "matched",
          message: isAr ? "جاهز للتعيين" : "Ready to assign",
        };
      });

      setMasterImportRows(preview);
      setMasterImportOpen(true);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to read master import file");
    } finally {
      setMasterImportBusy(false);
    }
  }

  async function confirmMasterStationImport() {
    if (!departmentId || validMasterImportRows.length === 0) return;
    setMasterImportBusy(true);
    try {
      const grouped = new Map<string, string[]>();
      validMasterImportRows.forEach((row) => {
        if (!row.profile || !row.unit) return;
        const existing = grouped.get(row.unit.id) ?? [];
        existing.push(row.profile.id);
        grouped.set(row.unit.id, existing);
      });

      for (const [unitId, ids] of grouped.entries()) {
        const uniqueIds = Array.from(new Set(ids));
        for (let i = 0; i < uniqueIds.length; i += 100) {
          const chunk = uniqueIds.slice(i, i + 100);
          const { error } = await db.from("profiles").update({ department_id: departmentId, unit_id: unitId }).in("id", chunk);
          if (error) throw error;
        }
      }

      toast.success(isAr ? `تم تعيين ${validMasterImportRows.length} موظف/موظفين للمحطات` : `Assigned ${validMasterImportRows.length} employee(s) to stations`);
      setMasterImportOpen(false);
      setMasterImportRows([]);
      await Promise.all([fetchUnitStats(), fetchManagerCandidates()]);
      if (showMembers) await fetchMembers(page, search);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to confirm master station import");
    } finally {
      setMasterImportBusy(false);
    }
  }

  async function assignUnit(ids: string[], unitValue: string) {
    if (!canManage) return;
    if (ids.length === 0 || !unitValue) return;
    const nextUnitId = unitValue === NO_UNIT_VALUE ? null : unitValue;
    try {
      const { error } = await db.from("profiles").update({ unit_id: nextUnitId }).in("id", ids);
      if (error) throw error;
      toast.success(isAr ? "تم تحديث الوحدة/المحطة" : "Unit/station updated");
      setBulkUnitId("");
      await Promise.all([fetchMembers(page, search), fetchUnitStats(), fetchManagerCandidates()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign unit");
    }
  }

  async function removeFromDept(ids: string[]) {
    if (!canManage || ids.length === 0) return;
    try {
      const { error } = await db
        .from("profiles")
        .update({ department_id: null, unit_id: null, direct_manager_id: null })
        .in("id", ids);
      if (error) throw error;
      toast.success(isAr ? "تمت إزالة الموظفين من القسم" : "Employees removed from department");
      await Promise.all([fetchMembers(page, search), fetchUnitStats(), fetchManagerCandidates(), fetchManagerAssignments()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove");
    }
  }

  async function transferToDept(ids: string[], newDept: string) {
    if (!canManage || ids.length === 0 || !newDept) return;
    try {
      const { error } = await db
        .from("profiles")
        .update({ department_id: newDept, unit_id: null, direct_manager_id: null })
        .in("id", ids);
      if (error) throw error;
      toast.success(isAr ? "تم نقل الموظفين" : "Employees transferred");
      setBulkDeptId("");
      await Promise.all([fetchMembers(page, search), fetchUnitStats(), fetchManagerCandidates(), fetchManagerAssignments()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to transfer");
    }
  }

  async function searchAddEmployees(q: string) {
    if (!departmentId) return;
    setAddLoading(true);
    try {
      let query = db
        .from("profiles")
        .select("id,name_en,name_ar,email,phone,staff_id,department_id,unit_id,direct_manager_id,position")
        .or(`department_id.is.null,department_id.neq.${departmentId}`);

      const s = q.trim();
      if (s) {
        const esc = s.replace(/%/g, "\\%").replace(/_/g, "\\_");
        query = query.or(
          `name_en.ilike.%${esc}%,name_ar.ilike.%${esc}%,email.ilike.%${esc}%,staff_id.ilike.%${esc}%,phone.ilike.%${esc}%`,
        );
      }

      const { data, error } = await query.order("name_en", { ascending: true }).limit(50);
      if (error) throw error;
      const filtered = (data as ProfileRow[] | null)?.filter((r) => r.department_id !== departmentId) ?? [];
      setAddResults(filtered);
      setAddSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to search employees");
    } finally {
      setAddLoading(false);
    }
  }

  async function addSelectedEmployees() {
    if (!canManage || !departmentId || addSelectedIds.length === 0) return;
    try {
      const { error } = await db
        .from("profiles")
        .update({ department_id: departmentId, unit_id: null, direct_manager_id: null })
        .in("id", addSelectedIds);
      if (error) throw error;
      toast.success(isAr ? "تمت إضافة الموظفين" : "Employees added");
      setAddResults((prev) => prev.filter((r) => !addSelectedIds.includes(r.id)));
      setAddSelectedIds([]);
      await Promise.all([fetchMembers(page, search), fetchUnitStats(), fetchManagerCandidates()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add selected employees");
    }
  }

  async function addEmployeeToDept(empId: string) {
    if (!canManage || !departmentId) return;
    try {
      const { error } = await db
        .from("profiles")
        .update({ department_id: departmentId, unit_id: null, direct_manager_id: null })
        .eq("id", empId);
      if (error) throw error;
      toast.success(isAr ? "تمت إضافة الموظف" : "Employee added");
      setAddResults((prev) => prev.filter((r) => r.id !== empId));
      await Promise.all([fetchMembers(page, search), fetchUnitStats(), fetchManagerCandidates()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add employee");
    }
  }

  async function saveManagerAssignment() {
    if (!canManage || !departmentId) return;
    if (!assignmentManagerId) {
      toast.error(isAr ? "اختر المدير" : "Select a manager");
      return;
    }

    const isDepartmentScope = assignmentScopeValue === DEPARTMENT_SCOPE_VALUE;
    const payload = {
      manager_id: assignmentManagerId,
      department_id: departmentId,
      unit_id: isDepartmentScope ? null : assignmentScopeValue,
      assignment_scope: isDepartmentScope ? "department" : "unit",
      is_active: true,
    };

    try {
      const { error } = await db.from("manager_unit_assignments").insert(payload);
      if (error) throw error;
      toast.success(isAr ? "تم حفظ تعيين المدير" : "Manager assignment saved");
      setAssignmentDialogOpen(false);
      setAssignmentManagerId("");
      setAssignmentScopeValue(DEPARTMENT_SCOPE_VALUE);
      await fetchManagerAssignments();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save manager assignment");
    }
  }

  async function removeManagerAssignment(id: string) {
    if (!canManage) return;
    try {
      const { error } = await db.from("manager_unit_assignments").delete().eq("id", id);
      if (error) throw error;
      toast.success(isAr ? "تم حذف تعيين المدير" : "Manager assignment removed");
      await fetchManagerAssignments();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove manager assignment");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={title} subtitle={isAr ? "ملخص القسم والوحدات. افتح المحطة لإدارة موظفيها بسرعة." : "Department and unit overview. Open a station to manage people faster."} />

      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="outline" onClick={() => navigate("/departments")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {isAr ? "العودة" : "Back"}
          </Button>

          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث داخل موظفي القسم..." : "Search employees in this department..."}
              className="w-[260px]"
            />
            <Button
              variant="secondary"
              onClick={() => {
                setShowMembers(true);
                setPage(0);
                void fetchMembers(0, search);
              }}
            >
              {isAr ? "بحث" : "Search"}
            </Button>

            {canManage && (
              <Button onClick={() => { setAddOpen(true); setAddSearch(""); setAddResults([]); }} className="gap-2">
                <UserPlus className="w-4 h-4" />
                {isAr ? "إضافة موظف" : "Add employee"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Network className="w-5 h-5" />
                {isAr ? "الوحدات / المحطات" : "Units / Stations"}
              </CardTitle>
              {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={downloadMasterStationTemplate} className="gap-2">
                    <Download className="w-4 h-4" />
                    {isAr ? "قالب التوزيع" : "Assignment template"}
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-2" disabled={masterImportBusy || units.filter((u) => u.is_active).length === 0} asChild>
                    <label className="cursor-pointer">
                      <FileSpreadsheet className="w-4 h-4" />
                      {masterImportBusy ? (isAr ? "جارٍ..." : "Working...") : (isAr ? "استيراد كل المحطات" : "Import all stations")}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void handleMasterStationImportFile(file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </Button>
                  <Button size="sm" onClick={() => setUnitDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    {isAr ? "إضافة" : "Add"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "اختياري: استخدمها للأقسام الكبيرة مثل التمريض. الأقسام الصغيرة يمكن أن تبقى بدون وحدات."
                  : "Optional: use for large departments like Nursing. Small departments can stay without units."}
              </p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isAr ? "الوحدة" : "Unit"}</TableHead>
                      <TableHead>{isAr ? "الكود" : "Code"}</TableHead>
                      <TableHead>{isAr ? "الموظفون" : "Employees"}</TableHead>
                      <TableHead>{isAr ? "المدراء" : "Managers"}</TableHead>
                      <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-right">{isAr ? "فتح" : "Open"}</TableHead>
                      {canManage && <TableHead className="text-right">{isAr ? "إجراءات" : "Actions"}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell>
                          <div className="font-medium">{isAr ? unit.name_ar : unit.name_en}</div>
                          <div className="text-xs text-muted-foreground">{isAr ? unit.name_en : unit.name_ar}</div>
                        </TableCell>
                        <TableCell>{unit.code || "—"}</TableCell>
                        <TableCell>{unitEmployeeCounts[unit.id] || 0}</TableCell>
                        <TableCell>{(managersByUnitId.get(unit.id) || 0) + departmentManagerCount}</TableCell>
                        <TableCell>
                          <Badge variant={unit.is_active ? "default" : "secondary"}>
                            {unit.is_active ? (isAr ? "نشطة" : "Active") : (isAr ? "معطلة" : "Inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/departments/${departmentId}/units/${unit.id}`)}
                            className="gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            {isAr ? "فتح" : "Open"}
                          </Button>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            {unit.is_active ? (
                              <Button variant="ghost" size="icon" onClick={() => deactivateUnit(unit.id)} title={isAr ? "تعطيل" : "Deactivate"}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => deleteInactiveUnit(unit)} className="text-destructive">
                                {isAr ? "حذف" : "Delete"}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {units.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-6">
                          {isAr ? "لا توجد وحدات. سيتم استخدام القسم كاملاً للتقييم الداخلي." : "No units. Same-department evaluations will use the whole department."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {noUnitCount > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {isAr
                    ? `${noUnitCount} موظف/موظفين في هذا القسم بدون محطة. افتح محطة محددة أو استخدم جدول موظفي القسم بالأسفل لتعيينهم.`
                    : `${noUnitCount} employee(s) in this department have no station. Open a station or use the department employee table below to assign them.`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCog className="w-5 h-5" />
                {isAr ? "توزيع المدراء" : "Manager Assignments"}
              </CardTitle>
              {canManage && (
                <Button size="sm" onClick={() => setAssignmentDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {isAr ? "إضافة" : "Add"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "يمكن للمدير الإشراف على وحدة محددة أو كامل القسم. تستخدم هذه التعيينات عند إنشاء التقييم الداخلي."
                  : "A manager can supervise a specific unit or the whole department. These assignments are used when same-department evaluations are created."}
              </p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isAr ? "المدير" : "Manager"}</TableHead>
                      <TableHead>{isAr ? "النطاق" : "Scope"}</TableHead>
                      {canManage && <TableHead className="text-right">{isAr ? "إجراءات" : "Actions"}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {managerAssignments.map((assignment) => {
                      const manager = memberById.get(assignment.manager_id);
                      return (
                        <TableRow key={assignment.id}>
                          <TableCell>
                            <div className="font-medium">{displayName(manager)}</div>
                            <div className="text-xs text-muted-foreground">{manager?.position || manager?.email || assignment.manager_id}</div>
                          </TableCell>
                          <TableCell>
                            {assignment.assignment_scope === "department"
                              ? (isAr ? "كامل القسم" : "Whole department")
                              : unitName(assignment.unit_id)}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => removeManagerAssignment(assignment.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {managerAssignments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 3 : 2} className="text-center text-muted-foreground py-6">
                          {isAr ? "لا توجد تعيينات مدراء. سيعمل التقييم الداخلي كزملاء فقط." : "No manager assignments. Same-department evaluation will run as peers only."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {!showMembers ? (
          <Card>
            <CardHeader>
              <CardTitle>{isAr ? "إدارة موظفي القسم" : "Department employee management"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "لتحسين الأداء، لا يتم تحميل جدول كل موظفي القسم تلقائيًا. افتح محطة محددة لإدارة موظفيها أو اعرض الجدول الكامل عند الحاجة."
                  : "To improve performance, the full department employee table is not loaded automatically. Open a station to manage its people, or show the full table only when needed."}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowMembers(true);
                  setPage(0);
                  void fetchMembers(0, search);
                }}
              >
                {isAr ? "عرض جدول موظفي القسم" : "Show department employee table"}
              </Button>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{isAr ? "الموظفون" : "Employees"}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {isAr ? "الإجمالي" : "Total"}: {totalCount}
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {toolbarVisible && (
              <div className="sticky top-0 z-10 rounded-lg border bg-background p-3 flex flex-col xl:flex-row gap-2 xl:items-center xl:justify-between">
                <div className="text-sm">
                  <b>{selectedIds.length}</b> {isAr ? "محدد" : "selected"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={bulkUnitId} onValueChange={setBulkUnitId}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder={isAr ? "تعيين وحدة/محطة..." : "Assign unit/station..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_UNIT_VALUE}>{isAr ? "بدون وحدة" : "No unit"}</SelectItem>
                      {units.filter((u) => u.is_active).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{isAr ? u.name_ar : u.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="secondary" className="gap-2" disabled={!bulkUnitId} onClick={() => assignUnit(selectedIds, bulkUnitId)}>
                    <Network className="w-4 h-4" />
                    {isAr ? "تحديث الوحدة" : "Update unit"}
                  </Button>

                  <Select value={bulkDeptId} onValueChange={setBulkDeptId}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder={isAr ? "نقل إلى قسم..." : "Transfer to..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.filter((d) => d.id !== departmentId).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{isAr ? d.name_ar : d.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="default" className="gap-2" disabled={!bulkDeptId} onClick={() => transferToDept(selectedIds, bulkDeptId)}>
                    <ArrowRightLeft className="w-4 h-4" />
                    {isAr ? "نقل المحدد" : "Transfer selected"}
                  </Button>

                  <Button variant="destructive" className="gap-2" onClick={() => removeFromDept(selectedIds)}>
                    <UserMinus className="w-4 h-4" />
                    {isAr ? "إزالة من القسم" : "Remove from department"}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {canManage && (
                        <TableHead className="w-[48px]">
                          <div className="flex items-center justify-center">
                            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                          </div>
                        </TableHead>
                      )}
                      <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                      <TableHead>{isAr ? "البريد" : "Email"}</TableHead>
                      <TableHead>{isAr ? "الرقم الوظيفي" : "Staff ID"}</TableHead>
                      <TableHead>{isAr ? "الوحدة/المحطة" : "Unit / Station"}</TableHead>
                      <TableHead>{isAr ? "المسمى" : "Position"}</TableHead>
                      {canManage && <TableHead className="text-right">{isAr ? "إجراءات" : "Actions"}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        {canManage && (
                          <TableCell className="w-[48px]">
                            <div className="flex items-center justify-center">
                              <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="font-medium">{displayName(r)}</div>
                          <div className="text-xs text-muted-foreground">{isAr ? r.name_en : r.name_ar}</div>
                        </TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.staff_id ?? "-"}</TableCell>
                        <TableCell>
                          {canManage ? (
                            <Select value={r.unit_id ?? NO_UNIT_VALUE} onValueChange={(val) => assignUnit([r.id], val)}>
                              <SelectTrigger className="w-[190px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_UNIT_VALUE}>{isAr ? "بدون وحدة" : "No unit"}</SelectItem>
                                {units.filter((u) => u.is_active).map((u) => (
                                  <SelectItem key={u.id} value={u.id}>{isAr ? u.name_ar : u.name_en}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            unitName(r.unit_id)
                          )}
                        </TableCell>
                        <TableCell>{r.position || "—"}</TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select onValueChange={(val) => transferToDept([r.id], val)} value="">
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder={isAr ? "نقل إلى..." : "Transfer to..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {departments.filter((d) => d.id !== departmentId).map((d) => (
                                    <SelectItem key={d.id} value={d.id}>{isAr ? d.name_ar : d.name_en}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Button variant="outline" onClick={() => removeFromDept([r.id])}>
                                {isAr ? "إزالة" : "Remove"}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}

                    {!loading && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground">
                          {isAr ? "لا يوجد موظفون في هذا القسم" : "No employees in this department"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                {isAr ? "صفحة" : "Page"} {page + 1} / {pageCount}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  {isAr ? "السابق" : "Prev"}
                </Button>
                <Button variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  {isAr ? "التالي" : "Next"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      <Dialog open={masterImportOpen} onOpenChange={setMasterImportOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{isAr ? "معاينة استيراد توزيع كل المحطات" : "Master station assignment import preview"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "الملف" : "File"}</div><div className="truncate font-medium">{masterImportFileName || "—"}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "جاهز" : "Ready"}</div><div className="text-2xl font-bold">{validMasterImportRows.length}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "مشاكل" : "Issues"}</div><div className="text-2xl font-bold">{masterImportRows.length - validMasterImportRows.length}</div></CardContent></Card>
              <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{isAr ? "محطات" : "Stations"}</div><div className="text-2xl font-bold">{masterImportCountsByUnit.length}</div></CardContent></Card>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              {isAr
                ? "هذا الاستيراد لا ينشئ مستخدمين أو محطات جديدة. يقوم فقط بتعيين مستخدمين موجودين إلى محطات نشطة موجودة داخل هذا القسم."
                : "This import does not create users or stations. It only assigns existing users to existing active stations inside this department."}
            </div>

            {masterImportCountsByUnit.length > 0 && (
              <div className="rounded-lg border p-3">
                <div className="mb-2 font-medium">{isAr ? "ملخص حسب المحطة" : "Summary by station"}</div>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {masterImportCountsByUnit.map(({ unit, count }) => (
                    <div key={unit.id} className="rounded-md border bg-background p-2 text-sm">
                      <div className="font-medium">{unit.code ? `${unit.code} — ` : ""}{isAr ? unit.name_ar : unit.name_en}</div>
                      <div className="text-muted-foreground">{count} {isAr ? "موظف/موظفين" : "employee(s)"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>{isAr ? "الصف" : "Row"}</TableHead>
                    <TableHead>{isAr ? "الموظف" : "Employee"}</TableHead>
                    <TableHead>{isAr ? "الرقم / البريد" : "Staff / Email"}</TableHead>
                    <TableHead>{isAr ? "المحطة" : "Station"}</TableHead>
                    <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masterImportRows.slice(0, 300).map((row) => (
                    <TableRow key={`${row.rowNumber}-${row.staff_id || row.email || row.unit_code}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.profile ? displayName(row.profile) : "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.profile?.staff_id || row.profile?.email || ""}</div>
                      </TableCell>
                      <TableCell>{row.staff_id || row.email || "—"}</TableCell>
                      <TableCell>
                        {row.unit ? (
                          <div>
                            <div className="font-medium">{row.unit.code ? `${row.unit.code} — ` : ""}{isAr ? row.unit.name_ar : row.unit.name_en}</div>
                            <div className="text-xs text-muted-foreground">{isAr ? row.unit.name_en : row.unit.name_ar}</div>
                          </div>
                        ) : (
                          <span>{row.unit_code || row.unit_name_en || row.unit_name_ar || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "matched" ? "default" : "secondary"}>{row.message}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {masterImportRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {isAr ? "لا توجد بيانات" : "No data"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {masterImportRows.length > 300 && (
              <div className="text-xs text-muted-foreground">
                {isAr ? `تم عرض أول 300 صف فقط من ${masterImportRows.length}.` : `Showing first 300 rows only out of ${masterImportRows.length}.`}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMasterImportOpen(false)} disabled={masterImportBusy}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={confirmMasterStationImport} disabled={masterImportBusy || validMasterImportRows.length === 0} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                {masterImportBusy ? (isAr ? "جارٍ..." : "Working...") : (isAr ? `تأكيد التعيين (${validMasterImportRows.length})` : `Confirm assignment (${validMasterImportRows.length})`)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "إضافة وحدة / محطة" : "Add Unit / Station"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={unitNameEn} onChange={(e) => setUnitNameEn(e.target.value)} placeholder="Station 1 / ICU / Front Desk" />
            <Input value={unitNameAr} onChange={(e) => setUnitNameAr(e.target.value)} placeholder="المحطة 1 / العناية / الاستقبال الأمامي" dir="rtl" />
            <Input
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
              placeholder={isAr ? "كود اختياري" : "Optional code"}
            />
            {unitCode.trim() && units.some((unit) => unit.is_active && normalizeUnitCode(unit.code || "") === normalizeUnitCode(unitCode)) ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {duplicateActiveCodeMessage(normalizeUnitCode(unitCode))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {isAr
                  ? "لا يمكن تكرار كود نشط داخل نفس القسم. يمكن الاحتفاظ بأكواد قديمة في وحدات معطلة فقط عند الحاجة."
                  : "Active unit codes cannot be duplicated inside the same department. Old inactive code conflicts are allowed only when needed."}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUnitDialogOpen(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={saveUnit}>{isAr ? "حفظ" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "إضافة تعيين مدير" : "Add Manager Assignment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={assignmentManagerId} onValueChange={setAssignmentManagerId}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر المدير" : "Select manager"} />
              </SelectTrigger>
              <SelectContent>
                {managerCandidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {displayName(m)}{m.position ? ` — ${m.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assignmentScopeValue} onValueChange={setAssignmentScopeValue}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر نطاق الإشراف" : "Select supervision scope"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEPARTMENT_SCOPE_VALUE}>{isAr ? "كامل القسم" : "Whole department"}</SelectItem>
                {units.filter((u) => u.is_active).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{isAr ? u.name_ar : u.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-sm text-muted-foreground">
              {isAr
                ? "إذا اخترت كامل القسم، سيقوم المدير بتقييم جميع موظفي القسم. إذا اخترت وحدة، سيقوم بتقييم موظفي تلك الوحدة فقط."
                : "If you choose whole department, the manager evaluates all department employees. If you choose a unit, the manager evaluates only that unit."}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignmentDialogOpen(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={saveManagerAssignment}>{isAr ? "حفظ" : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(v) => setAddOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isAr ? "إضافة موظف للقسم" : "Add employee to department"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder={isAr ? "ابحث عن موظف..." : "Search employees..."} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => searchAddEmployees(addSearch)} disabled={addLoading}>
                {isAr ? "بحث" : "Search"}
              </Button>
              <Button variant="outline" onClick={() => { setAddSearch(""); setAddResults([]); }}>
                {isAr ? "مسح" : "Clear"}
              </Button>
              <Button className="ml-auto" disabled={addSelectedIds.length === 0} onClick={addSelectedEmployees}>
                {isAr ? `إضافة المحدد (${addSelectedIds.length})` : `Add selected (${addSelectedIds.length})`}
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[48px]">
                      <div className="flex items-center justify-center">
                        <Checkbox checked={addAllSelected} onCheckedChange={toggleAddAll} />
                      </div>
                    </TableHead>
                    <TableHead>{isAr ? "المستخدم" : "User"}</TableHead>
                    <TableHead>{isAr ? "القسم الحالي" : "Current dept"}</TableHead>
                    <TableHead className="text-right">{isAr ? "إضافة" : "Add"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {addResults.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          <Checkbox checked={addSelectedIds.includes(r.id)} onCheckedChange={() => toggleAddOne(r.id)} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{displayName(r)}</div>
                        <div className="text-xs text-muted-foreground">{r.email || r.staff_id || r.id}</div>
                      </TableCell>
                      <TableCell>
                        {r.department_id
                          ? (departments.find((d) => d.id === r.department_id)
                              ? (isAr
                                  ? departments.find((d) => d.id === r.department_id)?.name_ar
                                  : departments.find((d) => d.id === r.department_id)?.name_en)
                              : r.department_id)
                          : (isAr ? "بدون" : "None")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" onClick={() => addEmployeeToDept(r.id)}>{isAr ? "إضافة" : "Add"}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {addResults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        {isAr ? "ابحث لعرض النتائج" : "Search to see results"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
