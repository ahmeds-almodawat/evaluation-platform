export type AppRole = 'admin' | 'audit' | 'super_user' | 'user';

export const ROLE_PRIORITY: Record<AppRole, number> = {
  admin: 4,
  super_user: 3,
  audit: 2,
  user: 1,
} as const;

export function highestRole(roles: AppRole[]): AppRole {
  if (!roles || roles.length === 0) return 'user';
  return roles.reduce((best, r) => (ROLE_PRIORITY[r] > ROLE_PRIORITY[best] ? r : best), 'user' as AppRole);
}

export function isAtLeast(role: AppRole, required: AppRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[required];
}
