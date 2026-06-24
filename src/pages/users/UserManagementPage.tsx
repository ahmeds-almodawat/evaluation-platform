import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import UserManagementView from './UserManagementView';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { Loader2 } from 'lucide-react';
import { logAudit } from '@/lib/audit';

// In the UI we use the custom RBAC role key (custom_roles.role_key) as the "role".
// Legacy roles (user_roles.role) are still maintained server-side for backward compatibility.
type AppRole = string;
type Position = 'Manager' | 'Employee';

type CoreLegacyRole = 'admin' | 'audit' | 'super_user' | 'user';

type CustomRole = {
  role_key: string;
  name_en: string;
  name_ar: string;
  legacy_role?: CoreLegacyRole | null;
};

const CORE_ROLE_OPTIONS: CustomRole[] = [
  { role_key: 'user', name_en: 'User', name_ar: 'مستخدم', legacy_role: 'user' },
  { role_key: 'audit', name_en: 'Audit', name_ar: 'مدقق', legacy_role: 'audit' },
  { role_key: 'super_user', name_en: 'Super User', name_ar: 'مستخدم متميز', legacy_role: 'super_user' },
  { role_key: 'admin', name_en: 'Admin', name_ar: 'مدير النظام', legacy_role: 'admin' },
];

const mergeCoreRoles = (roles: CustomRole[]): CustomRole[] => {
  const merged = new Map<string, CustomRole>();

  // Always keep the four core roles available in the UI.
  // Super users may not be allowed by RLS to read every row in custom_roles,
  // but they still must be able to assign user/audit/super_user.
  for (const r of CORE_ROLE_OPTIONS) merged.set(r.role_key, r);

  for (const r of roles || []) {
    const key = String(r.role_key || '').trim();
    if (!key) continue;
    const legacy = r.legacy_role || (CORE_ROLE_OPTIONS.find((c) => c.role_key === key)?.legacy_role ?? 'user');
    merged.set(key, { ...r, role_key: key, legacy_role: legacy });
  }

  return Array.from(merged.values());
};

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

interface UserProfile {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  department_id: string | null;
  avatar_url: string | null;
  phone: string | null;
  staff_id: string | null;
  is_active: boolean;
  position: string | null;
  department?: Department;
  role?: AppRole;
}

const userSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  nameEn: z.string().trim().min(2, 'English name is required'),
  nameAr: z.string().trim().min(2, 'Arabic name is required'),
  departmentId: z.string().optional(),
  // Custom role key (e.g. "hr", "admin", ...)
  role: z.string().min(1, 'Role is required'),
  phone: z.string().optional(),
  position: z.enum(['Manager', 'Employee']).optional(),
});

