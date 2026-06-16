-- Question-based evaluations (Option B)
--
-- Adds per-question scoring while keeping legacy category columns intact.
-- This enables admin drill-down: see *why* a score was computed.

-- =============================
-- 1) Questions (admin-managed)
-- =============================

CREATE TABLE IF NOT EXISTS public.evaluation_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('performance','teamwork','workload')),
  text_en text NOT NULL,
  text_ar text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_questions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active questions (needed for filling surveys)
DROP POLICY IF EXISTS "Authenticated can read evaluation questions" ON public.evaluation_questions;
CREATE POLICY "Authenticated can read evaluation questions"
  ON public.evaluation_questions
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Only admin can manage question bank
DROP POLICY IF EXISTS "Admin can manage evaluation questions" ON public.evaluation_questions;
CREATE POLICY "Admin can manage evaluation questions"
  ON public.evaluation_questions
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');


-- =============================
-- 2) Answers (per evaluation)
-- =============================

CREATE TABLE IF NOT EXISTS public.evaluation_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.evaluation_questions(id) ON DELETE RESTRICT,
  score int NOT NULL CHECK (score BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, question_id)
);

ALTER TABLE public.evaluation_answers ENABLE ROW LEVEL SECURITY;

-- Admin/super_user/audit can read all answers
DROP POLICY IF EXISTS "Privileged can read all evaluation answers" ON public.evaluation_answers;
CREATE POLICY "Privileged can read all evaluation answers"
  ON public.evaluation_answers
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin','super_user','audit'));

-- Evaluator can read their own answers
DROP POLICY IF EXISTS "Evaluator can read own evaluation answers" ON public.evaluation_answers;
CREATE POLICY "Evaluator can read own evaluation answers"
  ON public.evaluation_answers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluations e
      WHERE e.id = evaluation_id
        AND e.evaluator_id = auth.uid()
    )
  );

-- Evaluator can insert/update/delete answers while evaluation is editable (pending or unlocked)
DROP POLICY IF EXISTS "Evaluator can write answers when editable" ON public.evaluation_answers;
CREATE POLICY "Evaluator can write answers when editable"
  ON public.evaluation_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.evaluations e
      WHERE e.id = evaluation_id
        AND e.evaluator_id = auth.uid()
        AND (
          e.status = 'pending'
          OR (e.edit_unlocked_until IS NOT NULL AND e.edit_unlocked_until > now())
        )
    )
  );

DROP POLICY IF EXISTS "Evaluator can update answers when editable" ON public.evaluation_answers;
CREATE POLICY "Evaluator can update answers when editable"
  ON public.evaluation_answers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluations e
      WHERE e.id = evaluation_id
        AND e.evaluator_id = auth.uid()
        AND (
          e.status = 'pending'
          OR (e.edit_unlocked_until IS NOT NULL AND e.edit_unlocked_until > now())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.evaluations e
      WHERE e.id = evaluation_id
        AND e.evaluator_id = auth.uid()
        AND (
          e.status = 'pending'
          OR (e.edit_unlocked_until IS NOT NULL AND e.edit_unlocked_until > now())
        )
    )
  );

DROP POLICY IF EXISTS "Evaluator can delete answers when editable" ON public.evaluation_answers;
CREATE POLICY "Evaluator can delete answers when editable"
  ON public.evaluation_answers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.evaluations e
      WHERE e.id = evaluation_id
        AND e.evaluator_id = auth.uid()
        AND (
          e.status = 'pending'
          OR (e.edit_unlocked_until IS NOT NULL AND e.edit_unlocked_until > now())
        )
    )
  );


-- =============================
-- 3) Seed default questions (only if empty)
-- =============================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.evaluation_questions) THEN
    INSERT INTO public.evaluation_questions (category, text_en, text_ar, sort_order) VALUES
      ('performance', 'Quality of work', 'جودة العمل', 10),
      ('performance', 'Goal achievement', 'تحقيق الأهداف', 20),
      ('teamwork', 'Collaboration with colleagues', 'التعاون مع الزملاء', 30),
      ('teamwork', 'Communication & coordination', 'التواصل والتنسيق', 40),
      ('workload', 'Time management', 'إدارة الوقت', 50),
      ('workload', 'Task completion under pressure', 'إنجاز المهام تحت الضغط', 60);
  END IF;
END $$;
