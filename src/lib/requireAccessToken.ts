import { supabase } from "@/integrations/supabase/client";

export async function requireAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Not authenticated. Please login again.");
  }
  return token;
}