const UserManagementPage: React.FC = () => {
  const { language } = useLanguage();
  const { canAddUsers, loading: authLoading, user: currentUser, role: currentUserRole } = useSupabaseAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [availableRoles, setAvailableRoles] = useState<CustomRole[]>(mergeCoreRoles([]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Bulk actions (Step 3)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState<string>('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [updateExistingOnUpload, setUpdateExistingOnUpload] = useState(true); // Toggle for Excel upload

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [role, setRole] = useState<AppRole>('user');
  const [phone, setPhone] = useState('');
  const [staffId, setStaffId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [position, setPosition] = useState<Position | ''>('');

  // Helper: always fetch a fresh access token (prevents "token is not defined" / stale session issues)
  const getAccessToken = async (): Promise<string> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  };

  // Only admins can create/assign the admin role.
  // Super Users can create/update User, Audit and Super User roles only.
  const canAssignAdminRole = currentUserRole === 'admin';
  // Only admins can reset/set a user's password (for security, passwords are never viewable).
  const canResetPassword = currentUserRole === 'admin';

  const getRoleMeta = (roleKey: string): CustomRole | undefined => {
    const wanted = String(roleKey || '').trim().toLowerCase();
    return availableRoles.find((r) => String(r.role_key).trim().toLowerCase() === wanted)
      || CORE_ROLE_OPTIONS.find((r) => r.role_key === wanted);
  };

  const getLegacyTierFromRoleKey = (roleKey: string): CoreLegacyRole => {
    const key = String(roleKey || '').trim().toLowerCase();
    if (key === 'admin' || key === 'audit' || key === 'super_user' || key === 'user') return key as CoreLegacyRole;
    return (getRoleMeta(key)?.legacy_role || 'user') as CoreLegacyRole;
  };

  useEffect(() => {
    if (!authLoading && !canAddUsers) {
      navigate('/');
    }
  }, [authLoading, canAddUsers, navigate]);

  useEffect(() => {
    // Re-fetch when toggling archived visibility
    fetchData();
    // Clear bulk selection when switching views
    setSelectedUserIds([]);
  }, [showArchived]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .order('name_en');
      setDepartments(deptData || []);

      // Fetch available custom roles (for the Role dropdown)
      try {
        const { data: rolesList, error: rolesListErr } = await supabase
          .from('custom_roles')
          .select('role_key,name_en,name_ar,legacy_role')
          .order('created_at', { ascending: false });
        if (!rolesListErr) setAvailableRoles(mergeCoreRoles((rolesList || []) as any));
        else setAvailableRoles(mergeCoreRoles([]));
      } catch {
        setAvailableRoles(mergeCoreRoles([]));
      }

      // Fetch profiles with departments (optionally include archived)
      let profilesQuery = supabase
        .from('profiles')
        .select(`
          *,
          department:departments(*)
        `)
        .order('name_en');

      if (!showArchived) {
        profilesQuery = profilesQuery.eq('is_active', true);
      }

      const { data: profilesData } = await profilesQuery;

      // Fetch legacy roles (user_roles) for all users
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const legacyRolesMap = new Map(rolesData?.map(r => [r.user_id, r.role as AppRole]) || []);

      // Fetch custom role assignment (user_custom_roles) for all users
      let customRolesMap = new Map<string, string>();
      try {
        const { data: userCustomRoleRows } = await supabase
          .from('user_custom_roles')
          .select('user_id,role_key');
        customRolesMap = new Map((userCustomRoleRows || []).map((r: any) => [r.user_id, r.role_key]));
      } catch {
        customRolesMap = new Map();
      }

      const usersWithRoles = (profilesData || []).map((p: any) => ({
        ...p,
        staff_id: p.staff_id || null,
        deleted_at: p.deleted_at ?? null,
        is_active: p.is_active !== false,
        // Prefer custom role key if assigned; otherwise fall back to legacy role.
        role: customRolesMap.get(p.id) || legacyRolesMap.get(p.id) || 'user',
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    }
    setLoading(false);
  };

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === '' || 
      user.name_en.toLowerCase().includes(searchLower) ||
      user.name_ar.includes(searchQuery) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.phone && user.phone.toLowerCase().includes(searchLower)) ||
      (user.staff_id && user.staff_id.toLowerCase().includes(searchLower));

    // Department filter
    const matchesDepartment = filterDepartment === 'all' || 
      (filterDepartment === 'none' && !user.department_id) ||
      user.department_id === filterDepartment;

    // Role filter
    const matchesRole = filterRole === 'all' || user.role === filterRole;

    // Position filter
    const matchesPosition = filterPosition === 'all' || 
      (filterPosition === 'none' && !user.position) ||
      user.position === filterPosition;

    return matchesSearch && matchesDepartment && matchesRole && matchesPosition;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setFilterDepartment('all');
    setFilterRole('all');
    setFilterPosition('all');
  };

  const hasActiveFilters = searchQuery !== '' || filterDepartment !== 'all' || filterRole !== 'all' || filterPosition !== 'all';

  // -----------------------------
  // Step 3: Bulk actions
  // -----------------------------
  const toggleSelectUser = (userId: string, checked: boolean) => {
    setSelectedUserIds(prev => {
      if (checked) return Array.from(new Set([...prev, userId]));
      return prev.filter(id => id !== userId);
    });
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedUserIds([]);
      return;
    }
    setSelectedUserIds(filteredUsers.map(u => u.id));
  };

  const clearSelection = () => {
    setSelectedUserIds([]);
    setBulkDepartmentId('');
  };

  const filterIdsForPermissions = (ids: string[]) => {
    if (canAssignAdminRole) return ids;
    // Non-admins cannot bulk-change admin accounts
    const disallowed = new Set(users.filter(u => u.role === 'admin').map(u => u.id));
    return ids.filter(id => !disallowed.has(id));
  };

  const bulkSetActive = async (active: boolean) => {
    const ids = filterIdsForPermissions(selectedUserIds);
    if (ids.length === 0) {
      toast({
        title: language === 'ar' ? 'تنبيه' : 'Notice',
        description: language === 'ar' ? 'لم يتم تحديد مستخدمين صالحين للتحديث' : 'No eligible users selected',
      });
      return;
    }

    setBulkWorking(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: active })
        .in('id', ids);
      if (error) throw error;

      await logAudit(active ? 'BULK_ACTIVATE_USERS' : 'BULK_DEACTIVATE_USERS', {
        entityType: 'profiles',
        metadata: { ids, count: ids.length },
      });

      toast({
        title: language === 'ar' ? 'تم التحديث' : 'Updated',
        description: language === 'ar' ? 'تم تحديث حالة المستخدمين' : 'User status updated',
      });

      clearSelection();
      fetchData();
    } catch (error: any) {
      console.error('Bulk status update failed:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: error?.message || (language === 'ar' ? 'فشل التحديث' : 'Update failed'),
        variant: 'destructive',
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const bulkChangeDepartment = async () => {
    const ids = filterIdsForPermissions(selectedUserIds);
    if (ids.length === 0) {
      toast({
        title: language === 'ar' ? 'تنبيه' : 'Notice',
        description: language === 'ar' ? 'لم يتم تحديد مستخدمين صالحين للتحديث' : 'No eligible users selected',
      });
      return;
    }

    if (!bulkDepartmentId) {
      toast({
        title: language === 'ar' ? 'تنبيه' : 'Notice',
        description: language === 'ar' ? 'اختر قسمًا أولاً' : 'Select a department first',
      });
      return;
    }

    setBulkWorking(true);
    try {
      const newDept = bulkDepartmentId === 'none' ? null : bulkDepartmentId;
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: newDept })
        .in('id', ids);
      if (error) throw error;

      await logAudit('BULK_CHANGE_DEPARTMENT', {
        entityType: 'profiles',
        metadata: { ids, count: ids.length, department_id: newDept },
      });

      toast({
        title: language === 'ar' ? 'تم التحديث' : 'Updated',
        description: language === 'ar' ? 'تم تحديث قسم المستخدمين' : 'Users department updated',
      });

      clearSelection();
      fetchData();
    } catch (error: any) {
      console.error('Bulk department update failed:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: error?.message || (language === 'ar' ? 'فشل التحديث' : 'Update failed'),
        variant: 'destructive',
      });
    } finally {
      setBulkWorking(false);
    }
  };


  const resetForm = () => {
    setEmail('');
    setPassword('');
    setNameEn('');
    setNameAr('');
    setDepartmentId('');
    setRole('user');
    setPhone('');
    setStaffId('');
    setIsActive(true);
    setPosition('');
    setEditingUser(null);
  };

  const openEditDialog = (user: UserProfile) => {
    // Prevent super_user (or any non-admin) from editing admin users
    if (!canAssignAdminRole && user.role === 'admin') {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'فقط المدير يمكنه تعديل حسابات المديرين' : 'Only admins can edit admin users',
        variant: 'destructive',
      });
      return;
    }

    setEditingUser(user);
    setEmail(user.email);
    setNameEn(user.name_en);
    setNameAr(user.name_ar);
    setDepartmentId(user.department_id || '');
    setRole(user.role || 'user');
    setPhone(user.phone || '');
    setStaffId(user.staff_id || '');
    setIsActive(user.is_active !== false);
    setPosition((user.position as Position) || '');
    setPassword('');
    setDialogOpen(true);
  };

  const openDeleteDialog = (user: UserProfile) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    // Prevent deleting yourself
    if (userToDelete.id === currentUser?.id) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'لا يمكنك حذف حسابك الخاص' : 'You cannot delete your own account',
        variant: 'destructive',
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      return;
    }

    // Prevent non-admins from deleting admin users
    if (!canAssignAdminRole && userToDelete.role === 'admin') {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'فقط المدير يمكنه حذف حسابات المديرين' : 'Only admins can delete admin users',
        variant: 'destructive',
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      return;
    }

    setDeleting(true);
    try {
      // Archive user using edge function (soft delete)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await supabase.functions.invoke('delete-user', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { user_id: userToDelete.id },
    });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to archive user');
      }
      
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: language === 'ar' ? 'تمت الأرشفة' : 'Archived',
        description: language === 'ar' ? 'تم أرشفة المستخدم بنجاح' : 'User archived successfully',
      });

      fetchData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive user',
        variant: 'destructive',
      });
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleRestoreUser = async (user: UserProfile) => {
    if (!user?.id) return;
    try {
      const token = await getAccessToken();

      const { error } = await supabase.functions.invoke('restore-user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: { user_id: user.id },
      });

      if (error) throw error;

      toast({
        title: language === 'ar' ? 'تمت الاستعادة' : 'Restored',
        description:
          language === 'ar' ? 'تم استعادة المستخدم بنجاح.' : 'User restored successfully.',
      });

      fetchData();
    } catch (err) {
      console.error('Error restoring user:', err);
      toast({
        title: 'Error',
        description: language === 'ar' ? 'فشل استعادة المستخدم' : 'Failed to restore user',
        variant: 'destructive',
      });
    }
  };

  const handleSaveUser = async () => {
    // Backend will enforce this too, but keep UX safe:
    // Only admins can create/assign any role mapped to the admin tier.
    const selectedLegacyTier = getLegacyTierFromRoleKey(role);
    if (!canAssignAdminRole && selectedLegacyTier === 'admin') {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'فقط المدير يمكنه إنشاء أو تعيين دور المدير' : 'Only admins can create or assign the admin role',
        variant: 'destructive',
      });
      return;
    }

    if (editingUser && password && !canResetPassword) {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        // Use double-quotes to avoid breaking the string on the apostrophe in "user's".
        description: language === 'ar' ? 'فقط المدير يمكنه تغيير كلمة مرور المستخدم' : "Only admins can change a user's password",
        variant: 'destructive',
      });
      return;
    }

    if (editingUser && !canAssignAdminRole && editingUser.role === 'admin') {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'فقط المدير يمكنه تعديل حسابات المديرين' : 'Only admins can edit admin users',
        variant: 'destructive',
      });
      return;
    }

    const validation = editingUser
      ? userSchema.partial({ password: true, email: true }).safeParse({ nameEn, nameAr, departmentId, role, phone, position: position || undefined, ...(password ? { password } : {}) })
      : userSchema.safeParse({ email, password, nameEn, nameAr, departmentId, role, phone, position: position || undefined });

    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

          const toCellString = (key: string, value: any): string => {
        if (value === null || value === undefined) return '';
        // Preserve numbers from Excel (avoid scientific notation issues)
        if (typeof value === 'number') {
          if (key === 'phone' || key === 'staff_id') return String(Math.trunc(value));
          return String(value);
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value).trim();
      };

      const normalizeKsaPhone = (input: string): string => {
        const raw = (input || '').trim();
        if (!raw) return '';
        const hasPlus = raw.startsWith('+');
        const digits = raw.replace(/\D/g, '');
        if (!digits) return '';
        // Already full international
        if (hasPlus && digits.startsWith('966')) return `+${digits}`;
        if (digits.startsWith('966')) return `+${digits}`;
        // Local formats
        if (digits.startsWith('05')) return `+966${digits.slice(1)}`;
        if (digits.startsWith('5')) return `+966${digits}`;
        if (digits.startsWith('0') && digits.length >= 9) return `+966${digits.slice(1)}`;
        // Fallback: if user pasted without + but includes 966
        if (digits.length >= 12 && digits.startsWith('966')) return `+${digits}`;
        return raw; // leave as-is if we can't normalize
      };

      setSaving(true);
    try {
      const legacyRoleForEdge: CoreLegacyRole = selectedLegacyTier;

      // Clean Model RBAC:
      // - UI stores `role` as the custom role key (custom_roles.role_key) when chosen.
      // - If the user didn't choose a custom role, we must send custom_role_key as null/undefined.
      // - NEVER send '_' (it causes 400).
      const customRoleKeyToSend = (() => {
        const input = String(role ?? '').trim();
        if (!input || input === '_') return null;

        // Resolve case-insensitively to the exact stored/custom role_key.
        // Core roles are always available locally even if RLS only returned the current user's role.
        const map = new Map(
          (availableRoles || []).map((r) => [String(r.role_key).trim().toLowerCase(), String(r.role_key).trim()])
        );
        return map.get(input.toLowerCase()) ?? input;
      })();

      if (editingUser) {
        // Update existing user (and optionally reset password) via edge function
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await supabase.functions.invoke('create-user', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            email,
            ...(password ? { password } : {}),
            name_en: nameEn,
            name_ar: nameAr,
            department_id: departmentId || undefined,
            role: legacyRoleForEdge,
            custom_role_key: customRoleKeyToSend ?? null,
            phone: normalizeKsaPhone(phone) || undefined,
            staff_id: staffId || undefined,
            is_active: isActive,
            position: position || undefined,
            update_existing: true,
          },
        });

        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(response.data.error);

        toast({
          title: 'Success',
          description: 'User updated successfully',
        });
      } else {
        // Create new user via edge function to avoid logging out current admin
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await supabase.functions.invoke('create-user', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
          body: {
            email,
            password,
            name_en: nameEn,
            name_ar: nameAr,
            department_id: departmentId || undefined,
            role: legacyRoleForEdge,
            custom_role_key: customRoleKeyToSend ?? null,
            phone: normalizeKsaPhone(phone) || undefined,
            staff_id: staffId || undefined,
            is_active: isActive,
            position: position || undefined,
          },
        });

        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(response.data.error);

        toast({
          title: 'Success',
          description: 'User created successfully',
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save user',
        variant: 'destructive',
      });
    }
    setSaving(false);
  };

  const fetchExportRows = async () => {
    // Fetch roles once (for export)
    const { data: rolesData, error: rolesErr } = await supabase
      .from('user_roles')
      .select('user_id, role');
    if (rolesErr) throw rolesErr;
    const rolesMap = new Map((rolesData || []).map((r: any) => [r.user_id, r.role]));

    // Prefer custom role keys if present, so Excel round-trips cleanly
    let customMap = new Map<string, string>();
    try {
      const { data: ucrData, error: ucrErr } = await supabase
        .from('user_custom_roles')
        .select('user_id, role_key');
      if (!ucrErr) {
        customMap = new Map((ucrData || []).map((r: any) => [r.user_id, r.role_key]));
      }
    } catch {
      customMap = new Map();
    }

    const PAGE_SIZE = 500;
    let from = 0;
    const exportRows: any[] = [];

    while (true) {
      let exportProfilesQuery = supabase
        .from('profiles')
        .select(`
          id,
          email,
          name_en,
          name_ar,
          phone,
          staff_id,
          is_active,
          position,
          department_id,
          department:departments(name_en,name_ar)
        `)
        .order('name_en');

      if (!showArchived) {
        exportProfilesQuery = exportProfilesQuery.eq('is_active', true);
      }

      const { data: profilesData, error: profilesErr } = await exportProfilesQuery.range(from, from + PAGE_SIZE - 1);

      if (profilesErr) throw profilesErr;
      if (!profilesData || profilesData.length === 0) break;

      for (const p of profilesData as any[]) {
        exportRows.push({
          email: p.email || '',
          name_en: p.name_en || '',
          name_ar: p.name_ar || '',
          department_id: p.department_id || '',
          phone: p.phone || '',
          staff_id: p.staff_id || '',
          is_active: p.is_active !== false,
          position: p.position || '',
          department_en: p.department?.name_en || '',
          department_ar: p.department?.name_ar || '',
          role: customMap.get(p.id) || rolesMap.get(p.id) || 'user',
        });
      }

      if (profilesData.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return exportRows;
  };

  const exportUsersCsv = async () => {
    setExportingCsv(true);
    try {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const fetchWithRetry = async (url: string, opts: RequestInit, retries = 2) => {
        let lastErr: any = null;
        for (let i = 0; i <= retries; i++) {
          try {
            const res = await fetch(url, opts);
            return res;
          } catch (e) {
            lastErr = e;
            await sleep(600 * Math.pow(2, i));
          }
        }
        throw lastErr;
      };

      const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      };

      // CSV exports must go through the audited Edge Function.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error(language === 'ar' ? 'غير مسجل الدخول' : 'Not authenticated');

        const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        if (!baseUrl) throw new Error('Missing VITE_SUPABASE_URL');

        const res = await fetchWithRetry(`${baseUrl}/functions/v1/export-users`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          let msg = res.statusText;
          let requestId = res.headers.get('x-request-id') || '';
          try {
            const j: any = await res.json();
            msg = j?.error?.message || j?.error || msg;
            requestId = j?.request_id || j?.error?.request_id || requestId;
          } catch {
            // ignore
          }
          const err = new Error(requestId ? `${msg} (request_id: ${requestId})` : msg) as Error & {
            requestId?: string;
          };
          err.requestId = requestId || undefined;
          throw err;
        }

        let blob = await res.blob();
        const cd = res.headers.get('content-disposition') || '';
        const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
        const rawName = (m?.[1] || m?.[2] || 'users_export.csv').trim();
        const filename = decodeURIComponent(rawName);

        // Excel on Windows often mis-detects UTF-8 CSV. Add BOM so Arabic renders correctly.
        if (filename.toLowerCase().endsWith('.csv')) {
          const csvText = await blob.text();
          blob = new Blob(['\ufeff' + csvText], { type: 'text/csv;charset=utf-8;' });
        }

        downloadBlob(blob, filename);

        toast({
          title: language === 'ar' ? 'تم التصدير' : 'Exported',
          description: language === 'ar' ? 'تم تصدير المستخدمين كملف CSV' : 'Users exported as CSV',
        });
        return;
      } catch (edgeErr) {
        console.warn('Edge export-users failed:', edgeErr);
        throw edgeErr;
      }
    } catch (error: any) {
      console.error('Export users failed:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: error?.message || (language === 'ar' ? 'فشل التصدير' : 'Export failed'),
        variant: 'destructive',
      });
    } finally {
      setExportingCsv(false);
    }
  };

  const exportUsersExcel = async () => {
    setExportingExcel(true);
    try {
      const exportRows = await fetchExportRows();

      const ws = XLSX.utils.json_to_sheet(exportRows);
      // Make sheet a little more readable
      ws['!cols'] = [
        { wch: 28 }, // email
        { wch: 20 }, // name_en
        { wch: 20 }, // name_ar
        { wch: 40 }, // department_id
        { wch: 18 }, // phone
        { wch: 14 }, // staff_id
        { wch: 10 }, // is_active
        { wch: 12 }, // position
        { wch: 20 }, // department_en
        { wch: 20 }, // department_ar
        { wch: 12 }, // role
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');

      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      await logAudit('EXPORT_USERS_XLSX', {
        entityType: 'profiles',
        metadata: { count: exportRows.length },
      });

      toast({
        title: language === 'ar' ? 'تم التصدير' : 'Exported',
        description: language === 'ar' ? 'تم تصدير المستخدمين كملف Excel' : 'Users exported as Excel',
      });
    } catch (error: any) {
      console.error('Export users (xlsx) failed:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: error?.message || (language === 'ar' ? 'فشل التصدير' : 'Export failed'),
        variant: 'destructive',
      });
    } finally {
      setExportingExcel(false);
    }
  };

