export type ServiceGroup = { label: string; services: string[] }

export const CLINIC_SERVICE_GROUPS: ServiceGroup[] = [
  {
    label: 'General / OPD',
    services: [
      'General Outpatient', 'Primary Care', 'Family Medicine',
      'Health Screening', 'Prescription Renewal', 'Doctor Referrals',
    ],
  },
  {
    label: 'Emergency',
    services: [
      'Emergency Care', 'Trauma Care', 'Resuscitation', 'Triage',
      'Acute Illness', 'Minor Injuries', 'First Aid',
    ],
  },
  {
    label: 'Paediatrics',
    services: [
      'Paediatric Care', 'Immunization', 'Child Growth Monitoring',
      'Newborn Care', 'Childhood Illnesses', 'Developmental Assessment',
    ],
  },
  {
    label: 'Cardiology',
    services: [
      'Cardiac Consultation', 'ECG', 'Echocardiography',
      'Hypertension Management', 'Heart Failure Management',
      'Arrhythmia', 'Cholesterol Management',
    ],
  },
  {
    label: 'Orthopaedics',
    services: [
      'Bone & Joint Care', 'Fracture Management', 'Spine Care',
      'Sports Injuries', 'Joint Replacement', 'Arthritis Management',
      'Physiotherapy',
    ],
  },
  {
    label: 'Gynaecology',
    services: [
      'Gynaecological Consultation', 'Family Planning', 'Menstrual Disorders',
      'Cervical Screening', 'Fertility Consultation', 'Menopausal Care',
    ],
  },
  {
    label: 'Antenatal / Obstetrics',
    services: [
      'Antenatal Care', 'Ultrasound Scan', 'Prenatal Vitamins',
      'Labour & Delivery', 'Postnatal Care', 'Breastfeeding Support',
      'High-Risk Pregnancy',
    ],
  },
  {
    label: 'Surgery',
    services: [
      'General Surgery', 'Laparoscopic Surgery', 'Minor Procedures',
      'Wound Care', 'Pre-operative Assessment', 'Post-operative Care',
    ],
  },
  {
    label: 'Haematology',
    services: [
      'Blood Disorders', 'Anaemia Management', 'Sickle Cell Care',
      'Blood Transfusion', 'Coagulation Disorders',
    ],
  },
  {
    label: 'Diagnostics & Lab',
    services: [
      'Laboratory Services', 'Radiology', 'X-Ray', 'Ultrasound',
      'CT Scan', 'MRI', 'Blood Tests', 'Urine Tests',
    ],
  },
  {
    label: 'Mental Health',
    services: [
      'Psychiatric Consultation', 'Counselling', 'Substance Abuse',
      'Depression', 'Anxiety Disorders', 'Child Psychiatry',
    ],
  },
  {
    label: 'Other Specialties',
    services: [
      'Dental Care', 'Ophthalmology', 'ENT', 'Dermatology', 'Urology',
      'Neurology', 'Endocrinology', 'Nephrology', 'Pulmonology',
      'Oncology', 'Occupational Therapy', 'Pharmacy',
      'Nutrition & Dietetics',
    ],
  },
]

export const ALL_CLINIC_SERVICES = CLINIC_SERVICE_GROUPS.flatMap(g => g.services)
