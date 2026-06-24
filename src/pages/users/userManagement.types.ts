export type AppRole = string; // role key (supports custom roles)

export interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

export interface UserProfile {
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
  deleted_at?: string | null;
  department?: Department;
  role?: AppRole;
}