const downloadExcelTemplate = () => {
    // Single-sheet template (Users) to avoid "failed to read excel" issues.
    // Phone format: enter numbers starting with 5 (e.g. 5XXXXXXXX). We will store it as +9665XXXXXXXX.
    const wb = XLSX.utils.book_new();

    const usersData = [
      {
        email: 'user@example.com',
        password: 'TempPass123!',
        name_en: 'Ahmed Ali',
        name_ar: 'أحمد علي',
        // You can enter either department_id (UUID) OR a department name in department_name_en/department_name_ar.
        department_id: '',
        department_name_en: 'Medical Admin',
        department_name_ar: 'الإدارة الطبية',
        role: 'user',
        phone: '5XXXXXXXX',
        staff_id: 'EMP-001',
        is_active: 'true',
        position: 'Employee',
      },
      {
        email: 'user2@example.com',
        password: 'TempPass123!',
        name_en: 'Sara Mohammed',
        name_ar: 'سارة محمد',
        department_id: '',
        department_name_en: 'Anesthesia',
        department_name_ar: 'التخدير',
        role: 'user',
        phone: '5XXXXXXXX',
        staff_id: 'EMP-002',
        is_active: 'true',
        position: 'Employee',
      },
    ];

    const usersWs = XLSX.utils.json_to_sheet(usersData);

    // Set column widths
    usersWs['!cols'] = [
      { wch: 25 }, // email
      { wch: 18 }, // password
      { wch: 20 }, // name_en
      { wch: 20 }, // name_ar
      { wch: 40 }, // department_id
      { wch: 24 }, // department_name_en
      { wch: 24 }, // department_name_ar
      { wch: 12 }, // role
      { wch: 16 }, // phone (local 5xxxxxxxx)
      { wch: 14 }, // staff_id
      { wch: 10 }, // is_active
      { wch: 12 }, // position
    ];

    XLSX.utils.book_append_sheet(wb, usersWs, 'Users');

    // Download
    XLSX.writeFile(wb, 'users_template.xlsx');

    toast({
      title: language === 'ar' ? 'تم التحميل' : 'Downloaded',
      description:
        language === 'ar'
          ? 'تم تحميل قالب المستخدمين. اكتب رقم الجوال يبدأ بـ 5 وسيتم حفظه تلقائياً كـ +966...'
          : 'Users template downloaded. Enter phone starting with 5 and it will be saved automatically as +966...',
    });
  };


  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('Starting Excel upload:', file.name);

    try {
      const ext = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
      let workbook: XLSX.WorkBook;

      if (ext === 'csv') {
        const text = await file.text();
        workbook = XLSX.read(text, { type: 'string', codepage: 65001 });
      } else {
        const data = await file.arrayBuffer();
        workbook = XLSX.read(data, { type: 'array', codepage: 65001 }); // UTF-8 for Arabic support
      }
      
      console.log('Available sheets:', workbook.SheetNames);
      
      // Get the Users sheet or first sheet if Users doesn't exist
      let usersSheet = workbook.Sheets['Users'];
      if (!usersSheet && workbook.SheetNames.length > 0) {
        // Try first sheet if Users sheet not found
        usersSheet = workbook.Sheets[workbook.SheetNames[0]];
        console.log('Using first sheet:', workbook.SheetNames[0]);
      }
      
      if (!usersSheet) {
        toast({
          title: 'Error',
          description: language === 'ar' ? 'لم يتم العثور على ورقة المستخدمين' : 'No sheets found in Excel file',
          variant: 'destructive',
        });
        return;
      }

      // Convert to JSON with raw strings
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(usersSheet, { raw: true, defval: '', blankrows: false });
      
      console.log('Parsed rows:', rows.length, rows[0]);
      
      if (rows.length === 0) {
        toast({
          title: 'Error',
          description: language === 'ar' ? 'لا توجد بيانات في الملف' : 'No data found in the file',
          variant: 'destructive',
        });
        return;
      }

      // Validate required fields - check first row for column names
      const requiredFields = ['email', 'password', 'name_en', 'name_ar'];
      const firstRow = rows[0];
      const availableKeys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      const missingFields = requiredFields.filter(f => !availableKeys.includes(f.toLowerCase()));
      
      if (missingFields.length > 0) {
        toast({
          title: 'Invalid File',
          description: `Missing required columns: ${missingFields.join(', ')}. Found columns: ${Object.keys(firstRow).join(', ')}`,
          variant: 'destructive',
        });
        return;
      }

            const toCellString = (key: string, value: any): string => {
        if (value === null || value === undefined) return '';
        // Preserve numbers from Excel (avoid scientific notation issues)
        if (typeof value === 'number') {
          if (key === 'phone' || key === 'staff_id') return String(Math.trunc(value));
          return String(value);
        }
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value).trim();
      };

      const normalizeKsaPhone = (input: string): string => {
        const raw = (input || '').trim();
        if (!raw) return '';
        const hasPlus = raw.startsWith('+');
        const digits = raw.replace(/\D/g, '');
        if (!digits) return '';
        // Already full international
        if (hasPlus && digits.startsWith('966')) return `+${digits}`;
        if (digits.startsWith('966')) return `+${digits}`;
        // Local formats
        if (digits.startsWith('05')) return `+966${digits.slice(1)}`;
        if (digits.startsWith('5')) return `+966${digits}`;
        if (digits.startsWith('0') && digits.length >= 9) return `+966${digits.slice(1)}`;
        // Fallback: if user pasted without + but includes 966
        if (digits.length >= 12 && digits.startsWith('966')) return `+${digits}`;
        return raw; // leave as-is if we can't normalize
      };

      setSaving(true);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      let skippedCount = 0;
      let updatedCount = 0;


      // Get token once (avoid repeating session checks per row)
      const token = await getAccessToken();

      for (const row of rows) {
        // Normalize column names (handle case differences) - declare outside try for catch access
        const normalizedRow: Record<string, string> = {};
        Object.entries(row).forEach(([key, value]) => {
          const k = key.toLowerCase().trim();
          normalizedRow[k] = toCellString(k, value);
        });

        // Normalize phone to +966... if user types only 5xxxxxxxx
        if (normalizedRow['phone']) {
          normalizedRow['phone'] = normalizeKsaPhone(normalizedRow['phone']);
        }

const email = normalizedRow['email'];
        
        try {
          const password = normalizedRow['password'];
          const nameEn = normalizedRow['name_en'];
          const nameAr = normalizedRow['name_ar'];

          // Skip rows without email or with example email
          if (!email || email === 'user@example.com') {
            console.log('Skipping row:', email || 'no email');
            skippedCount++;
            continue;
          }

          // Skip if user already exists in current list
          const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (existingUser && !updateExistingOnUpload) {
            console.log('Skipping existing user:', email);
            skippedCount++;
            continue;
          }

          // Validate department_id if provided
      let deptId = normalizedRow['department_id'];

      // Easier department input: allow department_name_en / department_name_ar / department
      const deptNameCandidate =
        normalizedRow['department_name_en'] ||
        normalizedRow['department_name_ar'] ||
        normalizedRow['department'] ||
        normalizedRow['dept'] ||
        '';

      if (!deptId && deptNameCandidate) {
        const byName = departments.find(
          (d) =>
            d.name_en?.toLowerCase() === deptNameCandidate.toLowerCase() ||
            d.name_ar === deptNameCandidate
        );
        if (byName) deptId = byName.id;
      }

          if (deptId && !departments.find(d => d.id === deptId)) {
            // Try to find by name
            const deptByName = departments.find(
              d => d.name_en.toLowerCase() === deptId?.toLowerCase() || 
                   d.name_ar === deptId
            );
            if (deptByName) {
              deptId = deptByName.id;
            } else {
              deptId = '';
            }
          }

          // Role mapping (Clean Model):
          // - If Excel "role" matches a custom_roles.role_key => send as custom_role_key (preferred)
          // - Else if matches legacy tier (admin/super_user/audit/user) => send role tier and custom_role_key null
          // - Else fallback to user tier and custom_role_key null
          const roleCellRaw = (normalizedRow['role'] || '').trim();
          const roleCellLower = roleCellRaw.toLowerCase();

          // Map lowercased -> exact stored role_key from DB
          const availableKeyByLower = new Map(
            (availableRoles || []).map((r) => [String(r.role_key).trim().toLowerCase(), String(r.role_key).trim()])
          );

          let legacyTier: CoreLegacyRole = 'user';
          let customRoleKeyForEdge: string | null = null;

          if (roleCellLower) {
            const resolved = availableKeyByLower.get(roleCellLower);
            if (resolved) {
              // Send the exact DB key, even if Excel casing differs.
              customRoleKeyForEdge = resolved;
              legacyTier = getLegacyTierFromRoleKey(resolved);
            } else if (roleCellLower === 'admin' || roleCellLower === 'audit' || roleCellLower === 'super_user' || roleCellLower === 'user') {
              legacyTier = roleCellLower as CoreLegacyRole;
              customRoleKeyForEdge = roleCellLower;
            } else {
              legacyTier = 'user';
              customRoleKeyForEdge = 'user';
            }
          }

          // Only admins can assign the admin role (also enforced in edge function)
          if (!canAssignAdminRole && legacyTier === 'admin') {
            errors.push(`${email}: Only admins can assign the admin role`);
            errorCount++;
            continue;
          }

          // Validate position
          let userPosition = normalizedRow['position'];
          if (userPosition && !['Manager', 'Employee'].includes(userPosition)) {
            // Try to match case-insensitively
            if (userPosition.toLowerCase() === 'manager') userPosition = 'Manager';
            else if (userPosition.toLowerCase() === 'employee') userPosition = 'Employee';
            else userPosition = '';
          }

          console.log('Processing user:', { email, nameEn, nameAr, deptId, legacyTier, customRoleKeyForEdge, userPosition, updateExisting: updateExistingOnUpload });

          const response = await supabase.functions.invoke('create-user', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: {
              email,
              password,
              name_en: nameEn,
              name_ar: nameAr,
              department_id: deptId || undefined,
              // If role column is present, map it; otherwise avoid changing roles on update.
              ...(roleCellLower ? { role: legacyTier, custom_role_key: (customRoleKeyForEdge ?? null) } : (updateExistingOnUpload ? {} : { role: 'user', custom_role_key: null })),
              phone: normalizedRow['phone'] || undefined,
              staff_id: normalizedRow['staff_id'] || undefined,
              is_active:
                normalizedRow['is_active'] === ''
                  ? true
                  : ['true', '1', 'yes', 'y', 'active'].includes(normalizedRow['is_active'].toLowerCase()),
              position: userPosition || undefined,
              update_existing: updateExistingOnUpload, // Pass the toggle value
            },
          });

          console.log('Create user response:', response);

          // Check for error in response data first (API returns error in data for 400 responses)
          const errorMessage = response.data?.error || response.error?.message || '';
          
          if (errorMessage) {
            // Handle duplicate email gracefully
            if (errorMessage.includes('already been registered') || errorMessage.includes('already exists')) {
              console.log('User already exists, skipping:', email);
              skippedCount++;
              continue;
            }
            throw new Error(errorMessage);
          }
          
          if (response.error) {
            // Try to get error context from FunctionsHttpError
            const contextError = response.error.context?.body || response.error.message;
            if (typeof contextError === 'string' && contextError.includes('already been registered')) {
              console.log('User already exists (context), skipping:', email);
              skippedCount++;
              continue;
            }
            throw new Error(contextError || 'Unknown error');
          }
          
          // Track if it was an update or create
          if (response.data?.updated) {
            updatedCount++;
          } else {
            successCount++;
          }
        } catch (error: any) {
          // Handle duplicate email in catch block as well (only if update_existing is false)
          const errMsg = error.message || String(error);
          if (errMsg.includes('already been registered') || errMsg.includes('already exists')) {
            console.log('User already exists (caught):', normalizedRow['email']);
            skippedCount++;
            continue;
          }
          console.error(`Error creating user ${normalizedRow['email']}:`, error);
          errors.push(`${normalizedRow['email'] || 'unknown'}: ${errMsg}`);
          errorCount++;
        }
      }

      if (errors.length > 0) {
        console.log('Import errors:', errors);
      }

      const parts: string[] = [];
      if (successCount > 0) parts.push(language === 'ar' ? `تم إنشاء ${successCount}` : `Created ${successCount}`);
      if (updatedCount > 0) parts.push(language === 'ar' ? `تم تحديث ${updatedCount}` : `Updated ${updatedCount}`);
      if (skippedCount > 0) parts.push(language === 'ar' ? `تم تخطي ${skippedCount}` : `Skipped ${skippedCount}`);
      if (errorCount > 0) parts.push(language === 'ar' ? `${errorCount} أخطاء` : `${errorCount} errors`);

      toast({
        title: language === 'ar' ? 'اكتمل الاستيراد' : 'Import Complete',
        description: parts.join(', '),
        variant: errorCount > 0 ? 'destructive' : 'default',
      });

      fetchData();
    } catch (error: any) {
      console.error('Error reading Excel file:', error);
      toast({
        title: 'Error',
        description: language === 'ar' ? `فشل في قراءة الملف: ${error?.message || error}` : `Failed to read file: ${error?.message || error}`,
        variant: 'destructive',
      });
    }
    
    setSaving(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'super_user': return 'default';
      case 'audit': return 'secondary';
      default: return 'outline';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <UserManagementView
      language={language}
      availableRoles={availableRoles}
      users={users}
      filteredUsers={filteredUsers}
      departments={departments}
      dialogOpen={dialogOpen}
      setDialogOpen={setDialogOpen}
      resetForm={resetForm}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      editingUser={editingUser}
      openEditDialog={openEditDialog}
      openDeleteDialog={openDeleteDialog}
      saving={saving}
      deleting={deleting}
      userToDelete={userToDelete}
      handleSaveUser={handleSaveUser}
      handleDeleteUser={handleDeleteUser}
      handleRestoreUser={handleRestoreUser}
      downloadExcelTemplate={downloadExcelTemplate}
      exportUsersCsv={exportUsersCsv}
      exportingCsv={exportingCsv}
      exportUsersExcel={exportUsersExcel}
      exportingExcel={exportingExcel}

      selectedUserIds={selectedUserIds}
      toggleSelectUser={toggleSelectUser}
      toggleSelectAllFiltered={toggleSelectAllFiltered}
      clearSelection={clearSelection}
      bulkDepartmentId={bulkDepartmentId}
      setBulkDepartmentId={setBulkDepartmentId}
      bulkWorking={bulkWorking}
      bulkSetActive={bulkSetActive}
      bulkChangeDepartment={bulkChangeDepartment}
      handleExcelUpload={handleExcelUpload}
      updateExistingOnUpload={updateExistingOnUpload}
      setUpdateExistingOnUpload={setUpdateExistingOnUpload}
      fileInputRef={fileInputRef}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      nameEn={nameEn}
      setNameEn={setNameEn}
      nameAr={nameAr}
      setNameAr={setNameAr}
      departmentId={departmentId}
      setDepartmentId={setDepartmentId}
      phone={phone}
      setPhone={setPhone}
      staffId={staffId}
      setStaffId={setStaffId}
      isActive={isActive}
      setIsActive={setIsActive}
      role={role}
      setRole={setRole}
      position={position}
      setPosition={setPosition}
      canAssignAdminRole={canAssignAdminRole}
      canResetPassword={canResetPassword}
      getRoleBadgeVariant={getRoleBadgeVariant}
      filterRole={filterRole}
      setFilterRole={setFilterRole}
      filterDepartment={filterDepartment}
      setFilterDepartment={setFilterDepartment}
      filterPosition={filterPosition}
      setFilterPosition={setFilterPosition}
      showArchived={showArchived}
      setShowArchived={setShowArchived}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      clearFilters={clearFilters}
    />
  );
};

export default UserManagementPage;
