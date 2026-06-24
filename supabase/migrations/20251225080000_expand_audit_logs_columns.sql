-- Expand audit_logs schema (non-breaking)
-- Adds richer columns used by security/audit tooling (safe to re-run).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN

    -- Core identity
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'actor_email'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN actor_email text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_type'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN entity_type text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'entity_id'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN entity_id uuid;
    END IF;

    -- Request context (optional)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'ip'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN ip inet;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'user_agent'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN user_agent text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'request_id'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN request_id text;
    END IF;

    -- Ensure 'success' exists (older installs may not have it)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'success'
    ) THEN
      ALTER TABLE public.audit_logs ADD COLUMN success boolean NOT NULL DEFAULT true;
    END IF;

    -- Ensure metadata default is set (best-effort)
    BEGIN
      ALTER TABLE public.audit_logs ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
