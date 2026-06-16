// Maps the current route to a branding "page key".
// These keys are used to store per-page overrides.

export type BrandingPageKey =
  | 'general'
  | 'login'
  | 'dashboard'
  | 'evaluations'
  | 'reports'
  | 'people'
  | 'settings';

export function pageKeyFromPath(pathname: string): BrandingPageKey {
  if (pathname.startsWith('/auth')) return 'login';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/evaluations') || pathname.startsWith('/my-evaluations') || pathname.startsWith('/custom-evaluation')) return 'evaluations';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/employees') || pathname.startsWith('/departments')) return 'people';
  // Users management is placed under Settings in the sidebar
  if (pathname.startsWith('/users')) return 'settings';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'general';
}

export const BRANDING_PAGE_OPTIONS: Array<{ key: BrandingPageKey; labelEn: string; labelAr: string }> = [
  { key: 'general', labelEn: 'General (All pages)', labelAr: 'عام (كل الصفحات)' },
  { key: 'login', labelEn: 'Login', labelAr: 'تسجيل الدخول' },
  { key: 'dashboard', labelEn: 'Dashboard', labelAr: 'لوحات المتابعة' },
  { key: 'evaluations', labelEn: 'Evaluations', labelAr: 'التقييمات' },
  { key: 'reports', labelEn: 'Reports', labelAr: 'التقارير' },
  { key: 'people', labelEn: 'People', labelAr: 'الموظفين/المستخدمين' },
  { key: 'settings', labelEn: 'Settings', labelAr: 'الإعدادات' },
];
