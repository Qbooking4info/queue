// queue-all-apps.jsx
//
// A single self-contained mockup of all four Queue apps (Patient, Doctor,
// Hospital, Ambulance) side by side, using the exact MD3 color tokens from
// packages/shared/contexts/ThemeContext.tsx (all 4 theme combinations:
// Forest/Clinical x Light/Dark). Plain React, no external UI libraries or
// CSS frameworks -- drop this into any React project (Vite, CRA, etc.) and
// render <QueueAllApps /> to browse every app/screen/theme combination.
//
// This is a VISUAL REFERENCE only -- static mock data, no real navigation,
// no backend calls. It mirrors the shape and content of the real screens
// closely enough to use as a design handoff / style-guide artifact.

import { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────
// Theme tokens -- copied verbatim from packages/shared/contexts/ThemeContext.tsx
// ─────────────────────────────────────────────────────────────────────────

const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  font: { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 30, display: 44 },
}

const forestLight = {
  ...scale, id: 'forest', mode: 'light',
  canvasBg: '#EAEEEA', cardBg: '#F6FBF4', cardBorder: '#BFC9BF',
  accent: '#006D3E', onAccent: '#FFFFFF', accentDark: '#006D3E',
  accentBg: 'rgba(0,109,62,0.12)', accentBgMid: 'rgba(0,109,62,0.08)', accentBorder: 'rgba(0,109,62,0.28)',
  textPrimary: '#181D19', textSecondary: '#404943', textMuted: '#404943',
  danger: '#BA1A1A', info: '#1D4ED8',
  dangerBg: 'rgba(186,26,26,0.14)', dangerSubtle: 'rgba(186,26,26,0.1)', dangerBorder: 'rgba(186,26,26,0.3)',
  infoBg: 'rgba(29,78,216,0.14)', infoBorder: 'rgba(29,78,216,0.3)',
  statusOpen: { bg: '#9EF5BC', text: '#002112', border: 'rgba(0,109,62,0.28)' },
  statusBusy: { bg: '#FEF3C7', text: '#451A03', border: 'rgba(180,83,9,0.28)' },
  statusVirtual: { bg: '#C2E8FD', text: '#001F2B', border: 'rgba(62,99,116,0.28)' },
  statusCancelled: { bg: '#FFDAD6', text: '#410002', border: 'rgba(186,26,26,0.28)' },
  statusApproval: { bg: '#EDE9FE', text: '#2D1B69', border: 'rgba(109,40,217,0.28)' },
  statusProgress: { bg: '#CFF0DC', text: '#0A1F14', border: 'rgba(77,99,86,0.28)' },
  statusNeutral: { bg: '#DCE5DB', text: '#404943', border: '#BFC9BF' },
  bannerBg: '#003D24', bannerBorder: 'rgba(0,109,62,0.28)',
  inputBg: '#E4E9E4', inputBorder: '#707973', starColor: '#B45309',
  accentContainer: '#9EF5BC', onAccentContainer: '#002112',
  dangerContainer: '#FFDAD6', onDangerContainer: '#410002', onDanger: '#FFFFFF',
}

const forestDark = {
  ...scale, id: 'forest', mode: 'dark',
  canvasBg: '#1A201A', cardBg: '#0F1410', cardBorder: '#404943',
  accent: '#7EDBA0', onAccent: '#00391F', accentDark: '#7EDBA0',
  accentBg: 'rgba(126,219,160,0.14)', accentBgMid: 'rgba(126,219,160,0.10)', accentBorder: 'rgba(126,219,160,0.28)',
  textPrimary: '#DEE4DE', textSecondary: '#BFC9BF', textMuted: '#BFC9BF',
  danger: '#FFB4AB', info: '#93C5FD',
  dangerBg: 'rgba(255,180,171,0.16)', dangerSubtle: 'rgba(255,180,171,0.12)', dangerBorder: 'rgba(255,180,171,0.32)',
  infoBg: 'rgba(147,197,253,0.16)', infoBorder: 'rgba(147,197,253,0.32)',
  statusOpen: { bg: '#005230', text: '#9EF5BC', border: 'rgba(126,219,160,0.28)' },
  statusBusy: { bg: '#452B00', text: '#FBD06A', border: 'rgba(251,208,106,0.28)' },
  statusVirtual: { bg: '#244C5D', text: '#C2E8FD', border: 'rgba(166,205,217,0.28)' },
  statusCancelled: { bg: '#93000A', text: '#FFDAD6', border: 'rgba(255,180,171,0.28)' },
  statusApproval: { bg: '#2D1B69', text: '#EDE9FE', border: 'rgba(196,181,253,0.28)' },
  statusProgress: { bg: '#354B3F', text: '#CFF0DC', border: 'rgba(179,204,188,0.28)' },
  statusNeutral: { bg: '#404943', text: '#BFC9BF', border: '#404943' },
  bannerBg: '#002112', bannerBorder: 'rgba(126,219,160,0.28)',
  inputBg: '#1A201A', inputBorder: '#404943', starColor: '#FBD06A',
  accentContainer: '#005230', onAccentContainer: '#9EF5BC',
  dangerContainer: '#93000A', onDangerContainer: '#FFDAD6', onDanger: '#690005',
}

