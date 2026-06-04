export const specialties = [
  { icon: '🩺', label: 'General Practice' },
  { icon: '❤️', label: 'Cardiology' },
  { icon: '🧠', label: 'Neurology' },
  { icon: '🦷', label: 'Dentistry' },
  { icon: '👁️', label: 'Ophthalmology' },
  { icon: '🦴', label: 'Orthopedics' },
  { icon: '👶', label: 'Pediatrics' },
  { icon: '🤰', label: 'OB / GYN' },
  { icon: '🧬', label: 'Oncology' },
  { icon: '💨', label: 'Pulmonology' },
  { icon: '🧴', label: 'Dermatology' },
  { icon: '👂', label: 'ENT' },
  { icon: '💉', label: 'Endocrinology' },
  { icon: '🧘', label: 'Mental Health' },
  { icon: '💊', label: 'HIV & PrEP' },
  { icon: '🩸', label: 'Hematology' },
  { icon: '🌊', label: 'Nephrology' },
  { icon: '☢️', label: 'Radiology' },
  { icon: '🤸', label: 'Physiotherapy' },
  { icon: '🦠', label: 'Infectious Disease' },
  { icon: '🌱', label: 'Fertility' },
  { icon: '💧', label: 'Urology' },
  { icon: '🔬', label: 'Gastroenterology' },
  { icon: '🍼', label: 'Neonatology' },
  { icon: '💭', label: 'Psychiatry' },
  { icon: '❤️‍🩹', label: 'Sexual Health' },
  { icon: '🥗', label: 'Nutrition' },
  { icon: '💪', label: 'Rheumatology' },
  { icon: '🚑', label: 'Emergency' },
  // Surgery sub-specialties
  { icon: '✂️', label: 'General Surgery' },
  { icon: '✨', label: 'Plastic Surgery' },
  { icon: '⚡', label: 'Neurosurgery' },
  { icon: '💗', label: 'Cardiothoracic' },
  { icon: '🔩', label: 'Ortho Surgery' },
  { icon: '🎯', label: 'Laparoscopic' },
  { icon: '🧸', label: 'Paediatric Surgery' },
  { icon: '🌐', label: 'Vascular Surgery' },
  { icon: '👅', label: 'Maxillofacial' },
  { icon: '🔦', label: 'Endoscopic Surgery' },
]

export interface Doctor {
  name: string; spec: string; rating: number
  fee: string; avatar: string; exp: string
}

export interface Hospital {
  id: number; name: string; specialty: string
  rating: number; reviews: number; wait: string; distance: string
  tag: string; tagType: string
  avatar: string; avatarBg: string
  services: string[]; virtual: boolean; verified: boolean
  slots: string[]; doctors: Doctor[]
  hmo: string[]; emergencySlots: number
}

