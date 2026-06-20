import { createClient } from './web/node_modules/@supabase/supabase-js/dist/index.mjs'

const SUPABASE_URL      = 'https://qzodmkgyzguzzyovjpfx.supabase.co'
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2Rta2d5emd1enp5b3ZqcGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDE0MjY2NiwiZXhwIjoyMDk1NzE4NjY2fQ.sWAGt1x-xylUfntHvD4eCaU2h9giAVidRZYMwABZOsY'

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Specialties ──────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { slug: 'general-practice',    name: 'General Practice',    icon: '🩺' },
  { slug: 'cardiology',          name: 'Cardiology',          icon: '❤️' },
  { slug: 'neurology',           name: 'Neurology',           icon: '🧠' },
  { slug: 'dentistry',           name: 'Dentistry',           icon: '🦷' },
  { slug: 'ophthalmology',       name: 'Ophthalmology',       icon: '👁️' },
  { slug: 'orthopedics',         name: 'Orthopedics',         icon: '🦴' },
  { slug: 'pediatrics',          name: 'Pediatrics',          icon: '👶' },
  { slug: 'ob-gyn',              name: 'OB / GYN',            icon: '🤰' },
  { slug: 'oncology',            name: 'Oncology',            icon: '🧬' },
  { slug: 'pulmonology',         name: 'Pulmonology',         icon: '💨' },
  { slug: 'dermatology',         name: 'Dermatology',         icon: '🧴' },
  { slug: 'ent',                 name: 'ENT',                 icon: '👂' },
  { slug: 'endocrinology',       name: 'Endocrinology',       icon: '💉' },
  { slug: 'mental-health',       name: 'Mental Health',       icon: '🧘' },
  { slug: 'hematology',          name: 'Hematology',          icon: '🩸' },
  { slug: 'nephrology',          name: 'Nephrology',          icon: '🌊' },
  { slug: 'radiology',           name: 'Radiology',           icon: '☢️' },
  { slug: 'physiotherapy',       name: 'Physiotherapy',       icon: '🤸' },
  { slug: 'gastroenterology',    name: 'Gastroenterology',    icon: '🔬' },
  { slug: 'urology',             name: 'Urology',             icon: '💧' },
  { slug: 'fertility',           name: 'Fertility',           icon: '🌱' },
  { slug: 'psychiatry',          name: 'Psychiatry',          icon: '💭' },
  { slug: 'rheumatology',        name: 'Rheumatology',        icon: '💪' },
  { slug: 'general-surgery',     name: 'General Surgery',     icon: '✂️' },
  { slug: 'emergency',           name: 'Emergency',           icon: '🚑' },
]

// ── Hospital definitions ──────────────────────────────────────────────────────

