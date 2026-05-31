ALTER TABLE hospital_admins DROP CONSTRAINT IF EXISTS hospital_admins_role_check;
ALTER TABLE hospital_admins ADD CONSTRAINT hospital_admins_role_check CHECK (role IN ('admin', 'owner', 'specialist', 'front_desk'));