export const hospitals: Hospital[] = [
  {
    id: 1, name: 'Lagos Island General', specialty: 'Multi-Specialty',
    rating: 4.8, reviews: 312, wait: '~12 min', distance: '1.2 km',
    tag: 'Open Now', tagType: 'open',
    avatar: 'LIG', avatarBg: '#1A4A32',
    services: ['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'OB/GYN'],
    virtual: true, verified: true,
    slots: ['8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '11:00 AM', '2:00 PM', '4:30 PM'],
    doctors: [
      { name: 'Dr. Amaka Osei',   spec: 'Cardiologist', rating: 4.9, fee: '₦15,000', avatar: 'AO', exp: '12 yrs' },
      { name: 'Dr. Emeka Nwosu',  spec: 'Neurologist',  rating: 4.7, fee: '₦18,000', avatar: 'EN', exp: '9 yrs' },
      { name: 'Dr. Fatima Aliyu', spec: 'Pediatrician', rating: 4.8, fee: '₦12,000', avatar: 'FA', exp: '7 yrs' },
    ],
    hmo: ['NHIS', 'AXA Mansard', 'Hygeia'], emergencySlots: 2,
  },
  {
    id: 2, name: 'Eko Specialist Clinic', specialty: 'Cardiology · Neurology',
    rating: 4.6, reviews: 198, wait: '~25 min', distance: '3.4 km',
    tag: 'Virtual', tagType: 'virtual',
    avatar: 'ESC', avatarBg: '#1A2A4A',
    services: ['Cardiology', 'Neurology', 'Internal Medicine'],
    virtual: true, verified: true,
    slots: ['10:00 AM', '10:30 AM', '1:00 PM', '3:30 PM'],
    doctors: [
      { name: 'Dr. Bola Adeyemi', spec: 'Cardiologist', rating: 4.6, fee: '₦20,000', avatar: 'BA', exp: '15 yrs' },
      { name: 'Dr. Ngozi Eze',    spec: 'Neurologist',  rating: 4.5, fee: '₦22,000', avatar: 'NE', exp: '11 yrs' },
    ],
    hmo: ['Hygeia', 'Leadway'], emergencySlots: 1,
  },
  {
    id: 3, name: 'Victoria Crown Hospital', specialty: 'Women & Children',
    rating: 4.9, reviews: 441, wait: '~8 min', distance: '0.8 km',
    tag: 'Busy', tagType: 'busy',
    avatar: 'VCH', avatarBg: '#3A1A0E',
    services: ['OB/GYN', 'Pediatrics', 'Neonatology', 'Fertility'],
    virtual: false, verified: true,
    slots: ['8:30 AM', '9:00 AM', '12:00 PM', '2:30 PM'],
    doctors: [
      { name: 'Dr. Chioma Okafor', spec: 'OB/GYN',      rating: 4.9, fee: '₦25,000', avatar: 'CO', exp: '18 yrs' },
      { name: 'Dr. Seun Afolabi',  spec: 'Pediatrician', rating: 4.8, fee: '₦14,000', avatar: 'SA', exp: '8 yrs' },
    ],
    hmo: ['NHIS', 'AXA Mansard'], emergencySlots: 3,
  },
  {
    id: 4, name: 'Reddington Hospital', specialty: 'Multi-Specialty',
    rating: 4.7, reviews: 289, wait: '~18 min', distance: '5.1 km',
    tag: 'Open Now', tagType: 'open',
    avatar: 'RDH', avatarBg: '#2A1A40',
    services: ['Cardiology', 'Oncology', 'Surgery', 'Dermatology', 'ENT'],
    virtual: true, verified: true,
    slots: ['9:30 AM', '11:30 AM', '2:00 PM', '4:00 PM'],
    doctors: [
      { name: 'Dr. Tunde Akin',   spec: 'Oncologist',    rating: 4.7, fee: '₦35,000', avatar: 'TA', exp: '20 yrs' },
      { name: 'Dr. Kemi Oladele', spec: 'Dermatologist', rating: 4.6, fee: '₦16,000', avatar: 'KO', exp: '10 yrs' },
    ],
    hmo: ['Hygeia', 'NHIS', 'Reliance HMO'], emergencySlots: 2,
  },
]

export const appointments = [
  { id: 'QUE-00421', hospital: 'Lagos Island General', doctor: 'Dr. Amaka Osei',   spec: 'Cardiology', date: 'Thu, 29 May', time: '9:00 AM',  status: 'confirmed', type: 'in-person', payment: '₦15,500' },
  { id: 'QUE-00398', hospital: 'Victoria Crown',       doctor: 'Dr. Chioma Okafor', spec: 'OB/GYN',    date: 'Mon, 2 Jun',  time: '11:30 AM', status: 'pending',   type: 'virtual',   payment: '₦26,000' },
  { id: 'QUE-00371', hospital: 'Eko Specialist',       doctor: 'Dr. Bola Adeyemi',  spec: 'Cardiology', date: 'Fri, 16 May', time: '10:00 AM', status: 'completed', type: 'virtual',   payment: '₦20,500' },
  { id: 'QUE-00344', hospital: 'Lagos Island General', doctor: 'Dr. Fatima Aliyu',  spec: 'Pediatrics', date: 'Mon, 5 May',  time: '8:30 AM',  status: 'completed', type: 'in-person', payment: '₦12,500' },
]

export const patientProfile = {
  name: 'Adaeze Okonkwo', initials: 'AO',
  dob: '12 Mar 1997', age: 28, gender: 'Female', blood: 'O+', genotype: 'AA',
  phone: '+234 812 345 6789', email: 'adaeze@email.com',
  hmo: 'AXA Mansard', hmoNo: 'HMO-992341',
  allergies: ['Penicillin', 'Sulfa drugs'],
  conditions: ['Mild hypertension'],
  totalBookings: 12, prescriptions: 3, hospitalsUsed: 4, virtualConsults: 2,
}