const clinicalLight = {
  ...scale, id: 'clinical', mode: 'light',
  canvasBg: '#ECEEF4', cardBg: '#F8F9FF', cardBorder: '#C3C6CF',
  accent: '#005DB8', onAccent: '#FFFFFF', accentDark: '#005DB8',
  accentBg: 'rgba(0,93,184,0.12)', accentBgMid: 'rgba(0,93,184,0.08)', accentBorder: 'rgba(0,93,184,0.30)',
  textPrimary: '#191C20', textSecondary: '#43474E', textMuted: '#43474E',
  danger: '#BA1A1A', info: '#1D4ED8',
  dangerBg: 'rgba(186,26,26,0.14)', dangerSubtle: 'rgba(186,26,26,0.1)', dangerBorder: 'rgba(186,26,26,0.3)',
  infoBg: 'rgba(29,78,216,0.14)', infoBorder: 'rgba(29,78,216,0.3)',
  statusOpen: { bg: '#D5E3FF', text: '#001B3D', border: 'rgba(0,93,184,0.28)' },
  statusBusy: { bg: '#FEF3C7', text: '#451A03', border: 'rgba(180,83,9,0.28)' },
  statusVirtual: { bg: '#F5D9FF', text: '#261430', border: 'rgba(109,86,116,0.28)' },
  statusCancelled: { bg: '#FFDAD6', text: '#410002', border: 'rgba(186,26,26,0.28)' },
  statusApproval: { bg: '#EDE9FE', text: '#2D1B69', border: 'rgba(109,40,217,0.28)' },
  statusProgress: { bg: '#D8E3F8', text: '#111C2B', border: 'rgba(84,95,113,0.28)' },
  statusNeutral: { bg: '#DFE2EB', text: '#43474E', border: '#C3C6CF' },
  bannerBg: '#001C42', bannerBorder: 'rgba(0,93,184,0.30)',
  inputBg: '#E6E8EE', inputBorder: '#73777F', starColor: '#B45309',
  accentContainer: '#D5E3FF', onAccentContainer: '#001B3D',
  dangerContainer: '#FFDAD6', onDangerContainer: '#410002', onDanger: '#FFFFFF',
}

const clinicalDark = {
  ...scale, id: 'clinical', mode: 'dark',
  canvasBg: '#1C1E24', cardBg: '#111318', cardBorder: '#43474E',
  accent: '#A8C8FF', onAccent: '#00306A', accentDark: '#A8C8FF',
  accentBg: 'rgba(168,200,255,0.14)', accentBgMid: 'rgba(168,200,255,0.10)', accentBorder: 'rgba(168,200,255,0.30)',
  textPrimary: '#E2E2E9', textSecondary: '#C3C6CF', textMuted: '#C3C6CF',
  danger: '#FFB4AB', info: '#93C5FD',
  dangerBg: 'rgba(255,180,171,0.16)', dangerSubtle: 'rgba(255,180,171,0.12)', dangerBorder: 'rgba(255,180,171,0.32)',
  infoBg: 'rgba(147,197,253,0.16)', infoBorder: 'rgba(147,197,253,0.32)',
  statusOpen: { bg: '#00469A', text: '#D5E3FF', border: 'rgba(168,200,255,0.28)' },
  statusBusy: { bg: '#452B00', text: '#FBD06A', border: 'rgba(251,208,106,0.28)' },
  statusVirtual: { bg: '#553C5C', text: '#F5D9FF', border: 'rgba(218,189,228,0.28)' },
  statusCancelled: { bg: '#93000A', text: '#FFDAD6', border: 'rgba(255,180,171,0.28)' },
  statusApproval: { bg: '#2D1B69', text: '#EDE9FE', border: 'rgba(196,181,253,0.28)' },
  statusProgress: { bg: '#3C4758', text: '#D8E3F8', border: 'rgba(187,199,220,0.28)' },
  statusNeutral: { bg: '#43474E', text: '#C3C6CF', border: '#43474E' },
  bannerBg: '#001B3D', bannerBorder: 'rgba(168,200,255,0.28)',
  inputBg: '#1C1E24', inputBorder: '#43474E', starColor: '#FBD06A',
  accentContainer: '#00469A', onAccentContainer: '#D5E3FF',
  dangerContainer: '#93000A', onDangerContainer: '#FFDAD6', onDanger: '#690005',
}

