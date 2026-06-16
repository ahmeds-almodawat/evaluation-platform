import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

import { PERMISSIONS_CATALOG, PERMISSION_MODULES_ORDER, type PermissionKey } from "@/lib/permissionsCatalog";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

type CustomRoleRow = {
  role_key: string;
  name_en: string;
  name_ar: string;
  description: string | null;
  created_at?: string;
};

type RolePermRow = {
  role_key: string;
  permission: string;
};

function slugifyRoleKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 48);
}

export default function RolesPermissionsPage() {
  const { language } = useLanguage();
  const isAr = language === "ar";

  const { role, isRoleSimulating, simulatedRoleKey, startRoleSimulation, stopRoleSimulation } = useSupabaseAuth();

  const canSimulate = role === "admin";

  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<CustomRoleRow[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [rolePerms, setRolePerms] = useState<Record<string, Set<string>>>({});

  // Role simulator selection (admin-only)
  const [simSelectKey, setSimSelectKey] = useState<string>("");

  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [formNameEn, setFormNameEn] = useState("");
  const [formNameAr, setFormNameAr] = useState("");
  const [formRoleKey, setFormRoleKey] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPerms, setFormPerms] = useState<Set<string>>(new Set());

  const [simPick, setSimPick] = useState<string>("");

  const modules = useMemo(() => {
    const grouped = new Map<string, typeof PERMISSIONS_CATALOG>();
    for (const m of PERMISSION_MODULES_ORDER) grouped.set(m.id, []);
    for (const item of PERMISSIONS_CATALOG) {
      if (!grouped.has(item.module)) grouped.set(item.module, []);
      grouped.get(item.module)!.push(item);
    }
    return grouped;
  }, []);

  const selectedRole = useMemo(
    () => roles.find((r) => r.role_key === selectedRoleKey) || null,
    [roles, selectedRoleKey]
  );

  const selectedRolePermSet = useMemo(() => {
    if (!selectedRoleKey) return new Set<string>();
    return rolePerms[selectedRoleKey] ?? new Set<string>();
  }, [rolePerms, selectedRoleKey]);

  async function refreshAll() {
    setLoading(true);
    try {
      const { data: rolesData, error: rolesErr } = await supabase
        .from("custom_roles")
        .select("role_key,name_en,name_ar,description,created_at")
        .order("created_at", { ascending: false });

      if (rolesErr) throw rolesErr;

      const { data: permsData, error: permsErr } = await supabase
        .from("custom_role_permissions")
        .select("role_key,permission");

      if (permsErr) throw permsErr;

      const permsMap: Record<string, Set<string>> = {};
      for (const row of (permsData || []) as RolePermRow[]) {
        if (!permsMap[row.role_key]) permsMap[row.role_key] = new Set<string>();
        permsMap[row.role_key].add(row.permission);
      }

      setRoles((rolesData || []) as CustomRoleRow[]);
      setRolePerms(permsMap);

      const first = (rolesData || [])[0] as CustomRoleRow | undefined;
      if (!selectedRoleKey && first?.role_key) setSelectedRoleKey(first.role_key);
    } catch (e: any) {
      console.error(e);
      toast({
        title: isAr ? "خطأ" : "Error",
        description: isAr ? "فشل تحميل الأدوار" : "Failed to load roles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep simulator select in sync with loaded roles
  useEffect(() => {
    if (!canSimulate) return;
    if (simSelectKey) return;
    if (simulatedRoleKey) {
      setSimSelectKey(simulatedRoleKey);
      return;
    }
    if (roles.length > 0) setSimSelectKey(roles[0].role_key);
  }, [roles, canSimulate, simSelectKey, simulatedRoleKey]);

  function startCreate() {
    setMode("create");
    setFormNameEn("");
    setFormNameAr("");
    setFormRoleKey("");
    setFormDesc("");
    setFormPerms(new Set<string>());
  }

  function startEdit() {
    if (!selectedRole) return;
    setMode("edit");
    setFormNameEn(selectedRole.name_en);
    setFormNameAr(selectedRole.name_ar);
    setFormRoleKey(selectedRole.role_key);
    setFormDesc(selectedRole.description ?? "");
    setFormPerms(new Set<string>(Array.from(selectedRolePermSet)));
  }

  function cancelEdit() {
    setMode("view");
    setFormPerms(new Set<string>());
  }

  function togglePerm(key: string) {
    setFormPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveRole() {
    const name_en = formNameEn.trim();
    const name_ar = formNameAr.trim();
    const desc = formDesc.trim() || null;

    if (!name_en || !name_ar) {
      toast({
        title: isAr ? "مطلوب" : "Required",
        description: isAr ? "يرجى إدخال اسم الدور بالعربية والإنجليزية" : "Please enter role name in English and Arabic",
        variant: "destructive",
      });
      return;
    }

    let role_key = formRoleKey.trim();
    if (!role_key) role_key = slugifyRoleKey(name_en);
    role_key = slugifyRoleKey(role_key);

    if (!role_key) {
      toast({
        title: isAr ? "مطلوب" : "Required",
        description: isAr ? "يرجى إدخال مفتاح الدور" : "Please provide a role key",
        variant: "destructive",
      });
      return;
    }

    const allowedKeys = new Set(PERMISSIONS_CATALOG.map((p) => p.key));
    const permsToSave = Array.from(formPerms).filter((p) => allowedKeys.has(p as PermissionKey));

    try {
      const { error: upsertErr } = await supabase
        .from("custom_roles")
        .upsert([{ role_key, name_en, name_ar, description: desc }], { onConflict: "role_key" });

      if (upsertErr) throw upsertErr;

      const { error: delErr } = await supabase
        .from("custom_role_permissions")
        .delete()
        .eq("role_key", role_key);

      if (delErr) throw delErr;

      if (permsToSave.length > 0) {
        const payload = permsToSave.map((p) => ({ role_key, permission: p }));
        const { error: insErr } = await supabase
          .from("custom_role_permissions")
          .insert(payload);
        if (insErr) throw insErr;
      }

      toast({
        title: isAr ? "تم الحفظ" : "Saved",
        description: isAr ? "تم حفظ الدور وصلاحياته" : "Role and permissions saved",
      });

      setMode("view");
      setSelectedRoleKey(role_key);
      await refreshAll();
    } catch (e: any) {
      console.error(e);
      toast({
        title: isAr ? "فشل الحفظ" : "Save failed",
        description: e?.message || (isAr ? "حدث خطأ غير متوقع" : "Unexpected error"),
        variant: "destructive",
      });
    }
  }

  async function deleteSelectedRole() {
    if (!selectedRole) return;
    const ok = window.confirm(
      isAr
        ? `هل أنت متأكد من حذف الدور؟\n${selectedRole.name_ar}`
        : `Are you sure you want to delete this role?\n${selectedRole.name_en}`
    );
    if (!ok) return;

    try {
      const { error: delErr } = await supabase
        .from("custom_roles")
        .delete()
        .eq("role_key", selectedRole.role_key);
      if (delErr) throw delErr;

      toast({
        title: isAr ? "تم الحذف" : "Deleted",
        description: isAr ? "تم حذف الدور" : "Role deleted",
      });

      setSelectedRoleKey(null);
      await refreshAll();
    } catch (e: any) {
      console.error(e);
      toast({
        title: isAr ? "فشل الحذف" : "Delete failed",
        description: e?.message || (isAr ? "قد يكون الدور مستخدمًا من قبل مستخدمين" : "The role may be assigned to users"),
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isAr ? "الأدوار والصلاحيات" : "Roles & Permissions"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr ? "أنشئ أدوارًا مخصصة وحدد الصلاحيات لكل دور." : "Create custom roles and assign permissions per role."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={startCreate} disabled={loading}>{isAr ? "إنشاء دور" : "Create Role"}</Button>
          <Button variant="outline" onClick={refreshAll} disabled={loading}>{isAr ? "تحديث" : "Refresh"}</Button>
        </div>
      </div>

      {canSimulate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{isAr ? "محاكي الصلاحيات" : "Role Simulator"}</span>
              {isRoleSimulating && <Badge variant="secondary">{isAr ? "مُفعّل" : "Active"}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "يسمح لك هذا بمحاكاة صلاحيات أي دور مخصص بدون تغيير أدوار قاعدة البيانات. مفيد لاختبار القوائم والصفحات."
                : "Simulate any custom role’s permissions without changing database roles. Useful for testing menus and pages."}
            </p>

            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="w-full md:max-w-sm">
                <Select value={simSelectKey} onValueChange={setSimSelectKey}>
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "اختر دوراً" : "Select a role"} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.role_key} value={r.role_key}>
                        {isAr ? r.name_ar : r.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => void startRoleSimulation(simSelectKey)}
                  disabled={loading || roles.length === 0 || !simSelectKey}
                >
                  {isAr ? "بدء المحاكاة" : "Start Simulation"}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void stopRoleSimulation()}
                  disabled={!isRoleSimulating}
                >
                  {isAr ? "إيقاف" : "Stop"}
                </Button>
              </div>
            </div>

            <Separator />
            <div className="text-xs text-muted-foreground">
              {isAr
                ? "ملاحظة: بعض الصفحات تستخدم فحوصات قديمة مثل role === 'admin'. سنحولها تدريجياً لاستخدام الصلاحيات فقط."
                : "Note: some pages still use legacy checks like role === 'admin'. We’ll progressively move them to permission-only checks."}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{isAr ? "الأدوار" : "Roles"}</span>
              <Badge variant="secondary">{roles.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">{isAr ? "جاري التحميل..." : "Loading..."}</div>
            ) : roles.length === 0 ? (
              <div className="text-sm text-muted-foreground">{isAr ? "لا يوجد أدوار مخصصة بعد." : "No custom roles yet."}</div>
            ) : (
              <div className="space-y-2">
                {roles.map((r) => {
                  const active = r.role_key === selectedRoleKey;
                  const title = isAr ? r.name_ar : r.name_en;
                  return (
                    <button
                      key={r.role_key}
                      className={[
                        "w-full text-left rounded-lg border px-3 py-2 transition",
                        active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedRoleKey(r.role_key);
                        setMode("view");
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{title}</div>
                        <span className="text-xs text-muted-foreground">{r.role_key}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(rolePerms[r.role_key]?.size ?? 0)} {isAr ? "صلاحية" : "permissions"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader>
            <CardTitle>
              {mode === "create"
                ? (isAr ? "إنشاء دور" : "Create Role")
                : mode === "edit"
                ? (isAr ? "تعديل الدور" : "Edit Role")
                : (isAr ? "تفاصيل الدور" : "Role Details")}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {!selectedRole && mode === "view" ? (
              <div className="text-sm text-muted-foreground">
                {isAr ? "اختر دورًا من القائمة أو أنشئ دورًا جديدًا." : "Select a role from the list or create a new one."}
              </div>
            ) : (
              <>
                {(mode === "create" || mode === "edit") && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{isAr ? "اسم الدور (EN)" : "Role name (EN)"}</div>
                      <Input value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} placeholder="HR Manager" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{isAr ? "اسم الدور (AR)" : "Role name (AR)"}</div>
                      <Input value={formNameAr} onChange={(e) => setFormNameAr(e.target.value)} placeholder="مدير الموارد البشرية" />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <div className="text-sm font-medium">{isAr ? "مفتاح الدور (اختياري)" : "Role key (optional)"}</div>
                      <Input
                        value={formRoleKey}
                        onChange={(e) => setFormRoleKey(e.target.value)}
                        placeholder={isAr ? "يُنشأ تلقائيًا من الاسم الإنجليزي" : "Auto-generated from English name"}
                        disabled={mode === "edit"}
                      />
                      <div className="text-xs text-muted-foreground">
                        {isAr ? "يُستخدم في قاعدة البيانات. يفضّل تركه فارغًا." : "Used in the database. Leave empty to auto-generate."}
                      </div>
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <div className="text-sm font-medium">{isAr ? "وصف (اختياري)" : "Description (optional)"}</div>
                      <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} />
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{isAr ? "الصلاحيات" : "Permissions"}</div>
                    {mode === "view" ? (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={startEdit} disabled={!selectedRole}>{isAr ? "تعديل" : "Edit"}</Button>
                        <Button variant="destructive" onClick={deleteSelectedRole} disabled={!selectedRole}>{isAr ? "حذف" : "Delete"}</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button onClick={saveRole}>{isAr ? "حفظ" : "Save"}</Button>
                        <Button variant="outline" onClick={cancelEdit}>{isAr ? "إلغاء" : "Cancel"}</Button>
                      </div>
                    )}
                  </div>

                  {mode === "view" && selectedRole && (
                    <div className="text-sm text-muted-foreground">{selectedRole.description || "—"}</div>
                  )}

                  <div className="space-y-5">
                    {PERMISSION_MODULES_ORDER.map((m) => {
                      const items = modules.get(m.id) || [];
                      if (items.length === 0) return null;
                      const title = isAr ? m.title_ar : m.title_en;
                      const currentSet = mode === "view" ? selectedRolePermSet : formPerms;

                      return (
                        <div key={m.id} className="rounded-xl border p-4">
                          <div className="font-semibold">{title}</div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {items.map((p) => {
                              const checked = currentSet.has(p.key);
                              const label = isAr ? p.label_ar : p.label_en;
                              return (
                                <label key={p.key} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                                  <Checkbox
                                    checked={checked}
                                    disabled={mode === "view"}
                                    onCheckedChange={() => togglePerm(p.key)}
                                  />
                                  <div className="leading-tight">
                                    <div className="text-sm">{label}</div>
                                    <div className="text-xs text-muted-foreground">{p.key}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
