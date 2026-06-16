import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DebouncedInput from "@/components/common/DebouncedInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPlus, Upload, Edit, Loader2, Download, Trash2, FileDown, FileSpreadsheet, Users, Building2, Search, X, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { AppRole, Department, UserProfile } from "./userManagement.types";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export interface UserManagementViewProps {
  language: string;

  // Custom RBAC roles available in the system (custom_roles)
  availableRoles: Array<{ role_key: string; name_en: string; name_ar: string }>;

  users: UserProfile[];
  filteredUsers: UserProfile[];
  departments: Department[];

  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  resetForm: () => void;

  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;

  editingUser: UserProfile | null;
  openEditDialog: (user: UserProfile) => void;
  openDeleteDialog: (user: UserProfile) => void;
  saving: boolean;
  deleting: boolean;
  userToDelete: UserProfile | null;

  handleSaveUser: () => Promise<void> | void;
  handleDeleteUser: () => Promise<void> | void;
  handleRestoreUser: (user: UserProfile) => Promise<void> | void;

  downloadExcelTemplate: () => void;
  exportUsersCsv: () => Promise<void> | void;
  exportingCsv: boolean;
  exportUsersExcel: () => Promise<void> | void;
  exportingExcel: boolean;

  // Bulk actions (Step 3)
  selectedUserIds: string[];
  toggleSelectUser: (userId: string, checked: boolean) => void;
  toggleSelectAllFiltered: (checked: boolean) => void;
  clearSelection: () => void;
  bulkDepartmentId: string;
  setBulkDepartmentId: (v: string) => void;
  bulkWorking: boolean;
  bulkSetActive: (active: boolean) => Promise<void> | void;
  bulkChangeDepartment: () => Promise<void> | void;
  handleExcelUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void> | void;

  updateExistingOnUpload: boolean;
  setUpdateExistingOnUpload: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;

  email: string;
  setEmail: (v: string) => void;

  password: string;
  setPassword: (v: string) => void;

  nameEn: string;
  setNameEn: (v: string) => void;

  nameAr: string;
  setNameAr: (v: string) => void;

  departmentId: string;
  setDepartmentId: (v: string) => void;

  phone: string;
  setPhone: (v: string) => void;

  staffId: string;
  setStaffId: (v: string) => void;

  isActive: boolean;
  setIsActive: (v: boolean) => void;

  role: AppRole;
  setRole: (v: AppRole) => void;

  position: "Manager" | "Employee" | "";
  setPosition: (v: "Manager" | "Employee" | "") => void;

  canAssignAdminRole: boolean;
  canResetPassword: boolean;
  getRoleBadgeVariant: (role: AppRole | "user") => BadgeVariant;

  filterRole: string;
  setFilterRole: (v: string) => void;

  filterDepartment: string;
  setFilterDepartment: (v: string) => void;

  filterPosition: string;
  setFilterPosition: (v: string) => void;

  showArchived: boolean;
  setShowArchived: (v: boolean) => void;

  searchQuery: string;
  setSearchQuery: (v: string) => void;

  clearFilters: () => void;
}

