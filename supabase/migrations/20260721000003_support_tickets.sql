CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT,
  message     TEXT        NOT NULL,
  status      TEXT        DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own tickets" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own tickets" ON support_tickets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
