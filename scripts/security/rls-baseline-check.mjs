#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase config. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('security_rls_baseline_report');

if (error) {
  console.error('Security baseline RPC failed:');
  console.error(error.message || error);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

if (!data?.ok) {
  console.error('\nSecurity baseline failed. Review the findings above before piloting real users.');
  process.exit(2);
}

console.log('\nSecurity baseline passed.');