const UserManagementView: React.FC<UserManagementViewProps> = (props) => {

  const {
    language,
    availableRoles,
    users,
    filteredUsers,
    departments,
    dialogOpen,
    setDialogOpen,
    resetForm,
    deleteDialogOpen,
    setDeleteDialogOpen,
    editingUser,
    openEditDialog,
    openDeleteDialog,
    saving,
    deleting,
    userToDelete,
    handleSaveUser,
    handleDeleteUser,
    handleRestoreUser,
    downloadExcelTemplate,
    exportUsersCsv,
    exportingCsv,
    exportUsersExcel,
    exportingExcel,

    selectedUserIds,
    toggleSelectUser,
    toggleSelectAllFiltered,
    clearSelection,
    bulkDepartmentId,
    setBulkDepartmentId,
    bulkWorking,
    bulkSetActive,
    bulkChangeDepartment,
    handleExcelUpload,
    updateExistingOnUpload,
    setUpdateExistingOnUpload,
    fileInputRef,
    email,
    setEmail,
    password,
    setPassword,
    nameEn,
    setNameEn,
    nameAr,
    setNameAr,
    departmentId,
    setDepartmentId,
    phone,
    setPhone,
    staffId,
    setStaffId,
    isActive,
    setIsActive,
    role,
    setRole,
    position,
    setPosition,
    canAssignAdminRole,
    canResetPassword,
    getRoleBadgeVariant,
    filterRole,
    setFilterRole,
    filterDepartment,
    setFilterDepartment,
    filterPosition,
    setFilterPosition,
    showArchived,
    setShowArchived,
    searchQuery,
    setSearchQuery,
    clearFilters,
  } = props;

  const roleLabel = (roleKey?: string) => {
    const key = roleKey || 'user';
    const r = availableRoles?.find(x => x.role_key === key);
    if (!r) return key;
    return language === 'ar' ? `${r.name_ar} / ${r.name_en}` : `${r.name_en} / ${r.name_ar}`;
  };

  const [tableCols, setTableCols] = useState({
    email: true,
    phone: true,
    staffId: true,
    status: true,
    position: true,
    department: true,
    role: true,
  });

  // Derived UI state: used to show the clear-filters button and filtered count.
  // Intentionally computed here so the View stays self-sufficient and doesn't rely on container locals.
  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterDepartment !== "all" ||
    filterRole !== "all" ||
    filterPosition !== "all";

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.id));
  const someFilteredSelected = filteredUsers.some(u => selectedUserIds.includes(u.id));
  const headerCheckboxState: boolean | 'indeterminate' = allFilteredSelected ? true : (someFilteredSelected ? 'indeterminate' : false);

  return (
<>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              {language === 'ar' ? 'إدارة المستخدمين' : 'User Management'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'إضافة وتعديل الموظفين' : 'Add and edit employees'}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              ref={fileInputRef}
              onChange={handleExcelUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={downloadExcelTemplate}
              disabled={saving}
            >
              <Download className="h-4 w-4 mr-2" />
              {language === 'ar' ? 'تحميل القالب' : 'Template'}
            </Button>

            <Button
              onClick={exportUsersExcel}
              disabled={exportingExcel}
              data-testid="users-export-excel-btn"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              {exportingExcel ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {language === 'ar' ? 'تصدير Excel' : 'Export Excel'}
            </Button>

            <Button
              variant="outline"
              onClick={exportUsersCsv}
              disabled={exportingCsv}
              data-testid="users-export-csv-btn"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {exportingCsv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
            </Button>

            <div className="flex items-center gap-2">
              <Checkbox
                id="updateExisting"
                checked={updateExistingOnUpload}
                onCheckedChange={(checked) => setUpdateExistingOnUpload(checked === true)}
              />
              <Label htmlFor="updateExisting" className="text-sm cursor-pointer">
                {language === 'ar' ? 'تحديث الموجودين' : 'Update existing'}
              </Label>
            </div>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload className="h-4 w-4 mr-2" />
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (language === 'ar' ? 'رفع ملف (Excel/CSV)' : 'Upload file (Excel/CSV)')}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button data-testid="users-add-btn">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {language === 'ar' ? 'إضافة مستخدم' : 'Add User'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingUser
                      ? (language === 'ar' ? 'تعديل المستخدم' : 'Edit User')
                      : (language === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User')}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {!editingUser && (
                    <div className="space-y-2">
                      <Label>Email / البريد الإلكتروني</Label>
                      <Input
                        data-testid="users-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@company.com"
                      />
                    </div>
                  )}

                  {(!editingUser || canResetPassword) && (
                    <div className="space-y-2">
                      <Label>
                        {!editingUser
                          ? 'Password / كلمة المرور'
                          : (language === 'ar' ? 'كلمة مرور جديدة (اختياري)' : 'New password (optional)')}
                      </Label>
                      <Input
                        data-testid="users-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      {editingUser && canResetPassword && (
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar'
                            ? 'لأسباب أمنية لا يمكن عرض كلمة المرور الحالية. يمكنك فقط تعيين كلمة مرور جديدة.'
                            : 'For security, the current password cannot be viewed. You can only set a new one.'}
                        </p>
                      )}
                    </div>
                  )}