const THEMES = {
  'forest-light': forestLight, 'forest-dark': forestDark,
  'clinical-light': clinicalLight, 'clinical-dark': clinicalDark,
}

// Vivid per-person avatar palette (packages/shared/lib/adapters.ts)
const AVATAR_BG = ['#006D3E', '#005DB8', '#7B4100', '#4B3694', '#B45309', '#0E7490']
function bgFromName(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}
function initialsOf(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: bgFromName(name), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.34, letterSpacing: -0.2,
    }}>
      {initialsOf(name)}
    </div>
  )
}

function Badge({ t, tone = 'statusNeutral', children }) {
  const c = t[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: t.radius.pill, padding: '4px 10px',
      fontSize: t.font.xs, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function Card({ t, children, style }) {
  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.cardBorder}`,
      borderRadius: t.radius.lg, padding: t.spacing.lg,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', ...style,
    }}>
      {children}
    </div>
  )
}

function Button({ t, children, variant = 'solid', onClick, style }) {
  const base = {
    border: 'none', borderRadius: t.radius.pill, padding: '12px 20px',
    fontSize: t.font.md, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
  }
  const variants = {
    solid: { background: t.accent, color: t.onAccent },
    danger: { background: t.danger, color: t.onDanger },
    outline: { background: 'transparent', color: t.textPrimary, border: `1.5px solid ${t.cardBorder}` },
  }
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  )
}

function ScreenHeader({ t, eyebrow, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: t.spacing.lg }}>
      <div>
        {eyebrow && <div style={{ fontSize: t.font.sm, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{eyebrow}</div>}
        <div style={{ fontSize: t.font.hero, fontWeight: 800, color: t.textPrimary, letterSpacing: -0.5 }}>{title}</div>
      </div>
      {right}
    </div>
  )
}

function Row({ t, icon, label, value, chevron = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
      borderBottom: `1px solid ${t.cardBorder}`,
    }}>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      <span style={{ flex: 1, fontSize: t.font.md, fontWeight: 600, color: t.textPrimary }}>{label}</span>
      {value && <span style={{ fontSize: t.font.base, color: t.textMuted }}>{value}</span>}
      {chevron && <span style={{ color: t.textMuted }}>›</span>}
    </div>
  )
}

function TabBar({ t, tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', background: t.cardBg, borderTop: `1px solid ${t.cardBorder}`,
      padding: '8px 6px', gap: 2,
    }}>
      {tabs.map((tab, i) => {
        const focused = i === active
        return (
          <button key={tab.label} onClick={() => onChange(i)} style={{
            flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0',
          }}>
            <div style={{
              width: 44, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: focused ? t.accentContainer : 'transparent', fontSize: 15,
            }}>
              {tab.icon}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: focused ? t.textPrimary : t.textMuted }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { icon: '🫀', label: 'Cardiology' }, { icon: '🦴', label: 'Orthopedics' },
  { icon: '🧠', label: 'Neurology' }, { icon: '👶', label: 'Pediatrics' },
  { icon: '🦷', label: 'Dental' }, { icon: '👁️', label: 'Eye Care' },
]

const HOSPITALS = [
  { name: 'St. Mary General Hospital', spec: 'Multi-specialty', wait: '15 min', rating: 4.6, virtual: true },
  { name: 'Grace Valley Clinic', spec: 'Family Medicine', wait: '32 min', rating: 4.2, virtual: false },
  { name: 'Riverside Children\'s Hospital', spec: 'Pediatrics', wait: '8 min', rating: 4.8, virtual: true },
]

const PATIENT_APPTS = [
  { doctor: 'Dr. Amaka Obi', spec: 'Cardiology', time: 'Today · 2:30 PM', status: 'confirmed', virtual: true },
  { doctor: 'Dr. Femi Balogun', spec: 'Orthopedics', time: 'Tomorrow · 9:00 AM', status: 'pending', virtual: false },
  { doctor: 'Dr. Grace Chen', spec: 'Dermatology', time: 'Sep 12 · 11:15 AM', status: 'completed', virtual: false },
]

const QUEUE_PATIENTS = [
  { name: 'Tunde Bakare', reason: 'Chest pain, shortness of breath', wait: '2 min', emergency: true },
  { name: 'Sarah Johnson', reason: 'Follow-up: hypertension review', wait: '18 min', emergency: false },
  { name: 'Michael Adeyemi', reason: 'Annual physical exam', wait: '26 min', emergency: false },
]

const FLEET_UNITS = [
  { plate: 'LAG-442-KJ', tier: 'ALS', onDuty: true, dispatchable: true },
  { plate: 'LAG-119-XY', tier: 'BLS', onDuty: true, dispatchable: false },
  { plate: 'LAG-880-QT', tier: 'ALS', onDuty: false, dispatchable: false },
]

const STATUS_TONE = { confirmed: 'statusOpen', pending: 'statusBusy', completed: 'statusNeutral', cancelled: 'statusCancelled' }
const STATUS_LABEL = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' }

// ─────────────────────────────────────────────────────────────────────────
// PATIENT APP
// ─────────────────────────────────────────────────────────────────────────

function PatientHome({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} eyebrow="Good afternoon" title="Chidi Eze"
        right={<Avatar name="Chidi Eze" size={40} />} />

      <Card t={t} style={{ background: t.accentContainer, border: 'none', marginBottom: t.spacing.lg }}>
        <div style={{ fontSize: t.font.sm, fontWeight: 700, color: t.onAccentContainer, opacity: 0.8 }}>NEXT APPOINTMENT</div>
        <div style={{ fontSize: t.font.lg, fontWeight: 800, color: t.onAccentContainer, marginTop: 4 }}>Dr. Amaka Obi · Cardiology</div>
        <div style={{ fontSize: t.font.base, color: t.onAccentContainer, opacity: 0.85 }}>Today · 2:30 PM · Video call</div>
      </Card>

      <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Browse specialties</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: t.spacing.lg }}>
        {SPECIALTIES.map(s => (
          <div key={s.label} style={{
            background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: t.radius.md,
            padding: '14px 6px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: t.font.xs, fontWeight: 600, color: t.textPrimary, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Nearby hospitals</div>
      {HOSPITALS.slice(0, 2).map(h => <HospitalTile key={h.name} t={t} h={h} />)}
    </div>
  )
}

function HospitalTile({ t, h }) {
  return (
    <div style={{
      borderRadius: t.radius.md, marginBottom: 12, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', background: t.cardBg,
    }}>
      <div style={{ background: bgFromName(h.name) + '22', borderBottom: `1px solid ${t.cardBorder}`, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar name={h.name} size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{h.name}</div>
          <div style={{ fontSize: t.font.xs, color: t.textMuted }}>{h.spec} · ⭐ {h.rating}</div>
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge t={t} tone="statusOpen">⏱ {h.wait} wait</Badge>
        {h.virtual && <Badge t={t} tone="statusVirtual">📹 Virtual available</Badge>}
      </div>
    </div>
  )
}

function PatientHospitals({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Find care" />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, background: t.inputBg, border: `1px solid ${t.inputBorder}`,
        borderRadius: t.radius.pill, padding: '10px 16px', marginBottom: t.spacing.lg,
      }}>
        <span>🔍</span>
        <span style={{ color: t.textMuted, fontSize: t.font.base }}>Search hospitals, specialties…</span>
      </div>
      {HOSPITALS.map(h => <HospitalTile key={h.name} t={t} h={h} />)}
    </div>
  )
}

function PatientAppointments({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Appointments" />
      {PATIENT_APPTS.map(a => (
        <Card key={a.doctor} t={t} style={{
          marginBottom: 12, borderLeft: `4px solid ${t[STATUS_TONE[a.status]].text}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Avatar name={a.doctor} size={44} />
              <div>
                <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{a.doctor}</div>
                <div style={{ fontSize: t.font.sm, color: t.textMuted }}>{a.spec}</div>
                <div style={{ fontSize: t.font.sm, color: t.textMuted, marginTop: 2 }}>{a.time}{a.virtual ? ' · Video' : ' · In-person'}</div>
              </div>
            </div>
            <Badge t={t} tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          </div>
        </Card>
      ))}
    </div>
  )
}