const HOSPITALS = [
  // Lagos
  {
    name: 'Lagos Island General Hospital', slug: 'lagos-island-general',
    address: '1 Hospital Road, Lagos Island', city: 'Lagos Island', state: 'Lagos',
    type: 'hospital', avg_rating: 4.8, review_count: 312, total_bookings: 2800,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 1 460 0000', email: 'info@ligh.gov.ng',
    description: 'Lagos Island General Hospital is one of Nigeria\'s premier multi-specialty hospitals serving Lagos Island and environs.',
    doctors: [
      { full_name: 'Dr. Amaka Osei',      title: 'Dr', qualification: 'MBBS, FMCP',      specialty: 'cardiology',       years_experience: 12, consultation_fee: 15000, virtual_fee: 12000, avg_rating: 4.9, review_count: 148, accepts_virtual: true,  bio: 'Consultant Cardiologist with 12 years experience managing complex cardiac conditions.' },
      { full_name: 'Dr. Emeka Nwosu',     title: 'Dr', qualification: 'MBBS, FMCNeuro',  specialty: 'neurology',        years_experience: 9,  consultation_fee: 18000, virtual_fee: 15000, avg_rating: 4.7, review_count: 97,  accepts_virtual: true,  bio: 'Neurologist specialising in stroke management and epilepsy.' },
      { full_name: 'Dr. Fatima Aliyu',    title: 'Dr', qualification: 'MBBS, FMCPaed',   specialty: 'pediatrics',       years_experience: 7,  consultation_fee: 12000, virtual_fee: 10000, avg_rating: 4.8, review_count: 201, accepts_virtual: true,  bio: 'Paediatrician passionate about child health and development.' },
      { full_name: 'Dr. Sola Adeyemi',    title: 'Dr', qualification: 'MBBS, FMCS',      specialty: 'general-surgery',  years_experience: 14, consultation_fee: 25000, virtual_fee: null,  avg_rating: 4.6, review_count: 83,  accepts_virtual: false, bio: 'General surgeon with expertise in laparoscopic and emergency surgery.' },
    ],
  },
  {
    name: 'Eko Specialist Clinic', slug: 'eko-specialist-clinic',
    address: '12 Broad Street, Lagos Island', city: 'Lagos Island', state: 'Lagos',
    type: 'clinic', avg_rating: 4.6, review_count: 198, total_bookings: 1500,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 1 461 0001', email: 'hello@ekospecialist.com',
    description: 'A leading specialist clinic focusing on cardiology, neurology and internal medicine.',
    doctors: [
      { full_name: 'Dr. Bola Adeyemi',    title: 'Dr', qualification: 'MBBS, FMCP, FACC',  specialty: 'cardiology',    years_experience: 15, consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.6, review_count: 122, accepts_virtual: true,  bio: 'Senior cardiologist with fellowship training in interventional cardiology.' },
      { full_name: 'Dr. Ngozi Eze',       title: 'Dr', qualification: 'MBBS, FMCNeuro',     specialty: 'neurology',     years_experience: 11, consultation_fee: 22000, virtual_fee: 18000, avg_rating: 4.5, review_count: 74,  accepts_virtual: true,  bio: 'Specialist in headache disorders, multiple sclerosis, and movement disorders.' },
      { full_name: 'Dr. Yemi Ogunleye',   title: 'Dr', qualification: 'MBBS, FMCP',         specialty: 'general-practice', years_experience: 8, consultation_fee: 10000, virtual_fee: 8000, avg_rating: 4.7, review_count: 56,  accepts_virtual: true,  bio: 'Family medicine physician providing comprehensive primary care.' },
    ],
  },
  {
    name: 'Victoria Crown Hospital', slug: 'victoria-crown-hospital',
    address: '5 Victoria Island Boulevard, VI', city: 'Victoria Island', state: 'Lagos',
    type: 'hospital', avg_rating: 4.9, review_count: 441, total_bookings: 3100,
    accepts_virtual: false, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 1 462 0002', email: 'care@victoriacrown.com',
    description: 'Victoria Crown Hospital is the leading women and children\'s hospital on the Lagos Island axis.',
    doctors: [
      { full_name: 'Dr. Chioma Okafor',   title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'ob-gyn',         years_experience: 18, consultation_fee: 25000, virtual_fee: null,  avg_rating: 4.9, review_count: 287, accepts_virtual: false, bio: 'Lead Obstetrics & Gynaecology consultant with expertise in high-risk pregnancies.' },
      { full_name: 'Dr. Seun Afolabi',    title: 'Dr', qualification: 'MBBS, FMCPaed',     specialty: 'pediatrics',     years_experience: 8,  consultation_fee: 14000, virtual_fee: 11000, avg_rating: 4.8, review_count: 154, accepts_virtual: true,  bio: 'Paediatric consultant passionate about neonatal care.' },
      { full_name: 'Dr. Kemi Adeneye',    title: 'Dr', qualification: 'MBBS, FMCOG',       specialty: 'fertility',      years_experience: 10, consultation_fee: 30000, virtual_fee: 25000, avg_rating: 4.8, review_count: 98,  accepts_virtual: true,  bio: 'Fertility specialist and reproductive endocrinologist.' },
      { full_name: 'Dr. Priscilla Udo',   title: 'Dr', qualification: 'MBBS, FMCPaed',     specialty: 'pediatrics',     years_experience: 6,  consultation_fee: 12000, virtual_fee: 10000, avg_rating: 4.6, review_count: 61,  accepts_virtual: true,  bio: 'Paediatrician focusing on developmental paediatrics and immunisation.' },
    ],
  },
  {
    name: 'Reddington Hospital', slug: 'reddington-hospital',
    address: '12 Idejo Street, Victoria Island', city: 'Victoria Island', state: 'Lagos',
    type: 'hospital', avg_rating: 4.7, review_count: 289, total_bookings: 2200,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 1 463 0003', email: 'info@reddingtongroupng.com',
    description: 'Reddington Hospital offers world-class multi-specialty care in the heart of Victoria Island.',
    doctors: [
      { full_name: 'Dr. Tunde Akin',      title: 'Dr', qualification: 'MBBS, FMCP, PhD',  specialty: 'oncology',        years_experience: 20, consultation_fee: 35000, virtual_fee: 30000, avg_rating: 4.7, review_count: 113, accepts_virtual: true,  bio: 'Consultant oncologist with subspecialty in breast and haematological malignancies.' },
      { full_name: 'Dr. Kemi Oladele',    title: 'Dr', qualification: 'MBBS, FMCP',        specialty: 'dermatology',     years_experience: 10, consultation_fee: 16000, virtual_fee: 14000, avg_rating: 4.6, review_count: 78,  accepts_virtual: true,  bio: 'Dermatologist specialising in pigmentation disorders, acne, and cosmetic skin care.' },
      { full_name: 'Dr. Gbenga Lawson',   title: 'Dr', qualification: 'MBBS, FMCORL',      specialty: 'ent',             years_experience: 11, consultation_fee: 14000, virtual_fee: 12000, avg_rating: 4.5, review_count: 66,  accepts_virtual: true,  bio: 'ENT surgeon experienced in rhinology, otology, and head-neck oncology.' },
    ],
  },
  {
    name: 'Lagoon Hospital Apapa', slug: 'lagoon-hospital-apapa',
    address: '1 Apapa Road, Apapa', city: 'Apapa', state: 'Lagos',
    type: 'hospital', avg_rating: 4.5, review_count: 231, total_bookings: 1900,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 1 464 0004', email: 'info@lagoonhospitals.com',
    description: 'A leading private hospital providing quality tertiary healthcare in the Apapa corridor.',
    doctors: [
      { full_name: 'Dr. Adaobi Mbachu',   title: 'Dr', qualification: 'MBBS, FMCP',        specialty: 'endocrinology',   years_experience: 9,  consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.5, review_count: 88,  accepts_virtual: true,  bio: 'Endocrinologist managing diabetes, thyroid disorders, and hormonal conditions.' },
      { full_name: 'Dr. Olumide Bello',   title: 'Dr', qualification: 'MBBS, FMCP',        specialty: 'nephrology',      years_experience: 13, consultation_fee: 22000, virtual_fee: 18000, avg_rating: 4.6, review_count: 71,  accepts_virtual: true,  bio: 'Nephrologist specialising in chronic kidney disease and dialysis.' },
      { full_name: 'Dr. Aisha Suleiman',  title: 'Dr', qualification: 'MBBS, FMCPaed',     specialty: 'pediatrics',      years_experience: 7,  consultation_fee: 11000, virtual_fee: 9000,  avg_rating: 4.4, review_count: 53,  accepts_virtual: true,  bio: 'Paediatrician with a special interest in childhood nutrition and growth.' },
      { full_name: 'Dr. Chidi Nwankwo',   title: 'Dr', qualification: 'MBBS, FMCS',        specialty: 'orthopedics',     years_experience: 11, consultation_fee: 20000, virtual_fee: null,  avg_rating: 4.5, review_count: 44,  accepts_virtual: false, bio: 'Orthopaedic surgeon specialising in joint replacement and sports injuries.' },
    ],
  },
  {
    name: 'St. Nicholas Hospital', slug: 'st-nicholas-hospital',
    address: '57 Campbell Street, Lagos Island', city: 'Lagos Island', state: 'Lagos',
    type: 'hospital', avg_rating: 4.6, review_count: 175, total_bookings: 1650,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 1 465 0005', email: 'info@saintnicholashospital.org',
    description: 'One of Lagos\'s oldest and most trusted private hospitals with a rich history of excellence.',
    doctors: [
      { full_name: 'Dr. Nkechi Ibe',      title: 'Dr', qualification: 'MBBS, FMCP',        specialty: 'gastroenterology', years_experience: 10, consultation_fee: 19000, virtual_fee: 16000, avg_rating: 4.6, review_count: 67,  accepts_virtual: true,  bio: 'Gastroenterologist experienced in upper and lower GI endoscopy.' },
      { full_name: 'Dr. Babatunde Oguns', title: 'Dr', qualification: 'MBBS, FMCP',        specialty: 'pulmonology',      years_experience: 8,  consultation_fee: 17000, virtual_fee: 14000, avg_rating: 4.5, review_count: 54,  accepts_virtual: true,  bio: 'Pulmonologist specialising in asthma, COPD, and sleep disorders.' },
      { full_name: 'Dr. Funke Adesanya',  title: 'Dr', qualification: 'MBBS, FMCOG',       specialty: 'ob-gyn',           years_experience: 12, consultation_fee: 22000, virtual_fee: 18000, avg_rating: 4.7, review_count: 103, accepts_virtual: true,  bio: 'Obstetrician and gynaecologist with subspecialty in minimal access surgery.' },
    ],
  },
  {
    name: 'Island Oncology & Specialist Centre', slug: 'island-oncology-centre',
    address: '24 Adeola Odeku, Victoria Island', city: 'Victoria Island', state: 'Lagos',
    type: 'clinic', avg_rating: 4.8, review_count: 119, total_bookings: 780,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 1 466 0006', email: 'care@islandoncology.com',
    description: 'Specialist centre for cancer diagnosis, treatment, and comprehensive oncological care.',
    doctors: [
      { full_name: 'Prof. Adewale Coker',  title: 'Prof', qualification: 'MBBS, FMCP, MRCP', specialty: 'oncology',        years_experience: 22, consultation_fee: 40000, virtual_fee: 35000, avg_rating: 4.9, review_count: 87,  accepts_virtual: true,  bio: 'Professor of Oncology with international training in cancer management.' },
      { full_name: 'Dr. Temitope Alabi',   title: 'Dr',   qualification: 'MBBS, FMCP',        specialty: 'hematology',      years_experience: 9,  consultation_fee: 25000, virtual_fee: 22000, avg_rating: 4.7, review_count: 43,  accepts_virtual: true,  bio: 'Haematologist specialising in blood disorders, leukaemia, and lymphoma.' },
      { full_name: 'Dr. Grace Obi',        title: 'Dr',   qualification: 'MBBS, FMCP',        specialty: 'oncology',        years_experience: 7,  consultation_fee: 25000, virtual_fee: 20000, avg_rating: 4.6, review_count: 31,  accepts_virtual: true,  bio: 'Medical oncologist focusing on gynaecological and gastrointestinal cancers.' },
    ],
  },
  {
    name: 'Lekki Wellness Clinic', slug: 'lekki-wellness-clinic',
    address: '3 Admiralty Way, Lekki Phase 1', city: 'Lekki', state: 'Lagos',
    type: 'clinic', avg_rating: 4.5, review_count: 142, total_bookings: 1100,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 1 467 0007', email: 'hello@lekkiwellness.com',
    description: 'Holistic wellness and preventive care clinic offering executive health screening and mental health services.',
    doctors: [
      { full_name: 'Dr. Ife Okoye',        title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'mental-health',    years_experience: 8,  consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.8, review_count: 94,  accepts_virtual: true,  bio: 'Psychiatrist specialising in anxiety, depression, and burnout management.' },
      { full_name: 'Dr. Chiamaka Nnaji',   title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'general-practice', years_experience: 6,  consultation_fee: 10000, virtual_fee: 8500,  avg_rating: 4.5, review_count: 62,  accepts_virtual: true,  bio: 'Family physician with interest in executive health screening and preventive care.' },
      { full_name: 'Dr. Rotimi Adisa',     title: 'Dr', qualification: 'MBBS, FMCPsych',   specialty: 'psychiatry',       years_experience: 10, consultation_fee: 22000, virtual_fee: 18000, avg_rating: 4.6, review_count: 48,  accepts_virtual: true,  bio: 'Consultant psychiatrist with training in CBT and psychopharmacology.' },
    ],
  },
  // Abuja
  {
    name: 'National Hospital Abuja', slug: 'national-hospital-abuja',
    address: 'Plot 132 Central Business District', city: 'Abuja', state: 'FCT',
    type: 'hospital', avg_rating: 4.4, review_count: 367, total_bookings: 3200,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 9 460 0008', email: 'info@nhaabuja.gov.ng',
    description: 'Nigeria\'s premier federal referral hospital offering advanced medical and surgical care.',
    doctors: [
      { full_name: 'Prof. Musa Ibrahim',   title: 'Prof', qualification: 'MBBS, FMCPath, PhD', specialty: 'hematology',      years_experience: 24, consultation_fee: 20000, virtual_fee: 15000, avg_rating: 4.5, review_count: 127, accepts_virtual: true,  bio: 'Professor of Haematology and pioneer in sickle cell disease management in Nigeria.' },
      { full_name: 'Dr. Ruth Adeleke',     title: 'Dr',   qualification: 'MBBS, FMCP',         specialty: 'endocrinology',   years_experience: 11, consultation_fee: 18000, virtual_fee: 15000, avg_rating: 4.4, review_count: 89,  accepts_virtual: true,  bio: 'Endocrinologist managing diabetes and metabolic bone diseases.' },
      { full_name: 'Dr. Hassan Bello',     title: 'Dr',   qualification: 'MBBS, FMCS',         specialty: 'orthopedics',     years_experience: 15, consultation_fee: 22000, virtual_fee: null,  avg_rating: 4.3, review_count: 74,  accepts_virtual: false, bio: 'Orthopaedic surgeon specialising in spine surgery and trauma.' },
      { full_name: 'Dr. Juliet Okonkwo',   title: 'Dr',   qualification: 'MBBS, FMCOG',        specialty: 'ob-gyn',          years_experience: 9,  consultation_fee: 17000, virtual_fee: 14000, avg_rating: 4.6, review_count: 101, accepts_virtual: true,  bio: 'Obstetric-gynaecology consultant with special interest in reproductive medicine.' },
      { full_name: 'Dr. Usman Garba',      title: 'Dr',   qualification: 'MBBS, FMCNephro',    specialty: 'nephrology',      years_experience: 12, consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.4, review_count: 55,  accepts_virtual: true,  bio: 'Nephrologist running the hospital\'s dialysis and kidney transplant programme.' },
    ],
  },
  {
    name: 'Nisa Premier Hospital', slug: 'nisa-premier-hospital',
    address: 'Plot 1535 Cadastral Zone, Jabi', city: 'Abuja', state: 'FCT',
    type: 'hospital', avg_rating: 4.7, review_count: 203, total_bookings: 1800,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 9 461 0009', email: 'info@nisahospital.com',
    description: 'Nisa Premier Hospital is a modern private hospital providing comprehensive specialist care in Abuja.',
    doctors: [
      { full_name: 'Dr. Comfort Eze',      title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'cardiology',       years_experience: 12, consultation_fee: 22000, virtual_fee: 18000, avg_rating: 4.7, review_count: 86,  accepts_virtual: true,  bio: 'Cardiologist with expertise in echocardiography and heart failure management.' },
      { full_name: 'Dr. Ibrahim Salisu',   title: 'Dr', qualification: 'MBBS, FMCNeuro',   specialty: 'neurology',        years_experience: 8,  consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.6, review_count: 59,  accepts_virtual: true,  bio: 'Neurologist with subspecialty training in neuro-critical care.' },
      { full_name: 'Dr. Hauwa Dantsoho',   title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'dermatology',      years_experience: 6,  consultation_fee: 15000, virtual_fee: 13000, avg_rating: 4.8, review_count: 72,  accepts_virtual: true,  bio: 'Dermatologist with interest in ethnic skin conditions and trichology.' },
    ],
  },
  {
    name: 'Cedarcrest Hospitals', slug: 'cedarcrest-hospitals-abuja',
    address: 'Plot 1289 Louis Farrakhan, Asokoro', city: 'Abuja', state: 'FCT',
    type: 'hospital', avg_rating: 4.8, review_count: 256, total_bookings: 2100,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 9 462 0010', email: 'info@cedarcresthospitals.com',
    description: 'Cedarcrest Hospitals offers world-class healthcare with state-of-the-art diagnostic equipment.',
    doctors: [
      { full_name: 'Dr. Monica Onyekachi', title: 'Dr', qualification: 'MBBS, FMCS, FRCS',  specialty: 'general-surgery',  years_experience: 16, consultation_fee: 30000, virtual_fee: null,  avg_rating: 4.8, review_count: 102, accepts_virtual: false, bio: 'Consultant general surgeon with special interest in laparoscopic and bariatric surgery.' },
      { full_name: 'Dr. Sunday Amadi',     title: 'Dr', qualification: 'MBBS, FMCP',         specialty: 'gastroenterology', years_experience: 10, consultation_fee: 21000, virtual_fee: 18000, avg_rating: 4.7, review_count: 78,  accepts_virtual: true,  bio: 'Gastroenterologist performing therapeutic endoscopic procedures.' },
      { full_name: 'Dr. Blessing Atiku',   title: 'Dr', qualification: 'MBBS, FMCPaed',      specialty: 'pediatrics',       years_experience: 8,  consultation_fee: 14000, virtual_fee: 12000, avg_rating: 4.8, review_count: 91,  accepts_virtual: true,  bio: 'Paediatrician and neonatologist managing premature and critically ill newborns.' },
      { full_name: 'Dr. Andrew Effiong',   title: 'Dr', qualification: 'MBBS, FMCP',         specialty: 'psychiatry',       years_experience: 7,  consultation_fee: 18000, virtual_fee: 15000, avg_rating: 4.6, review_count: 43,  accepts_virtual: true,  bio: 'Psychiatrist with expertise in addiction medicine and mood disorders.' },
    ],
  },
  {
    name: 'Garki Hospital', slug: 'garki-hospital-abuja',
    address: 'Area 3, Garki', city: 'Abuja', state: 'FCT',
    type: 'hospital', avg_rating: 4.2, review_count: 189, total_bookings: 2400,
    accepts_virtual: false, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 9 463 0011', email: 'contact@garkihospital.gov.ng',
    description: 'Garki Hospital is a government facility providing accessible healthcare to FCT residents.',
    doctors: [
      { full_name: 'Dr. Patience Obi',     title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'general-practice', years_experience: 9,  consultation_fee: 6000,  virtual_fee: null,  avg_rating: 4.2, review_count: 98,  accepts_virtual: false, bio: 'Experienced family physician providing primary care for all ages.' },
      { full_name: 'Dr. Yakubu Musa',      title: 'Dr', qualification: 'MBBS, FMCPaed',    specialty: 'pediatrics',       years_experience: 7,  consultation_fee: 7000,  virtual_fee: null,  avg_rating: 4.3, review_count: 67,  accepts_virtual: false, bio: 'Paediatrician providing community child health services.' },
      { full_name: 'Dr. Lami Danladi',     title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'ob-gyn',           years_experience: 11, consultation_fee: 8000,  virtual_fee: null,  avg_rating: 4.1, review_count: 55,  accepts_virtual: false, bio: 'Obstetrician-gynaecologist providing maternal and reproductive health services.' },
    ],
  },
  // Port Harcourt
  {
    name: 'Braithwaite Memorial Specialist Hospital', slug: 'braithwaite-memorial-hospital',
    address: 'Hospital Road, Old GRA', city: 'Port Harcourt', state: 'Rivers',
    type: 'hospital', avg_rating: 4.3, review_count: 221, total_bookings: 2600,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 84 460 0012', email: 'info@bmsh.gov.ng',
    description: 'BMSH is Rivers State\'s premier specialist hospital providing tertiary healthcare in the South-South.',
    doctors: [
      { full_name: 'Dr. Stella Cookey',    title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'cardiology',       years_experience: 13, consultation_fee: 16000, virtual_fee: 13000, avg_rating: 4.4, review_count: 82,  accepts_virtual: true,  bio: 'Cardiologist specialising in hypertension and heart failure management.' },
      { full_name: 'Dr. Christian Amadi',  title: 'Dr', qualification: 'MBBS, FMCS',       specialty: 'general-surgery',  years_experience: 10, consultation_fee: 20000, virtual_fee: null,  avg_rating: 4.2, review_count: 58,  accepts_virtual: false, bio: 'Surgeon with expertise in colorectal, hepatobiliary, and trauma surgery.' },
      { full_name: 'Dr. Joy Weli',         title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'ob-gyn',           years_experience: 8,  consultation_fee: 14000, virtual_fee: 11000, avg_rating: 4.5, review_count: 104, accepts_virtual: true,  bio: 'Obstetrician with experience in complicated obstetric cases and infertility management.' },
      { full_name: 'Dr. Tamuno Ake',       title: 'Dr', qualification: 'MBBS, FMCPaed',    specialty: 'pediatrics',       years_experience: 6,  consultation_fee: 11000, virtual_fee: 9000,  avg_rating: 4.4, review_count: 49,  accepts_virtual: true,  bio: 'Paediatrician passionate about preventive child health.' },
    ],
  },
  {
    name: 'Meridian Hospital', slug: 'meridian-hospital-ph',
    address: '3 Aggrey Road, Port Harcourt', city: 'Port Harcourt', state: 'Rivers',
    type: 'hospital', avg_rating: 4.6, review_count: 143, total_bookings: 1200,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 84 461 0013', email: 'info@meridianhospitalph.com',
    description: 'A modern private hospital offering high-quality specialist care in Port Harcourt.',
    doctors: [
      { full_name: 'Dr. Precious Oparaji', title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'dermatology',      years_experience: 7,  consultation_fee: 14000, virtual_fee: 12000, avg_rating: 4.7, review_count: 61,  accepts_virtual: true,  bio: 'Dermatologist managing acne, eczema, psoriasis, and cosmetic skin concerns.' },
      { full_name: 'Dr. Emeka Orji',       title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'endocrinology',    years_experience: 9,  consultation_fee: 18000, virtual_fee: 15000, avg_rating: 4.5, review_count: 48,  accepts_virtual: true,  bio: 'Endocrinologist with expertise in diabetes care and thyroid disease.' },
      { full_name: 'Dr. Nneka Okoye',      title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'fertility',        years_experience: 11, consultation_fee: 28000, virtual_fee: 24000, avg_rating: 4.7, review_count: 72,  accepts_virtual: true,  bio: 'Fertility specialist helping couples navigate IVF and advanced reproductive treatments.' },
    ],
  },
  {
    name: 'PH Eye & ENT Clinic', slug: 'ph-eye-ent-clinic',
    address: '7 Rumuola Road, Port Harcourt', city: 'Port Harcourt', state: 'Rivers',
    type: 'clinic', avg_rating: 4.7, review_count: 98, total_bookings: 760,
    accepts_virtual: true, emergency_hours: false, is_verified: true, is_active: true,
    phone: '+234 84 462 0014', email: 'info@pheyeent.com',
    description: 'Specialist clinic dedicated to eye care and ENT services using advanced optical and microsurgical technology.',
    doctors: [
      { full_name: 'Dr. Akpobome Toru',    title: 'Dr', qualification: 'MBBS, FMCOphth',   specialty: 'ophthalmology',    years_experience: 12, consultation_fee: 15000, virtual_fee: 12000, avg_rating: 4.8, review_count: 56,  accepts_virtual: true,  bio: 'Ophthalmologist specialising in cataract surgery, glaucoma, and vitreoretinal disease.' },
      { full_name: 'Dr. Goodluck Ejike',   title: 'Dr', qualification: 'MBBS, FMCORL',     specialty: 'ent',              years_experience: 8,  consultation_fee: 13000, virtual_fee: 11000, avg_rating: 4.6, review_count: 44,  accepts_virtual: true,  bio: 'ENT consultant experienced in micro-laryngoscopy, myringoplasty, and sinus surgery.' },
      { full_name: 'Dr. Ifeoma Uzor',      title: 'Dr', qualification: 'MBBS, FMCOphth',   specialty: 'ophthalmology',    years_experience: 6,  consultation_fee: 13000, virtual_fee: 11000, avg_rating: 4.7, review_count: 37,  accepts_virtual: true,  bio: 'Eye care specialist offering comprehensive eye examinations and refractive surgery consultations.' },
    ],
  },
  // Ibadan
  {
    name: 'University College Hospital Ibadan', slug: 'uch-ibadan',
    address: 'Queen Elizabeth II Road, UCH', city: 'Ibadan', state: 'Oyo',
    type: 'hospital', avg_rating: 4.5, review_count: 498, total_bookings: 4100,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 22 460 0015', email: 'info@uch-ibadan.edu.ng',
    description: 'UCH Ibadan is Nigeria\'s oldest university teaching hospital and a leading centre of medical excellence.',
    doctors: [
      { full_name: 'Prof. Olubunmi Ajayi',  title: 'Prof', qualification: 'MBBS, FMCNeuro, PhD', specialty: 'neurology',     years_experience: 26, consultation_fee: 20000, virtual_fee: 17000, avg_rating: 4.7, review_count: 148, accepts_virtual: true,  bio: 'Professor of Neurology renowned for his work in epilepsy and tropical neurological diseases.' },
      { full_name: 'Dr. Adebayo Otutu',     title: 'Dr',   qualification: 'MBBS, FMCS',          specialty: 'orthopedics',   years_experience: 14, consultation_fee: 18000, virtual_fee: null,  avg_rating: 4.4, review_count: 93,  accepts_virtual: false, bio: 'Orthopaedic surgeon with expertise in paediatric orthopaedics and limb reconstruction.' },
      { full_name: 'Dr. Tinuola Ogun',      title: 'Dr',   qualification: 'MBBS, FMCOG',         specialty: 'ob-gyn',        years_experience: 11, consultation_fee: 15000, virtual_fee: 12000, avg_rating: 4.5, review_count: 117, accepts_virtual: true,  bio: 'Consultant obstetrician and gynaecologist with fellowship in maternal-foetal medicine.' },
      { full_name: 'Dr. Segun Ogundele',    title: 'Dr',   qualification: 'MBBS, FMCPaed',       specialty: 'pediatrics',    years_experience: 9,  consultation_fee: 12000, virtual_fee: 10000, avg_rating: 4.6, review_count: 87,  accepts_virtual: true,  bio: 'Paediatrician and neonatologist managing the NICU at UCH.' },
      { full_name: 'Dr. Folake Idowu',      title: 'Dr',   qualification: 'MBBS, FMCP',          specialty: 'hematology',    years_experience: 8,  consultation_fee: 16000, virtual_fee: 13000, avg_rating: 4.5, review_count: 61,  accepts_virtual: true,  bio: 'Haematologist managing sickle cell disease, leukaemia, and bleeding disorders.' },
    ],
  },
  {
    name: 'Adeoyo Maternity Hospital', slug: 'adeoyo-maternity-hospital',
    address: 'Ring Road, Adeoyo', city: 'Ibadan', state: 'Oyo',
    type: 'hospital', avg_rating: 4.3, review_count: 211, total_bookings: 2900,
    accepts_virtual: false, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 22 461 0016', email: 'info@adeoyo.gov.ng',
    description: 'Adeoyo Maternity Hospital is the foremost maternity and women\'s health facility in Oyo State.',
    doctors: [
      { full_name: 'Dr. Yetunde Alao',     title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'ob-gyn',           years_experience: 14, consultation_fee: 10000, virtual_fee: null,  avg_rating: 4.4, review_count: 119, accepts_virtual: false, bio: 'Senior obstetrician managing both routine deliveries and obstetric emergencies.' },
      { full_name: 'Dr. Jumoke Adegoke',   title: 'Dr', qualification: 'MBBS, FMCPaed',    specialty: 'pediatrics',       years_experience: 7,  consultation_fee: 8000,  virtual_fee: null,  avg_rating: 4.3, review_count: 77,  accepts_virtual: false, bio: 'Paediatrician and neonatologist providing newborn care at the hospital.' },
      { full_name: 'Dr. Oluwafemi Oworu',  title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'fertility',        years_experience: 9,  consultation_fee: 15000, virtual_fee: 12000, avg_rating: 4.4, review_count: 56,  accepts_virtual: true,  bio: 'Reproductive endocrinologist offering fertility investigations and treatments.' },
    ],
  },
  // Kano
  {
    name: 'Aminu Kano Teaching Hospital', slug: 'aminu-kano-teaching-hospital',
    address: 'Zaria Road, Kano', city: 'Kano', state: 'Kano',
    type: 'hospital', avg_rating: 4.2, review_count: 334, total_bookings: 3500,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 64 460 0017', email: 'info@akth.gov.ng',
    description: 'AKTH is the largest teaching hospital in northern Nigeria, serving millions across the North.',
    doctors: [
      { full_name: 'Prof. Aliyu Maikudi',   title: 'Prof', qualification: 'MBBS, FMCP, PhD', specialty: 'cardiology',       years_experience: 23, consultation_fee: 15000, virtual_fee: 12000, avg_rating: 4.3, review_count: 131, accepts_virtual: true,  bio: 'Professor of Cardiology and pioneer in cardiovascular disease management in Northern Nigeria.' },
      { full_name: 'Dr. Zainab Ahmad',      title: 'Dr',   qualification: 'MBBS, FMCOG',     specialty: 'ob-gyn',           years_experience: 10, consultation_fee: 10000, virtual_fee: 8000,  avg_rating: 4.4, review_count: 98,  accepts_virtual: true,  bio: 'Obstetrician focused on reducing maternal mortality in Northern Nigeria.' },
      { full_name: 'Dr. Shu\'aibu Umar',   title: 'Dr',   qualification: 'MBBS, FMCPaed',   specialty: 'pediatrics',       years_experience: 8,  consultation_fee: 8000,  virtual_fee: 6500,  avg_rating: 4.2, review_count: 76,  accepts_virtual: true,  bio: 'Paediatrician with interest in malnutrition, malaria, and childhood infectious diseases.' },
      { full_name: 'Dr. Fatima Bashir',     title: 'Dr',   qualification: 'MBBS, FMCP',      specialty: 'endocrinology',    years_experience: 7,  consultation_fee: 12000, virtual_fee: 10000, avg_rating: 4.3, review_count: 54,  accepts_virtual: true,  bio: 'Endocrinologist managing the rising burden of type 2 diabetes in the North.' },
      { full_name: 'Dr. Lawal Sadiya',      title: 'Dr',   qualification: 'MBBS, FMCNeuro',  specialty: 'neurology',        years_experience: 9,  consultation_fee: 14000, virtual_fee: 11000, avg_rating: 4.2, review_count: 42,  accepts_virtual: true,  bio: 'Neurologist managing epilepsy, stroke, and neuro-infections.' },
    ],
  },
  // Enugu
  {
    name: 'ESUT Teaching Hospital Parklane', slug: 'esut-parklane',
    address: 'Parklane Avenue, GRA', city: 'Enugu', state: 'Enugu',
    type: 'hospital', avg_rating: 4.4, review_count: 178, total_bookings: 2100,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 42 460 0018', email: 'info@esutparklane.gov.ng',
    description: 'Parklane Hospital is the premier specialist hospital in Enugu State serving the South-East.',
    doctors: [
      { full_name: 'Dr. Vincent Egwuatu',  title: 'Dr', qualification: 'MBBS, FMCP',       specialty: 'gastroenterology', years_experience: 12, consultation_fee: 14000, virtual_fee: 11000, avg_rating: 4.5, review_count: 68,  accepts_virtual: true,  bio: 'Gastroenterologist specialising in inflammatory bowel disease and hepatology.' },
      { full_name: 'Dr. Adaeze Chukwu',   title: 'Dr', qualification: 'MBBS, FMCPaed',    specialty: 'pediatrics',       years_experience: 8,  consultation_fee: 11000, virtual_fee: 9000,  avg_rating: 4.6, review_count: 81,  accepts_virtual: true,  bio: 'Paediatrician with expertise in paediatric emergency medicine.' },
      { full_name: 'Dr. Obinna Nnaji',     title: 'Dr', qualification: 'MBBS, FMCS',       specialty: 'general-surgery',  years_experience: 13, consultation_fee: 18000, virtual_fee: null,  avg_rating: 4.3, review_count: 55,  accepts_virtual: false, bio: 'General surgeon experienced in abdominal, breast, and endocrine surgery.' },
      { full_name: 'Dr. Ngozi Chime',      title: 'Dr', qualification: 'MBBS, FMCOG',      specialty: 'ob-gyn',           years_experience: 9,  consultation_fee: 13000, virtual_fee: 11000, avg_rating: 4.5, review_count: 73,  accepts_virtual: true,  bio: 'Obstetrician-gynaecologist with special interest in fertility and minimal access surgery.' },
    ],
  },
  // Benin City
  {
    name: 'University of Benin Teaching Hospital', slug: 'ubth-benin',
    address: 'PMB 1111, Ugbowo', city: 'Benin City', state: 'Edo',
    type: 'hospital', avg_rating: 4.3, review_count: 287, total_bookings: 3000,
    accepts_virtual: true, emergency_hours: true, is_verified: true, is_active: true,
    phone: '+234 52 460 0019', email: 'info@ubth.gov.ng',
    description: 'UBTH is one of Nigeria\'s leading federal teaching hospitals serving the South-South and South-East.',
    doctors: [
      { full_name: 'Prof. Osaro Erhabor',  title: 'Prof', qualification: 'MBBS, FMCPath',    specialty: 'hematology',      years_experience: 20, consultation_fee: 18000, virtual_fee: 15000, avg_rating: 4.5, review_count: 112, accepts_virtual: true,  bio: 'Professor of Haematology and internationally recognised blood banking expert.' },
      { full_name: 'Dr. Ini Adeyemi',      title: 'Dr',   qualification: 'MBBS, FMCPaed',    specialty: 'pediatrics',       years_experience: 9,  consultation_fee: 12000, virtual_fee: 10000, avg_rating: 4.4, review_count: 84,  accepts_virtual: true,  bio: 'Paediatric consultant managing the paediatric ward and outpatient clinic.' },
      { full_name: 'Dr. Joseph Osaghae',   title: 'Dr',   qualification: 'MBBS, FMCS',       specialty: 'orthopedics',      years_experience: 12, consultation_fee: 17000, virtual_fee: null,  avg_rating: 4.2, review_count: 63,  accepts_virtual: false, bio: 'Orthopaedic surgeon managing trauma, arthroplasty, and bone infections.' },
      { full_name: 'Dr. Rachael Idehen',   title: 'Dr',   qualification: 'MBBS, FMCOphth',   specialty: 'ophthalmology',    years_experience: 7,  consultation_fee: 13000, virtual_fee: 11000, avg_rating: 4.5, review_count: 49,  accepts_virtual: true,  bio: 'Ophthalmologist with subspecialty in medical retina and low vision rehabilitation.' },
    ],
  },
]

