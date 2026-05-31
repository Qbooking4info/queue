CREATE TABLE IF NOT EXISTS public.user_insurance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  plan_name    text,
  member_id    text NOT NULL,
  group_number text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT user_insurance_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.user_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own insurance"
  ON public.user_insurance FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can insert own insurance"
  ON public.user_insurance FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can update own insurance"
  ON public.user_insurance FOR UPDATE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can delete own insurance"
  ON public.user_insurance FOR DELETE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
