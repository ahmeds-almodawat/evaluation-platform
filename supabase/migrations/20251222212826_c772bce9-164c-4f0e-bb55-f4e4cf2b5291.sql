-- Add status column to evaluations table
ALTER TABLE public.evaluations 
ADD COLUMN status text NOT NULL DEFAULT 'pending';

-- Add evaluation_type column to track same-department vs cross-department
ALTER TABLE public.evaluations 
ADD COLUMN evaluation_type text DEFAULT 'same';

-- Create index for faster queries on pending evaluations
CREATE INDEX idx_evaluations_status ON public.evaluations(status);
CREATE INDEX idx_evaluations_evaluator_status ON public.evaluations(evaluator_id, status);