<div className="space-y-2">
                    <Label>Name (English)</Label>
                    <Input
                      data-testid="users-name-en"
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الاسم (عربي)</Label>
                    <Input
                      data-testid="users-name-ar"
                      value={nameAr}
                      onChange={(e) => setNameAr(e.target.value)}
                      placeholder="جون دو"
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'الهاتف' : 'Phone'}</Label>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+966501234567"
                    />
                  </div>

<div className="space-y-2">
  <Label>{language === 'ar' ? 'رقم الموظف' : 'Staff ID'}</Label>
  <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="EMP-0001" />
</div>

<div className="flex items-center justify-between rounded-md border border-border p-3">
  <div>
    <p className="text-sm font-medium">{language === 'ar' ? 'حالة الحساب' : 'Account status'}</p>
    <p className="text-xs text-muted-foreground">
      {language === 'ar'
        ? 'عطّل الحساب إذا غادر الموظف الشركة.'
        : 'Disable the account if the employee left the company.'}
    </p>
  </div>
  <div className="flex items-center gap-2">
    <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(Boolean(v))} />
    <span className="text-sm">{isActive ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'غير نشط' : 'Inactive')}</span>
  </div>
</div>

                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'المنصب' : 'Position'}</Label>
                    <Select value={position} onValueChange={(v) => setPosition(v as "Manager" | "Employee" | "")}>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'ar' ? 'اختر المنصب' : 'Select position'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manager">{language === 'ar' ? 'مدير' : 'Manager'}</SelectItem>
                        <SelectItem value="Employee">{language === 'ar' ? 'موظف' : 'Employee'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'القسم' : 'Department'}</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Select department'} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {language === 'ar' ? dept.name_ar : dept.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'الدور' : 'Role'}</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles && availableRoles.length > 0 ? (
                          availableRoles
                            .filter(r => canAssignAdminRole || r.role_key !== 'admin')
                            .map(r => (
                              <SelectItem key={r.role_key} value={r.role_key}>
                                {language === 'ar' ? `${r.name_ar} / ${r.name_en}` : `${r.name_en} / ${r.name_ar}`}
                              </SelectItem>
                            ))
                        ) : (
                          // Fallback if custom_roles table is empty/unavailable
                          <>
                            <SelectItem value="user">User / مستخدم</SelectItem>
                            <SelectItem value="super_user">Super User / مستخدم متميز</SelectItem>
                            <SelectItem value="audit">Auditor / مدقق</SelectItem>
                            {canAssignAdminRole && <SelectItem value="admin">Admin / مدير</SelectItem>}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleSaveUser}
                    data-testid="users-save-btn" className="w-full" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {language === 'ar' ? 'حفظ' : 'Save'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {language === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {language === 'ar' ? 'الأقسام' : 'Departments'}
              </CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{departments.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {language === 'ar' ? 'المدراء' : 'Managers'}
              </CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.position === 'Manager').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'قائمة المستخدمين' : 'Users List'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <DebouncedInput
                  placeholder={language === 'ar' ? 'بحث بالاسم، البريد، أو الهاتف...' : 'Search by name, email, or phone...'}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  className="pl-10"
                />
              </div>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder={language === 'ar' ? 'القسم' : 'Department'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'كل الأقسام' : 'All Departments'}</SelectItem>
                  <SelectItem value="none">{language === 'ar' ? 'بدون قسم' : 'No Department'}</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {language === 'ar' ? dept.name_ar : dept.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder={language === 'ar' ? 'الدور' : 'Role'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'كل الأدوار' : 'All Roles'}</SelectItem>
                  {availableRoles && availableRoles.length > 0 ? (
                    availableRoles
                      .filter(r => canAssignAdminRole || r.role_key !== 'admin')
                      .map(r => (
                        <SelectItem key={r.role_key} value={r.role_key}>
                          {language === 'ar' ? r.name_ar : r.name_en}
                        </SelectItem>
                      ))
                  ) : (
                    <>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_user">Super User</SelectItem>
                      <SelectItem value="audit">Auditor</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <Select value={filterPosition} onValueChange={setFilterPosition}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder={language === 'ar' ? 'المنصب' : 'Position'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'كل المناصب' : 'All Positions'}</SelectItem>
                  <SelectItem value="none">{language === 'ar' ? 'بدون منصب' : 'No Position'}</SelectItem>
                  <SelectItem value="Manager">{language === 'ar' ? 'مدير' : 'Manager'}</SelectItem>
                  <SelectItem value="Employee">{language === 'ar' ? 'موظف' : 'Employee'}</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={(v) => setShowArchived(Boolean(v))}
                />
                <Label htmlFor="show-archived" className="cursor-pointer">
                  {language === 'ar' ? 'عرض المؤرشف' : 'Show archived'}
                </Label>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {hasActiveFilters && (
              <div className="text-sm text-muted-foreground">
                {language === 'ar' 
                  ? `عرض ${filteredUsers.length} من ${users.length} مستخدم`
                  : `Showing ${filteredUsers.length} of ${users.length} users`}
              </div>
            )}

            {selectedUserIds.length > 0 && (
              <div
                className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-md border bg-muted/30"
                data-testid="users-bulk-bar"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {language === 'ar'
                      ? `${selectedUserIds.length} محدد`
                      : `${selectedUserIds.length} selected`}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetActive(true)}
                    disabled={bulkWorking}
                  >
                    {bulkWorking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {language === 'ar' ? 'تفعيل' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetActive(false)}
                    disabled={bulkWorking}
                  >
                    {bulkWorking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {language === 'ar' ? 'تعطيل' : 'Deactivate'}
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Select value={bulkDepartmentId} onValueChange={setBulkDepartmentId}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder={language === 'ar' ? 'تغيير القسم' : 'Change department'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{language === 'ar' ? 'بدون قسم' : 'No Department'}</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {language === 'ar' ? d.name_ar : d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    onClick={bulkChangeDepartment}
                    disabled={bulkWorking || !bulkDepartmentId}
                  >
                    {bulkWorking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {language === 'ar' ? 'تطبيق' : 'Apply'}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                    disabled={bulkWorking}
                  >
                    {language === 'ar' ? 'إلغاء التحديد' : 'Clear'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end mb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    {language === 'ar' ? 'الأعمدة' : 'Columns'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={language === 'ar' ? 'start' : 'end'} className="w-56">
                  <DropdownMenuLabel>{language === 'ar' ? 'إظهار/إخفاء' : 'Show/Hide'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={tableCols.email} onCheckedChange={(v) => setTableCols((p) => ({ ...p, email: Boolean(v) }))}>
                    {language === 'ar' ? 'البريد' : 'Email'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.phone} onCheckedChange={(v) => setTableCols((p) => ({ ...p, phone: Boolean(v) }))}>
                    {language === 'ar' ? 'الهاتف' : 'Phone'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.staffId} onCheckedChange={(v) => setTableCols((p) => ({ ...p, staffId: Boolean(v) }))}>
                    {language === 'ar' ? 'رقم الموظف' : 'Staff ID'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.status} onCheckedChange={(v) => setTableCols((p) => ({ ...p, status: Boolean(v) }))}>
                    {language === 'ar' ? 'الحالة' : 'Status'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.position} onCheckedChange={(v) => setTableCols((p) => ({ ...p, position: Boolean(v) }))}>
                    {language === 'ar' ? 'المنصب' : 'Position'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.department} onCheckedChange={(v) => setTableCols((p) => ({ ...p, department: Boolean(v) }))}>
                    {language === 'ar' ? 'القسم' : 'Department'}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={tableCols.role} onCheckedChange={(v) => setTableCols((p) => ({ ...p, role: Boolean(v) }))}>
                    {language === 'ar' ? 'الدور' : 'Role'}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={headerCheckboxState}
                      onCheckedChange={(v) => toggleSelectAllFiltered(v === true)}
                      aria-label={language === 'ar' ? 'تحديد الكل' : 'Select all'}
                    />
                  </TableHead>
                  <TableHead>{language === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                  {tableCols.email ? <TableHead>{language === 'ar' ? 'البريد' : 'Email'}</TableHead> : null}
                  {tableCols.phone ? <TableHead>{language === 'ar' ? 'الهاتف' : 'Phone'}</TableHead> : null}
                  {tableCols.staffId ? <TableHead>{language === 'ar' ? 'رقم الموظف' : 'Staff ID'}</TableHead> : null}
                  {tableCols.status ? <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead> : null}
                  {tableCols.position ? <TableHead>{language === 'ar' ? 'المنصب' : 'Position'}</TableHead> : null}
                  {tableCols.department ? <TableHead>{language === 'ar' ? 'القسم' : 'Department'}</TableHead> : null}
                  {tableCols.role ? <TableHead>{language === 'ar' ? 'الدور' : 'Role'}</TableHead> : null}
                  <TableHead className="text-right">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUserIds.includes(user.id)}
                        onCheckedChange={(v) => toggleSelectUser(user.id, v === true)}
                        aria-label={language === 'ar' ? 'تحديد المستخدم' : 'Select user'}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        {language === 'ar' ? user.name_ar : user.name_en}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {language === 'ar' ? user.name_en : user.name_ar}
                      </div>
                    </TableCell>
                    {tableCols.email ? <TableCell>{user.email}</TableCell> : null}
                    {tableCols.phone ? <TableCell>{user.phone || '-'}</TableCell> : null}
                    {tableCols.staffId ? <TableCell>{user.staff_id || '-'}</TableCell> : null}
                  {tableCols.status ? <TableCell>
                    {user.deleted_at ? (
                      <Badge variant="outline">{language === 'ar' ? 'مؤرشف' : 'Archived'}</Badge>
                    ) : (
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? (language === 'ar' ? 'نشط' : 'Active') : (language === 'ar' ? 'غير نشط' : 'Inactive')}
                      </Badge>
                    )}
                  </TableCell> : null}
                    {tableCols.position ? <TableCell>
                      {user.position ? (
                        <Badge variant="outline">
                          {user.position === 'Manager' 
                            ? (language === 'ar' ? 'مدير' : 'Manager')
                            : (language === 'ar' ? 'موظف' : 'Employee')}
                        </Badge>
                      ) : '-'}
                    </TableCell> : null}
                    {tableCols.department ? <TableCell>
                      {user.department
                        ? (language === 'ar' ? user.department.name_ar : user.department.name_en)
                        : '-'}
                    </TableCell> : null}
                    {tableCols.role ? <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role || 'user')}>
                        {roleLabel(user.role)}
                      </Badge>
                    </TableCell> : null}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {user.deleted_at ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRestoreUser(user)}
                            title={language === 'ar' ? 'استعادة' : 'Restore'}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            data-testid="users-row-delete"
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(user)}
                            className="text-destructive hover:text-destructive"
                            title={language === 'ar' ? 'أرشفة' : 'Archive'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={
                      2 +
                      (tableCols.email ? 1 : 0) +
                      (tableCols.phone ? 1 : 0) +
                      (tableCols.staffId ? 1 : 0) +
                      (tableCols.status ? 1 : 0) +
                      (tableCols.position ? 1 : 0) +
                      (tableCols.department ? 1 : 0) +
                      (tableCols.role ? 1 : 0) +
                      1
                    } className="text-center py-8 text-muted-foreground">
                      {language === 'ar' ? 'لا يوجد مستخدمين' : 'No users found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ar' ? 'تأكيد الأرشفة' : 'Confirm Archiving'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar' 
                ? `هل أنت متأكد من أرشفة المستخدم "${userToDelete?.name_ar || userToDelete?.name_en}"؟ يمكن استعادة المستخدم لاحقًا.`
                : `Are you sure you want to archive user "${userToDelete?.name_en || userToDelete?.name_ar}"? You can restore the user later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </AlertDialogCancel>
            <Button
              data-testid="confirm-delete-btn"
              onClick={handleDeleteUser}
              disabled={deleting}
              variant="destructive"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {language === 'ar' ? 'أرشفة' : 'Archive'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserManagementView;