function PatientAppointmentDetail({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Appointment" />
      <div style={{ background: t.bannerBg, border: `1px solid ${t.bannerBorder}`, borderRadius: t.radius.lg, padding: t.spacing.lg, marginBottom: t.spacing.lg }}>
        <div style={{ fontSize: t.font.xs, fontWeight: 700, color: t.accent, letterSpacing: 0.6 }}>BOOKING ID</div>
        <div style={{ fontSize: t.font.sm, color: t.accent, marginBottom: 14 }}>QB-2026-08841</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Avatar name="Dr. Amaka Obi" size={52} />
          <div>
            <div style={{ fontSize: t.font.lg, fontWeight: 800, color: '#fff' }}>Dr. Amaka Obi</div>
            <div style={{ fontSize: t.font.sm, color: 'rgba(255,255,255,0.6)' }}>Cardiology · Video consultation</div>
          </div>
        </div>
      </div>
      <Card t={t} style={{ marginBottom: 12 }}>
        <Row t={t} icon="📅" label="Date & time" value="Today, 2:30 PM" />
        <Row t={t} icon="📍" label="Location" value="Video call" />
        <Row t={t} icon="💳" label="Payment" value="Covered by plan" chevron={false} />
      </Card>
      <Button t={t} variant="solid" style={{ width: '100%' }}>Join video call</Button>
    </div>
  )
}

