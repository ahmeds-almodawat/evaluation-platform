-- Create department_links table for cross-department evaluation permissions
CREATE TABLE public.department_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  target_department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(source_department_id, target_department_id),
  CHECK (source_department_id != target_department_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_en text NOT NULL,
  title_ar text NOT NULL,
  message_en text NOT NULL,
  message_ar text NOT NULL,
  type text NOT NULL DEFAULT 'evaluation',
  is_read boolean NOT NULL DEFAULT false,
  related_evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.department_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS for department_links: Admins and super_users can manage
CREATE POLICY "Admins and super_users can manage department links"
ON public.department_links
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_user'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_user'));

-- Everyone can view department links
CREATE POLICY "Anyone can view department links"
ON public.department_links
FOR SELECT
USING (true);

-- RLS for notifications: Users can only see their own
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Admins and super_users can create notifications
CREATE POLICY "Admins and super_users can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_user'));

-- Create function to check if user can evaluate another user
CREATE OR REPLACE FUNCTION public.can_evaluate_user(_evaluator_id uuid, _evaluatee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Check if evaluator is admin or super_user
    SELECT 1 FROM user_roles WHERE user_id = _evaluator_id AND role IN ('admin', 'super_user')
  )
$$;

-- Create function to check if departments are linked
CREATE OR REPLACE FUNCTION public.departments_are_linked(_dept1_id uuid, _dept2_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM department_links 
    WHERE (source_department_id = _dept1_id AND target_department_id = _dept2_id)
       OR (source_department_id = _dept2_id AND target_department_id = _dept1_id)
  )
$$;