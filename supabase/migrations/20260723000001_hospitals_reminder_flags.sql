ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS sms_reminders   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_reminders boolean NOT NULL DEFAULT true;
