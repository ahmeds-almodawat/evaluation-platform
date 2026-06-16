-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create evaluations" ON public.evaluations;

-- Create a new INSERT policy that allows admin/super_user to create evaluations for any user
CREATE POLICY "Admin and super_user can create evaluations for anyone"
ON public.evaluations
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_user'::app_role) OR
  evaluator_id = auth.uid()
);

-- Also update the notifications INSERT policy to fix issue with creating notifications
DROP POLICY IF EXISTS "Admins and super_users can create notifications" ON public.notifications;

CREATE POLICY "Admins and super_users can create notifications for anyone"
ON public.notifications
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'super_user'::app_role)
);