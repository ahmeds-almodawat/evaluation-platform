import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/audit';

export type UserRole = 'admin' | 'audit' | 'super_user' | 'user';

export type PermissionCode =
  | 'dashboards.department.view'
  | 'dashboards.company.view'
  | 'dashboards.exec.view'
  | 'dashboards.custom.view'
  | 'dashboards.custom.create'
  | 'dashboards.custom.edit'
  | 'dashboards.custom.share'
  | 'dashboards.custom.export'
  | 'reports.view'
  | 'reports.view_sensitive'
  | 'reports.export'
  | 'employees.read'
  | 'departments.manage'
  | 'departments.manage_members'
  | 'users.manage'
  | 'users.create'
  | 'users.update'
  | 'users.archive'
  | 'users.restore'
  | 'users.export'
  | 'users.bulk'
  | 'audit.read'
  | 'templates.manage'
  | 'branding.manage'
  | 'messages.broadcast'
  | 'alerts.view'
  | 'evaluations.manage'
  | 'evaluations.custom.create'
  | 'evaluations.anonymous.manage'
  | 'actions.view'
  | 'actions.manage'
  | 'roles.manage'
  | 'cycles.manage'
  | 'data_health.view'
  | 'imports.manage'
  // Evaluations / reporting detail permissions
  | 'evaluations.send'
  | 'evaluations.create'
  | 'evaluations.score_breakdown.view'
  | 'evaluations.rater_identity.view'
  | 'evaluations.anonymous.reveal';

const ROLE_PRIORITY: Record<UserRole, number> = {
  user: 0,
  audit: 1,
  super_user: 2,
  admin: 3,
};

const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionCode[]> = {
  admin: [
    'dashboards.department.view','dashboards.company.view','dashboards.exec.view','dashboards.custom.view','dashboards.custom.create','dashboards.custom.edit','dashboards.custom.share','dashboards.custom.export',
    'reports.view','reports.view_sensitive','reports.export',
    'employees.read',
    'departments.manage','departments.manage_members',
    'users.manage','users.create','users.update','users.archive','users.restore','users.export','users.bulk',
    'audit.read',
    'templates.manage',
    'branding.manage',
    'messages.broadcast',
    'alerts.view',
    'evaluations.manage','evaluations.custom.create','evaluations.anonymous.manage',
    'evaluations.send','evaluations.create','evaluations.score_breakdown.view','evaluations.rater_identity.view','evaluations.anonymous.reveal',
    'actions.view','actions.manage',
    'roles.manage',
    'cycles.manage',
    'data_health.view',
    'imports.manage',
  ],
  super_user: [
    'dashboards.department.view','dashboards.company.view','dashboards.exec.view','dashboards.custom.view','dashboards.custom.create','dashboards.custom.edit','dashboards.custom.share','dashboards.custom.export',
    'reports.view','reports.export',
    'employees.read',
    'departments.manage','departments.manage_members',
    'users.manage','users.create','users.update','users.archive','users.restore','users.export','users.bulk',
    'messages.broadcast',
    'evaluations.manage','evaluations.custom.create',
    'evaluations.send','evaluations.create','evaluations.score_breakdown.view','evaluations.rater_identity.view',
    'actions.view','actions.manage',
    'cycles.manage',
    'data_health.view',
    'imports.manage',
  ],
  audit: [
    'dashboards.company.view','dashboards.exec.view',
    'reports.view','reports.export',
    'employees.read',
    'audit.read',
    'actions.view',
  ],
  user: [],
};

