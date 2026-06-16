-- Adds missing column used by RLS policies
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS edit_unlocked_until timestamptz;

-- Optional: helps queries/policies that check this column
CREATE INDEX IF NOT EXISTS idx_evaluations_edit_unlocked_until
  ON public.evaluations(edit_unlocked_until);