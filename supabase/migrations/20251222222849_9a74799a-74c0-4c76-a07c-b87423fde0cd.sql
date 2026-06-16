-- Add phone and position columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN phone text,
ADD COLUMN position text CHECK (position IN ('Manager', 'Employee'));

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.phone IS 'User phone number';
COMMENT ON COLUMN public.profiles.position IS 'User position: Manager or Employee';