-- Messaging between every Queue operator: patients, doctors, hospitals (as a shared
-- staff inbox) and ambulance crews.
--
-- conversations          one thread
-- conversation_members   who is in it: a person (auth_id) or a hospital inbox (hospital_id)
-- messages               the thread's messages; sender fields are stamped by trigger
--
-- Threads are only created through start_conversation(), which checks the two
-- sides really have a care relationship (an appointment, a hospital link, a fleet).
-- Nothing can be inserted into conversations / members directly.

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_staff_hospital_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ha.hospital_id FROM public.hospital_admins ha
    JOIN public.users u ON u.id = ha.user_id
   WHERE u.auth_id = auth.uid() AND ha.is_active AND coalesce(ha.role, 'admin') <> 'ambulance_crew'
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('patient_doctor', 'patient_hospital', 'doctor_hospital', 'crew_hospital')),
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by      uuid,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  auth_id         uuid,
  hospital_id     uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('patient', 'doctor', 'hospital', 'crew')),
  display_name    text NOT NULL,
  avatar_url      text,
  last_read_at    timestamptz,
  CHECK ((auth_id IS NULL) <> (hospital_id IS NULL))
);
CREATE INDEX IF NOT EXISTS conversation_members_auth_idx ON public.conversation_members (auth_id);
CREATE INDEX IF NOT EXISTS conversation_members_hosp_idx ON public.conversation_members (hospital_id);
CREATE INDEX IF NOT EXISTS conversation_members_conv_idx ON public.conversation_members (conversation_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_member_id uuid REFERENCES public.conversation_members(id) ON DELETE SET NULL,
  sender_auth_id   uuid,
  sender_role      text,
  sender_name      text,
  body             text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at);

-- Membership check used by every policy (SECURITY DEFINER so it can't recurse).
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members m
     WHERE m.conversation_id = p_conv
       AND (m.auth_id = auth.uid() OR m.hospital_id IN (SELECT public.my_staff_hospital_ids()))
  )
$$;

-- The caller's own member row in a thread (person first, then their hospital inbox).
CREATE OR REPLACE FUNCTION public.my_member_id(p_conv uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM public.conversation_members m
   WHERE m.conversation_id = p_conv
     AND (m.auth_id = auth.uid() OR m.hospital_id IN (SELECT public.my_staff_hospital_ids()))
   ORDER BY (m.auth_id IS NULL)
   LIMIT 1
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.conversations, public.conversation_members, public.messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.conversations, public.conversation_members FROM authenticated;
REVOKE UPDATE, DELETE ON public.messages FROM authenticated;
GRANT SELECT ON public.conversations, public.conversation_members, public.messages TO authenticated;
GRANT INSERT ON public.messages TO authenticated;

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS members_select ON public.conversation_members;
CREATE POLICY members_select ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_conversation_member(conversation_id)
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.status = 'open')
  );

-- Stamp who sent it from the member row -- never trusted from the client.
CREATE OR REPLACE FUNCTION public.stamp_message_sender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member public.conversation_members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM public.conversation_members WHERE id = public.my_member_id(NEW.conversation_id);
  IF v_member.id IS NULL THEN RAISE EXCEPTION 'Not a member of this conversation' USING ERRCODE = '42501'; END IF;
  NEW.sender_member_id := v_member.id;
  NEW.sender_auth_id   := auth.uid();
  NEW.sender_role      := v_member.role;
  NEW.sender_name      := v_member.display_name;
  NEW.body             := btrim(NEW.body);
  NEW.created_at       := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_stamp_sender ON public.messages;
CREATE TRIGGER messages_stamp_sender BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_message_sender();

CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  UPDATE public.conversation_members SET last_read_at = NEW.created_at WHERE id = NEW.sender_member_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- ── RPCs ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conv uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.conversation_members SET last_read_at = now() WHERE id = public.my_member_id(p_conv)
$$;