// ── Seed function ─────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Starting seed...\n')

  // 1. Upsert specialties
  console.log('Upserting specialties...')
  const { error: specErr } = await sb.from('specialties').upsert(
    SPECIALTIES.map((s, i) => ({ ...s, is_active: true, sort_order: i + 1 })),
    { onConflict: 'slug' }
  )
  if (specErr) { console.error('Specialty error:', specErr.message); process.exit(1) }
  console.log(`  ✓ ${SPECIALTIES.length} specialties upserted`)

  // Fetch specialty id map
  const { data: specRows } = await sb.from('specialties').select('id, slug')
  const specMap = Object.fromEntries((specRows ?? []).map(s => [s.slug, s.id]))

  // 2. Insert hospitals + doctors
  let totalHospitals = 0
  let totalDoctors   = 0

  for (const h of HOSPITALS) {
    const { doctors: docDefs, ...hospitalData } = h

    // Upsert hospital
    const { data: hospRow, error: hospErr } = await sb
      .from('hospitals')
      .upsert({ ...hospitalData, country: 'Nigeria' }, { onConflict: 'slug' })
      .select('id')
      .single()

    if (hospErr || !hospRow) {
      console.error(`  ✗ Hospital "${hospitalData.name}":`, hospErr?.message)
      continue
    }
    totalHospitals++
    console.log(`  ✓ Hospital: ${hospitalData.name}`)

    // Insert doctors
    for (const d of docDefs) {
      const specialtyId = specMap[d.specialty]
      const { error: docErr } = await sb.from('doctors').insert({
        hospital_id:      hospRow.id,
        full_name:        d.full_name,
        title:            d.title,
        qualification:    d.qualification,
        specialty_id:     specialtyId ?? null,
        consultation_fee: d.consultation_fee,
        virtual_fee:      d.virtual_fee,
        avg_rating:       d.avg_rating,
        review_count:     d.review_count,
        years_experience: d.years_experience,
        accepts_virtual:  d.accepts_virtual,
        is_active:        true,
        bio:              d.bio,
      })
      if (docErr) {
        console.error(`    ✗ Doctor "${d.full_name}":`, docErr.message)
      } else {
        totalDoctors++
        console.log(`    + ${d.full_name} (${d.specialty})`)
      }
    }
  }

  console.log(`\n✅ Seed complete! ${totalHospitals} hospitals, ${totalDoctors} doctors inserted.`)
}

seed().catch(console.error)