function PatientProfile({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Profile" />
      <Card t={t} style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Avatar name="Chidi Eze" size={72} />
        </div>
        <div style={{ fontSize: t.font.title, fontWeight: 800, color: t.textPrimary }}>Chidi Eze</div>
        <div style={{ fontSize: t.font.sm, color: t.textMuted }}>chidi.eze@email.com</div>
      </Card>
      <Card t={t} style={{ padding: '0 16px', marginBottom: 12 }}>
        <Row t={t} icon="🩺" label="Medical history" />
        <Row t={t} icon="👨‍👩‍👧" label="Family members" />
        <Row t={t} icon="🔔" label="Notifications" chevron={false} />
      </Card>
      <Button t={t} variant="danger" style={{ width: '100%' }}>Sign out</Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DOCTOR APP
// ─────────────────────────────────────────────────────────────────────────

function DoctorDashboard({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} eyebrow="Welcome back" title="Dr. Amaka Obi" right={<Avatar name="Dr. Amaka Obi" size={40} />} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: t.spacing.lg }}>
        {[
          { label: 'In queue', value: '6', tone: 'statusVirtual' },
          { label: "Today's visits", value: '14', tone: 'statusOpen' },
        ].map(s => (
          <Card key={s.label} t={t}>
            <div style={{ fontSize: t.font.display * 0.55, fontWeight: 800, color: t[s.tone].text }}>{s.value}</div>
            <div style={{ fontSize: t.font.sm, color: t.textMuted, fontWeight: 600 }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Up next</div>
      {QUEUE_PATIENTS.slice(0, 2).map(p => <QueueCard key={p.name} t={t} p={p} />)}
    </div>
  )
}

function QueueCard({ t, p }) {
  return (
    <Card t={t} style={{
      marginBottom: 10,
      background: p.emergency ? t.dangerSubtle : t.cardBg,
      borderColor: p.emergency ? t.danger : t.cardBorder,
      borderLeft: p.emergency ? `4px solid ${t.danger}` : undefined,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Avatar name={p.name} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{p.name}</span>
            {p.emergency && <Badge t={t} tone="statusCancelled">EMERGENCY</Badge>}
          </div>
          <div style={{ fontSize: t.font.sm, color: t.textMuted }}>{p.reason}</div>
        </div>
        <div style={{ fontSize: t.font.sm, fontWeight: 700, color: p.emergency ? t.danger : t.textMuted }}>{p.wait}</div>
      </div>
    </Card>
  )
}

function DoctorQueue({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Queue" right={<Badge t={t} tone="statusOpen">3 waiting</Badge>} />
      {QUEUE_PATIENTS.map(p => <QueueCard key={p.name} t={t} p={p} />)}
    </div>
  )
}

function DoctorAppointments({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Appointments" />
      {PATIENT_APPTS.map(a => (
        <Card key={a.doctor} t={t} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Avatar name={a.doctor} size={40} />
              <div>
                <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{a.doctor.replace('Dr. ', '')}</div>
                <div style={{ fontSize: t.font.sm, color: t.textMuted }}>{a.time}</div>
              </div>
            </div>
            <Badge t={t} tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          </div>
          {a.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button t={t} variant="outline" style={{ flex: 1, padding: '8px 0' }}>Decline</Button>
              <Button t={t} variant="solid" style={{ flex: 1, padding: '8px 0' }}>Approve</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

function DoctorConsult({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Consultation" />
      <div style={{ background: t.bannerBg, border: `1px solid ${t.bannerBorder}`, borderRadius: t.radius.lg, padding: t.spacing.lg, marginBottom: t.spacing.lg }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Avatar name="Tunde Bakare" size={52} />
          <div>
            <div style={{ fontSize: t.font.lg, fontWeight: 800, color: '#fff' }}>Tunde Bakare</div>
            <div style={{ fontSize: t.font.sm, color: 'rgba(255,255,255,0.6)' }}>Male · 41 yrs · Blood: O+</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Badge t={t} tone="statusProgress">● In Progress</Badge>
        </div>
      </div>
      <Card t={t} style={{ marginBottom: 12 }}>
        <div style={{ fontSize: t.font.sm, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>VITALS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={{ fontSize: t.font.xs, color: t.textMuted }}>Blood pressure</div><div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>128/84</div></div>
          <div><div style={{ fontSize: t.font.xs, color: t.textMuted }}>Heart rate</div><div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>92 bpm</div></div>
        </div>
      </Card>
      <Button t={t} variant="solid" style={{ width: '100%' }}>Save vitals & notes</Button>
    </div>
  )
}

function DoctorProfile({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Profile" />
      <Card t={t} style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Avatar name="Dr. Amaka Obi" size={72} />
        </div>
        <div style={{ fontSize: t.font.title, fontWeight: 800, color: t.textPrimary }}>Dr. Amaka Obi</div>
        <Badge t={t} tone="statusApproval">Cardiology</Badge>
      </Card>
      <Card t={t} style={{ padding: '0 16px' }}>
        <Row t={t} icon="📊" label="Analytics" />
        <Row t={t} icon="🏥" label="Linked hospitals" />
        <Row t={t} icon="⚙️" label="Settings" chevron={false} />
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// HOSPITAL APP (staff/admin)
// ─────────────────────────────────────────────────────────────────────────

function HospitalDashboard({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} eyebrow="St. Mary General" title="Front Desk" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: t.spacing.lg }}>
        {[
          { label: 'Waiting', value: '9', tone: 'statusBusy' },
          { label: 'In progress', value: '4', tone: 'statusProgress' },
          { label: 'Completed', value: '21', tone: 'statusOpen' },
        ].map(s => (
          <Card key={s.label} t={t} style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: t.font.title, fontWeight: 800, color: t[s.tone].text }}>{s.value}</div>
            <div style={{ fontSize: t.font.xs, color: t.textMuted, fontWeight: 600 }}>{s.label}</div>
          </Card>
        ))}
      </div>
      <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Pending approval</div>
      {PATIENT_APPTS.filter(a => a.status === 'pending').map(a => (
        <Card key={a.doctor} t={t} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>Sarah Johnson</div>
              <div style={{ fontSize: t.font.sm, color: t.textMuted }}>Requested {a.doctor} · {a.time}</div>
            </div>
            <Badge t={t} tone="statusBusy">Pending</Badge>
          </div>
        </Card>
      ))}
    </div>
  )
}

function HospitalAppointments({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="All appointments" />
      {PATIENT_APPTS.map(a => (
        <Card key={a.doctor} t={t} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Avatar name={a.doctor} size={40} />
              <div>
                <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{a.doctor}</div>
                <div style={{ fontSize: t.font.sm, color: t.textMuted }}>{a.spec} · {a.time}</div>
              </div>
            </div>
            <Badge t={t} tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          </div>
        </Card>
      ))}
    </div>
  )
}

function HospitalSchedule({ t }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Doctor schedule" />
      <Card t={t}>
        <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Dr. Amaka Obi</div>
        <div style={{ fontSize: t.font.sm, color: t.textMuted, marginBottom: 14 }}>Cardiology · 30 min slots</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {days.map((d, i) => (
            <div key={d} style={{
              flex: 1, minWidth: 52, textAlign: 'center', padding: '10px 4px', borderRadius: t.radius.md,
              background: i === 1 ? t.accentContainer : t.canvasBg,
              border: `1px solid ${i === 1 ? t.accentBorder : t.cardBorder}`,
            }}>
              <div style={{ fontSize: t.font.xs, fontWeight: 700, color: i === 1 ? t.onAccentContainer : t.textMuted }}>{d}</div>
              <div style={{ fontSize: t.font.sm, fontWeight: 700, color: i === 1 ? t.onAccentContainer : t.textPrimary, marginTop: 2 }}>{9 + i}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function HospitalMore({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="More" />
      <Card t={t} style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Avatar name="Front Desk" size={72} />
        </div>
        <div style={{ fontSize: t.font.title, fontWeight: 800, color: t.textPrimary }}>Front Desk Staff</div>
        <div style={{ fontSize: t.font.sm, color: t.textMuted }}>St. Mary General Hospital</div>
      </Card>
      <Card t={t} style={{ padding: '0 16px' }}>
        <Row t={t} icon="👨‍⚕️" label="Manage doctors" />
        <Row t={t} icon="🚑" label="Ambulance requests" />
        <Row t={t} icon="⚙️" label="Hospital settings" chevron={false} />
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AMBULANCE APP
// ─────────────────────────────────────────────────────────────────────────

function AmbulanceCrewHome({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Active job" />
      <Card t={t} style={{ marginBottom: t.spacing.lg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <Badge t={t} tone="statusCancelled">Triage 2</Badge>
          <span style={{ fontSize: t.font.sm, color: t.textMuted }}>QB-AMB-0231</span>
        </div>
        <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.accent, textTransform: 'uppercase', marginBottom: 4 }}>En route to patient</div>
        <div style={{ fontSize: t.font.lg, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Chest pain, difficulty breathing</div>
        <div style={{ fontSize: t.font.sm, color: t.textSecondary, marginBottom: 14 }}>📍 14 Adeola Odeku St, Victoria Island</div>
        <Button t={t} variant="solid" style={{ width: '100%' }}>Mark: Arrived at scene</Button>
      </Card>
      <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginBottom: 10 }}>Pending offers</div>
      <Card t={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Badge t={t} tone="statusBusy">Triage 3</Badge>
          <div style={{ fontSize: t.font.sm, color: t.textPrimary, marginTop: 6 }}>Fall injury, possible fracture</div>
        </div>
        <div style={{ fontSize: t.font.title, fontWeight: 800, color: t.danger }}>18s</div>
      </Card>
    </div>
  )
}

function AmbulanceAdminHome({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Dispatch requests" />
      {[
        { name: 'Unregistered caller', triage: 2, ref: 'QB-AMB-0231' },
        { name: 'Ngozi Umeh', triage: null, ref: 'QB-AMB-0230', scheduled: true },
      ].map(r => (
        <Card key={r.ref} t={t} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Badge t={t} tone={r.triage ? 'statusCancelled' : 'statusVirtual'}>{r.triage ? `Triage ${r.triage}` : 'Scheduled'}</Badge>
            <span style={{ fontSize: t.font.sm, color: t.textMuted }}>{r.ref}</span>
          </div>
          <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary, marginTop: 6 }}>{r.name}</div>
        </Card>
      ))}
    </div>
  )
}

function AmbulanceFleet({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Fleet" />
      {FLEET_UNITS.map(u => (
        <Card key={u.plate} t={t} style={{ marginBottom: 10, borderColor: u.onDuty ? t.accentBorder : t.cardBorder }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: t.font.md, fontWeight: 700, color: t.textPrimary }}>{u.plate}</div>
              <div style={{ fontSize: t.font.sm, color: t.textMuted }}>{u.tier}</div>
            </div>
            <span style={{
              fontSize: t.font.sm, fontWeight: 800, padding: '6px 14px', borderRadius: t.radius.pill,
              background: u.onDuty ? `${t.danger}14` : `${t.accentDark}14`,
              border: `1px solid ${u.onDuty ? t.danger : t.accentDark}55`,
              color: u.onDuty ? t.danger : t.accentDark,
            }}>
              {u.onDuty ? 'Go off duty' : 'Go on duty'}
            </span>
          </div>
          {u.onDuty && (
            <div style={{ marginTop: 8, fontSize: t.font.sm, color: u.dispatchable ? t.accentDark : t.statusBusy.text }}>
              {u.dispatchable ? '● Visible to dispatch' : '● Not dispatchable — stale position'}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

function AmbulanceProfile({ t }) {
  return (
    <div style={{ padding: t.spacing.lg }}>
      <ScreenHeader t={t} title="Profile" />
      <Card t={t} style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <Avatar name="Emeka Okafor" size={72} />
        </div>
        <div style={{ fontSize: t.font.title, fontWeight: 800, color: t.textPrimary }}>Emeka Okafor</div>
        <Badge t={t} tone="statusOpen">Paramedic</Badge>
      </Card>
      <Card t={t} style={{ padding: '0 16px' }}>
        <Row t={t} icon="📋" label="Care tier" value="Advanced (ALS)" chevron={false} />
        <Row t={t} icon="📱" label="Phone" value="+234 801 234 5678" chevron={false} />
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// App registry -- one entry per Queue app, screens + bottom tab bar
// ─────────────────────────────────────────────────────────────────────────

const APPS = {
  patient: {
    label: 'Patient', icon: '🧑',
    tabs: [
      { icon: '🏠', label: 'Home', Screen: PatientHome },
      { icon: '🔍', label: 'Search', Screen: PatientHospitals },
      { icon: '📅', label: 'Appts', Screen: PatientAppointments },
      { icon: '📄', label: 'Detail', Screen: PatientAppointmentDetail },
      { icon: '👤', label: 'Profile', Screen: PatientProfile },
    ],
  },
  doctor: {
    label: 'Doctor', icon: '🩺',
    tabs: [
      { icon: '🏠', label: 'Home', Screen: DoctorDashboard },
      { icon: '📋', label: 'Queue', Screen: DoctorQueue },
      { icon: '📅', label: 'Appts', Screen: DoctorAppointments },
      { icon: '🩺', label: 'Consult', Screen: DoctorConsult },
      { icon: '👤', label: 'Profile', Screen: DoctorProfile },
    ],
  },
  hospital: {
    label: 'Hospital', icon: '🏥',
    tabs: [
      { icon: '🏠', label: 'Home', Screen: HospitalDashboard },
      { icon: '📅', label: 'Appts', Screen: HospitalAppointments },
      { icon: '🗓️', label: 'Schedule', Screen: HospitalSchedule },
      { icon: '⚙️', label: 'More', Screen: HospitalMore },
    ],
  },
  ambulance: {
    label: 'Ambulance', icon: '🚑',
    tabs: [
      { icon: '🚑', label: 'Jobs', Screen: AmbulanceCrewHome },
      { icon: '📻', label: 'Dispatch', Screen: AmbulanceAdminHome },
      { icon: '🚐', label: 'Fleet', Screen: AmbulanceFleet },
      { icon: '👤', label: 'Profile', Screen: AmbulanceProfile },
    ],
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────

export default function QueueAllApps() {
  const [appId, setAppId] = useState('patient')
  const [screenI, setScreenI] = useState(0)
  const [family, setFamily] = useState('forest')
  const [mode, setMode] = useState('dark')

  const t = THEMES[`${family}-${mode}`]
  const app = APPS[appId]
  const tab = app.tabs[Math.min(screenI, app.tabs.length - 1)]
  const Screen = tab.Screen

  function selectApp(id) {
    setAppId(id)
    setScreenI(0)
  }

  return (
    <div style={{
      minHeight: '100vh', background: family === 'forest' && mode === 'dark' ? '#0B0F0B' : '#F0F1F5',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>Queue — All Apps</h1>
        <p style={{ fontSize: 14, color: '#9AA39A', margin: '4px 0 0' }}>Patient · Doctor · Hospital · Ambulance — one design system, four themes</p>
      </div>

      {/* App switcher */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Object.entries(APPS).map(([id, a]) => (
          <button key={id} onClick={() => selectApp(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999,
            border: `1.5px solid ${appId === id ? t.accent : '#3A3F3A'}`,
            background: appId === id ? t.accent : 'transparent',
            color: appId === id ? t.onAccent : '#D8DBD8',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            <span>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>

      {/* Theme switcher */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['forest', 'clinical'].map(f => (
            <button key={f} onClick={() => setFamily(f)} style={{
              padding: '6px 14px', borderRadius: 999, border: `1px solid ${family === f ? '#fff' : '#3A3F3A'}`,
              background: family === f ? '#2A2F2A' : 'transparent', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {f === 'forest' ? '🌿 Forest' : '🏥 Clinical'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['light', 'dark'].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 14px', borderRadius: 999, border: `1px solid ${mode === m ? '#fff' : '#3A3F3A'}`,
              background: mode === m ? '#2A2F2A' : 'transparent', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {m === 'light' ? '☀️ Light' : '🌙 Dark'}
            </button>
          ))}
        </div>
      </div>

      {/* Phone frame */}
      <div style={{
        width: 380, borderRadius: 36, border: '10px solid #16181A', background: '#16181A',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{ background: t.canvasBg, height: 700, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Screen t={t} />
          </div>
          <TabBar t={t} tabs={app.tabs} active={screenI} onChange={setScreenI} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#7A8079' }}>
        {app.label} · {tab.label} · {family === 'forest' ? '🌿 Forest' : '🏥 Clinical'} {mode === 'dark' ? 'Dark' : 'Light'}
      </div>
    </div>
  )
}