CREATE OR REPLACE FUNCTION public.set_conversation_status(p_conv uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('open', 'closed') OR NOT public.is_conversation_member(p_conv) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conversations SET status = p_status WHERE id = p_conv;
END;
$$;

-- Start (or reopen the existing open) thread with someone the caller is entitled to
-- message. p_target_type: 'doctor' (doctors.id) | 'patient' (users.id) |
-- 'hospital' (hospitals.id) | 'crew' (users.id of a fleet crew member).
CREATE OR REPLACE FUNCTION public.start_conversation(p_target_type text, p_target uuid, p_appointment uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_me   public.users%ROWTYPE;
  v_my_doctor  public.doctors%ROWTYPE;
  v_my_hosp    uuid;
  v_is_crew    boolean;
  v_kind text;
  a_auth uuid; a_hosp uuid; a_role text; a_name text; a_avatar text;   -- side A (caller)
  b_auth uuid; b_hosp uuid; b_role text; b_name text; b_avatar text;   -- side B (target)
  v_conv uuid;
  r record;
BEGIN
  IF v_auth IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_me FROM public.users WHERE auth_id = v_auth;
  SELECT * INTO v_my_doctor FROM public.doctors
   WHERE is_active AND (auth_user_id = v_auth OR (v_me.id IS NOT NULL AND user_id = v_me.id))
   ORDER BY created_at LIMIT 1;
  SELECT hospital_id INTO v_my_hosp FROM public.my_staff_hospital_ids() AS hospital_id LIMIT 1;
  v_is_crew := EXISTS (SELECT 1 FROM public.ambulance_crew WHERE user_id = v_me.id AND is_active)
            OR EXISTS (SELECT 1 FROM public.hospital_admins WHERE user_id = v_me.id AND is_active AND role = 'ambulance_crew');

  -- Caller side
  IF v_my_doctor.id IS NOT NULL AND p_target_type IN ('patient', 'hospital') THEN
    a_auth := v_auth; a_role := 'doctor'; a_name := 'Dr. ' || regexp_replace(v_my_doctor.full_name, '^Dr\.?\s*', ''); a_avatar := v_my_doctor.avatar_url;
  ELSIF v_my_hosp IS NOT NULL AND p_target_type IN ('patient', 'doctor', 'crew') THEN
    a_hosp := v_my_hosp; a_role := 'hospital'; SELECT name, logo_url INTO a_name, a_avatar FROM public.hospitals WHERE id = v_my_hosp;
  ELSIF v_is_crew AND p_target_type = 'hospital' THEN
    a_auth := v_auth; a_role := 'crew'; a_name := v_me.full_name || ' (ambulance)'; a_avatar := v_me.avatar_url;
  ELSIF v_me.id IS NOT NULL AND p_target_type IN ('doctor', 'hospital') THEN
    a_auth := v_auth; a_role := 'patient'; a_name := v_me.full_name; a_avatar := v_me.avatar_url;
  ELSE
    RAISE EXCEPTION 'You can''t start this conversation' USING ERRCODE = '42501';
  END IF;

  -- Target side + relationship check
  IF p_target_type = 'doctor' THEN
    SELECT d.full_name, d.avatar_url, coalesce(d.auth_user_id, u.auth_id) INTO b_name, b_avatar, b_auth
      FROM public.doctors d LEFT JOIN public.users u ON u.id = d.user_id WHERE d.id = p_target AND d.is_active;
    IF b_auth IS NULL THEN RAISE EXCEPTION 'This doctor can''t receive messages yet' USING ERRCODE = 'P0001'; END IF;
    b_role := 'doctor'; b_name := 'Dr. ' || regexp_replace(b_name, '^Dr\.?\s*', '');
    IF a_role = 'patient' THEN
      v_kind := 'patient_doctor';
      IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE doctor_id = p_target AND patient_id IN (SELECT public.current_patient_ids())) THEN
        RAISE EXCEPTION 'You can message a doctor after booking with them' USING ERRCODE = '42501';
      END IF;
    ELSE -- hospital -> its doctor
      v_kind := 'doctor_hospital';
      IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE id = p_target AND hospital_id = a_hosp) THEN
        RAISE EXCEPTION 'That doctor isn''t linked to your hospital' USING ERRCODE = '42501';
      END IF;
    END IF;

  ELSIF p_target_type = 'patient' THEN
    SELECT auth_id, full_name, avatar_url INTO b_auth, b_name, b_avatar FROM public.users WHERE id = p_target;
    IF b_auth IS NULL THEN RAISE EXCEPTION 'This patient can''t receive messages' USING ERRCODE = 'P0001'; END IF;
    b_role := 'patient';
    IF a_role = 'doctor' THEN
      v_kind := 'patient_doctor';
      IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = p_target AND doctor_id IN (SELECT public.current_doctor_ids())) THEN
        RAISE EXCEPTION 'You can only message your own patients' USING ERRCODE = '42501';
      END IF;
    ELSE
      v_kind := 'patient_hospital';
      IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = p_target AND hospital_id = a_hosp) THEN
        RAISE EXCEPTION 'This patient has no visit at your hospital' USING ERRCODE = '42501';
      END IF;
    END IF;

  ELSIF p_target_type = 'hospital' THEN
    SELECT name, logo_url INTO b_name, b_avatar FROM public.hospitals WHERE id = p_target AND is_active;
    IF b_name IS NULL THEN RAISE EXCEPTION 'Hospital not found' USING ERRCODE = 'P0001'; END IF;
    b_hosp := p_target; b_role := 'hospital';
    IF a_role = 'patient' THEN
      v_kind := 'patient_hospital';
      IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE hospital_id = p_target AND patient_id IN (SELECT public.current_patient_ids())) THEN
        RAISE EXCEPTION 'You can message a hospital after booking there' USING ERRCODE = '42501';
      END IF;
    ELSIF a_role = 'doctor' THEN
      v_kind := 'doctor_hospital';
      IF NOT EXISTS (SELECT 1 FROM public.doctors WHERE hospital_id = p_target AND id IN (SELECT public.current_doctor_ids())) THEN
        RAISE EXCEPTION 'You aren''t linked to that hospital' USING ERRCODE = '42501';
      END IF;
    ELSE
      v_kind := 'crew_hospital';  -- crews may contact any active hospital (handover, directions)
    END IF;

  ELSIF p_target_type = 'crew' THEN
    SELECT u.auth_id, u.full_name || ' (ambulance)', u.avatar_url INTO b_auth, b_name, b_avatar
      FROM public.users u JOIN public.hospital_admins ha ON ha.user_id = u.id
     WHERE u.id = p_target AND ha.hospital_id = a_hosp AND ha.role = 'ambulance_crew' AND ha.is_active;
    IF b_auth IS NULL THEN RAISE EXCEPTION 'That crew member isn''t in your fleet' USING ERRCODE = '42501'; END IF;
    b_role := 'crew'; v_kind := 'crew_hospital';
  ELSE
    RAISE EXCEPTION 'Unknown target' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse an open thread between exactly these two sides.
  SELECT c.id INTO v_conv FROM public.conversations c
   WHERE c.kind = v_kind AND c.status = 'open'
     AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id
                  AND m.auth_id IS NOT DISTINCT FROM a_auth AND m.hospital_id IS NOT DISTINCT FROM a_hosp)
     AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id
                  AND m.auth_id IS NOT DISTINCT FROM b_auth AND m.hospital_id IS NOT DISTINCT FROM b_hosp)
   LIMIT 1;
  IF v_conv IS NOT NULL THEN RETURN v_conv; END IF;

  INSERT INTO public.conversations (kind, appointment_id, created_by) VALUES (v_kind, p_appointment, v_auth) RETURNING id INTO v_conv;
  INSERT INTO public.conversation_members (conversation_id, auth_id, hospital_id, role, display_name, avatar_url, last_read_at)
  VALUES (v_conv, a_auth, a_hosp, a_role, coalesce(a_name, 'Queue user'), a_avatar, now()),
         (v_conv, b_auth, b_hosp, b_role, coalesce(b_name, 'Queue user'), b_avatar, NULL);
  RETURN v_conv;
END;
$$;

REVOKE ALL ON FUNCTION public.start_conversation(text, uuid, uuid), public.mark_conversation_read(uuid),
  public.set_conversation_status(uuid, text), public.is_conversation_member(uuid), public.my_member_id(uuid),
  public.my_staff_hospital_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_conversation(text, uuid, uuid), public.mark_conversation_read(uuid),
  public.set_conversation_status(uuid, text), public.is_conversation_member(uuid), public.my_member_id(uuid),
  public.my_staff_hospital_ids() TO authenticated;

-- Live updates in the chat screen.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
