-- NOTE:
-- This migration file previously contained a broken definition of has_permission()
-- that caused parameter-name mismatch errors (SQLSTATE 42P13) and PostgREST
-- ambiguity errors.
--
-- The canonical implementation is now in:
--   20260209140000_fix_has_permission_overloads.sql
--
-- Keeping this file as a no-op prevents fresh setups from reintroducing the bug.

-- no-op
select 1;
