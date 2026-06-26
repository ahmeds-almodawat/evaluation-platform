export type AppRole = string; // role key (supports custom roles)

// Evaluation hierarchy — classification only, INDEPENDENT of system access role.
// Does NOT grant permissions and does NOT affect RLS.
export type EvaluationLevel = 'employee' | 'supervisor' | 'manager';

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
  evaluation_level?: EvaluationLevel | null;
  deleted_at?: string | null;
  department?: Department;
  role?: AppRole;
}