interface Profile {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  department_id: string | null;
  avatar_url: string | null;
}

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole;
  department: Department | null;
  loading: boolean;
  permissions: PermissionCode[];
  hasPermission: (perm: PermissionCode) => boolean;
  /** Admin-only UI feature: simulate the permission set of a custom role without changing DB roles. */
  simulatedRoleKey: string | null;
  simulatedRoleName: { en: string; ar: string } | null;
  isRoleSimulating: boolean;
  startRoleSimulation: (roleKey: string) => Promise<void>;
  stopRoleSimulation: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canViewCalculationLogic: boolean;
  canViewAggregatedOnly: boolean;
  canAddUsers: boolean;
  canEvaluate: boolean;
  canViewOwnScoresOnly: boolean;
  canViewAlerts: boolean;
  canManageDepartments: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const SupabaseAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<PermissionCode[]>([]);

  // Role simulator (admin-only)
  const SIM_KEY = 'role_simulator_role_key';
  const [simulatedRoleKey, setSimulatedRoleKey] = useState<string | null>(null);
  const [simulatedRoleName, setSimulatedRoleName] = useState<{ en: string; ar: string } | null>(null);
  const [simulatedPermissions, setSimulatedPermissions] = useState<PermissionCode[] | null>(null);

  const hasPermission = (perm: PermissionCode) => {
    // Admin-only: if simulation is active, evaluate against simulated permissions.
    if (role === 'admin' && simulatedRoleKey && simulatedPermissions && simulatedPermissions.length >= 0) {
      return simulatedPermissions.includes(perm);
    }

    // If the DB-backed matrix is not available yet, fall back to legacy defaults by role.
    if (permissions.length === 0) {
      return (DEFAULT_ROLE_PERMISSIONS[role] || []).includes(perm);
    }
    return permissions.includes(perm);
  };

  const hydrateSimulation = async (maybeRoleKey: string | null) => {
    if (!maybeRoleKey) {
      setSimulatedRoleKey(null);
      setSimulatedRoleName(null);
      setSimulatedPermissions(null);
      return;
    }

    setSimulatedRoleKey(maybeRoleKey);
    try {
      // Fetch role name (best-effort)
      const { data: roleRow } = await supabase
        .from('custom_roles')
        .select('name_en,name_ar')
        .eq('role_key', maybeRoleKey)
        .maybeSingle();

      setSimulatedRoleName({
        en: (roleRow as any)?.name_en ?? maybeRoleKey,
        ar: (roleRow as any)?.name_ar ?? maybeRoleKey,
      });

      // Fetch permission set for the simulated role
      const { data: permRows } = await supabase
        .from('custom_role_permissions')
        .select('permission')
        .eq('role_key', maybeRoleKey);

      const perms = (permRows || [])
        .map((r: any) => r?.permission as PermissionCode)
        .filter(Boolean);

      setSimulatedPermissions(perms);
    } catch {
      // If custom roles tables not installed / RLS blocks, keep simulator enabled but with empty permission set.
      setSimulatedRoleName({ en: maybeRoleKey, ar: maybeRoleKey });
      setSimulatedPermissions([]);
    }
  };

  const startRoleSimulation = async (roleKey: string) => {
    if (role !== 'admin') return;
    const key = (roleKey || '').trim();
    if (!key) return;
    try {
      localStorage.setItem(SIM_KEY, key);
    } catch {
      // ignore
    }
    await hydrateSimulation(key);
    await logAudit('SIMULATION_START', { metadata: { simulated_role_key: key } });
  };

  const stopRoleSimulation = async () => {
    if (role !== 'admin') return;
    const prev = simulatedRoleKey;
    try {
      localStorage.removeItem(SIM_KEY);
    } catch {
      // ignore
    }
    await hydrateSimulation(null);
    await logAudit('SIMULATION_STOP', { metadata: { simulated_role_key: prev } });
  };

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (profileData) {
        setProfile(profileData);
        
        // Fetch department if exists
        if (profileData.department_id) {
          const { data: deptData } = await supabase
            .from('departments')
            .select('*')
            .eq('id', profileData.department_id)
            .maybeSingle();
          setDepartment(deptData);
        }
      }

      // Fetch roles (defensive: handle multiple role rows)
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const roles = (roleRows || [])
        .map((r: any) => r?.role as UserRole)
        .filter((r): r is UserRole => !!r && (r in ROLE_PRIORITY));

      const effectiveRole = roles.reduce<UserRole>((best, r) => (
        ROLE_PRIORITY[r] > ROLE_PRIORITY[best] ? r : best
      ), 'user');

      setRole(effectiveRole);

      // Hydrate role simulator (admin-only). We do this early so all navigation gates reflect the simulated permissions.
      try {
        const sim = localStorage.getItem(SIM_KEY);
        if (effectiveRole === 'admin' && sim) {
          await hydrateSimulation(sim);
        } else {
          await hydrateSimulation(null);
        }
      } catch {
        await hydrateSimulation(null);
      }

      // Optional custom role (one per user):
      // If present, it adds extra permissions (and the core role is typically "user").
      let customRoleKey: string | null = null;
      try {
        const { data: customRow } = await supabase
          .from('user_custom_roles')
          .select('role_key')
          .eq('user_id', userId)
          .maybeSingle();
        customRoleKey = (customRow as any)?.role_key ?? null;
      } catch {
        customRoleKey = null;
      }

      // Permissions (Clean Model)
      // -----------------------
      // The source of truth is:
      //   user_custom_roles -> custom_role_permissions
      // Legacy role_permissions / user_permissions are not required and may not exist.
      // If we can't fetch the matrix (RLS/network), we fall back to DEFAULT_ROLE_PERMISSIONS.
      try {
        let customPerms: PermissionCode[] = [];
        if (customRoleKey) {
          const { data: customPermRows, error: permErr } = await supabase
            .from('custom_role_permissions')
            .select('permission')
            .eq('role_key', customRoleKey);

          if (!permErr) {
            customPerms = (customPermRows || [])
              .map((r: any) => r?.permission as PermissionCode)
              .filter(Boolean);
          }
        }

        // If a custom role is assigned, use its permissions as the matrix.
        // Otherwise keep permissions empty so hasPermission() falls back to legacy defaults.
        setPermissions(customRoleKey ? customPerms : []);
      } catch {
        setPermissions([]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchUserData(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRole('user');
        setDepartment(null);
        setPermissions([]);
        // Clear simulation on logout
        await hydrateSimulation(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Hard-clear any persisted Supabase auth keys.
   *
   * Why this exists:
   * - If you change Supabase projects (.env URL/key) while the browser still has an old session,
   *   the app can appear to "auto-login" or get stuck in redirect loops.
   * - Some browsers/extensions can block signOut from clearing storage.
   */
  const clearPersistedAuth = () => {
    try {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
      let projectRef: string | null = null;
      try {
        if (url) projectRef = new URL(url).hostname.split('.')[0] ?? null;
      } catch {
        projectRef = null;
      }

      const keys = Object.keys(localStorage);
      for (const k of keys) {
        // Typical keys: sb-<ref>-auth-token, sb-<ref>-auth-token-code-verifier
        if (projectRef && k.startsWith(`sb-${projectRef}-`)) {
          localStorage.removeItem(k);
          continue;
        }
        // Extra safety: remove legacy / generic supabase auth keys.
        if (k.toLowerCase().includes('supabase') && k.toLowerCase().includes('auth')) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  };

  const signOut = async () => {
    try {
      // Prefer global to revoke refresh token server-side as well.
      // (Some environments may not support this option; we fall back gracefully.)
      await supabase.auth.signOut({ scope: 'global' });
    } catch {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }

    // Always hard-clear local persisted session to prevent "stuck logged in" issues.
    clearPersistedAuth();

    setUser(null);
    setSession(null);
    setProfile(null);
    setRole('user');
    setDepartment(null);
    setPermissions([]);
      await hydrateSimulation(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  // Keep the existing boolean flags for backward compatibility,
  // but compute them from the permission matrix when available.
  const legacyPermissions = {
    canViewCalculationLogic: hasPermission('users.manage') && role === 'admin',
    canViewAggregatedOnly: role === 'audit' || role === 'super_user' || role === 'admin',
    canAddUsers: hasPermission('users.create') || role === 'admin' || role === 'super_user',
    canEvaluate: hasPermission('evaluations.manage') || role === 'admin' || role === 'super_user',
    canViewOwnScoresOnly: role === 'user',
    canViewAlerts: hasPermission('alerts.view') || role === 'admin',
    canManageDepartments: hasPermission('departments.manage') || role === 'admin' || role === 'super_user',
    isAdmin: role === 'admin',
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      department,
      loading,
      permissions,
      hasPermission,
      simulatedRoleKey,
      simulatedRoleName,
      isRoleSimulating: role === 'admin' && !!simulatedRoleKey,
      startRoleSimulation,
      stopRoleSimulation,
      signOut,
      refreshProfile,
      ...legacyPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useSupabaseAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};
