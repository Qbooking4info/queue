'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { getHospitalSettings, updateHospitalSettings, getHospitalHours, updateHospitalHours } from '@/lib/admin-api'
import type { DayHours } from '@/lib/admin-api'
import { HoursEditor } from '@/components/dashboard/HoursEditor'

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: () => void; label: string; sub?: string }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={onChange} style={{ width: 44, height: 24, borderRadius: 99,
        background: value ? C.accent : C.borderMed,
        position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 22 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme: C } = useTheme()
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme: C } = useTheme()
  const { hospital } = useAdmin()

  // Booking policy state
  const [virtual,       setVirtual]       = useState(false)
  const [emergency,     setEmergency]     = useState(false)
  const [approvalMode,  setApprovalMode]  = useState<'auto' | 'manual'>('auto')
  const [requiresRef,   setRequiresRef]   = useState(false)
  const [dailyLimit,    setDailyLimit]    = useState<string>('')
  const [opdFee,        setOpdFee]        = useState<string>('0')
  const [hours,         setHours]         = useState<DayHours[]>([])

  // Location
  const [lat,          setLat]          = useState<string>('')
  const [lng,          setLng]          = useState<string>('')
  const [geoQuery,     setGeoQuery]     = useState('')
  const [geoLoading,   setGeoLoading]   = useState(false)
  const [geoError,     setGeoError]     = useState('')

  // Notification preferences
  const [smsReminder,   setSmsReminder]   = useState(true)
  const [emailReminder, setEmailReminder] = useState(true)

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    if (!hospital?.id) return
    Promise.all([getHospitalSettings(hospital.id), getHospitalHours(hospital.id)]).then(([s, h]) => {
      if (s) {
        setVirtual(s.accepts_virtual ?? false)
        setEmergency(s.emergency_hours ?? false)
        setApprovalMode((s.approval_mode ?? 'auto') as 'auto' | 'manual')
        setRequiresRef(s.requires_referral ?? false)
        setDailyLimit(s.daily_booking_limit != null ? String(s.daily_booking_limit) : '')
        setOpdFee(String(s.opd_fee ?? 0))
        if (s.latitude  != null) setLat(String(s.latitude))
        if (s.longitude != null) setLng(String(s.longitude))
      }
      setHours(h)
      setLoading(false)
    })
  }, [hospital?.id])

  async function geocodeAddress() {
    const q = geoQuery.trim() || `${hospital?.name ?? ''} ${hospital?.city ?? ''} ${hospital?.state ?? ''}`
    if (!q) return
    setGeoLoading(true); setGeoError('')
    try {
      const res  = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json() as { lat: string; lon: string } | null
      if (!data) { setGeoError('Address not found — try a more specific query'); return }
      setLat(parseFloat(data.lat).toFixed(6))
      setLng(parseFloat(data.lon).toFixed(6))
    } catch {
      setGeoError('Network error — check your connection')
    } finally {
      setGeoLoading(false)
    }
  }

  async function handleSave() {
    if (!hospital?.id) return
    setSaving(true); setSaveErr('')
    const parsedLat = lat ? parseFloat(lat) : null
    const parsedLng = lng ? parseFloat(lng) : null
    const [{ error }, { error: hoursError }] = await Promise.all([
      updateHospitalSettings(hospital.id, {
        accepts_virtual:     virtual,
        emergency_hours:     emergency,
        approval_mode:       approvalMode,
        requires_referral:   requiresRef,
        daily_booking_limit: dailyLimit ? parseInt(dailyLimit) : null,
        opd_fee:             parseInt(opdFee) || 0,
        ...(parsedLat != null && parsedLng != null ? { latitude: parsedLat, longitude: parsedLng } : {}),
      }),
      updateHospitalHours(hospital.id, hours),
    ])
    setSaving(false)
    if (error || hoursError) { setSaveErr(error ?? hoursError ?? 'Failed to save'); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em',
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Hospital Settings</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Manage hospital profile and booking policies</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>Loading settings…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left column: Profile + Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Profile (read-only) */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Hospital Profile</div>
            {[
              { label: 'Hospital Name',    value: hospital?.name ?? '—' },
              { label: 'Type',             value: hospital?.type ?? '—' },
              { label: 'Registration No.', value: hospital?.registration_number ?? '—' },
              { label: 'Contact Email',    value: hospital?.email ?? '—' },
              { label: 'Phone',            value: hospital?.phone ?? '—' },
              { label: 'City / State',     value: hospital ? `${hospital.city}, ${hospital.state}` : '—' },
              { label: 'Verified',         value: hospital?.is_verified ? '✓ Verified' : '⏳ Pending verification' },
              { label: 'Clinic Model',     value: hospital?.clinic_model === 'multi' ? '🏢 Multi-clinic' : '🏥 Single clinic' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <div style={{ ...labelStyle }}>{f.label}</div>
                <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Hospital Location */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Hospital Location</div>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
              Coordinates let patients see your clinic on the map and get directions. Search your address or enter them manually.
            </div>

            {/* Address search */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Search Address</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={geoQuery}
                  onChange={e => setGeoQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && geocodeAddress()}
                  placeholder={`${hospital?.name ?? ''}, ${hospital?.city ?? ''}, Nigeria`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={geocodeAddress} disabled={geoLoading}
                  style={{ padding: '9px 14px', borderRadius: 10, border: 'none',
                    background: C.accent, color: '#fff', fontSize: 12, fontWeight: 700,
                    cursor: geoLoading ? 'not-allowed' : 'pointer', opacity: geoLoading ? 0.6 : 1,
                    whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                  {geoLoading ? '…' : 'Find'}
                </button>
              </div>
              {geoError && (
                <div style={{ fontSize: 11, color: '#f07070', marginTop: 5 }}>{geoError}</div>
              )}
            </div>

            {/* Coordinate fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Latitude</label>
                <input value={lat} onChange={e => setLat(e.target.value)} placeholder="e.g. 6.524379"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Longitude</label>
                <input value={lng} onChange={e => setLng(e.target.value)} placeholder="e.g. 3.379206"
                  style={inputStyle} />
              </div>
            </div>

            {/* Map preview — shown once coordinates are set */}
            {lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng)) && (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <iframe
                  title="Hospital location preview"
                  width="100%"
                  height="200"
                  style={{ border: 'none', display: 'block' }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(lng) - 0.008},${parseFloat(lat) - 0.008},${parseFloat(lng) + 0.008},${parseFloat(lat) + 0.008}&layer=mapnik&marker=${lat},${lng}`}
                />
              </div>
            )}

            {lat && lng ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.accent, fontWeight: 600, textDecoration: 'none' }}>
                ↗ Verify on Google Maps
              </a>
            ) : (
              <div style={{ fontSize: 11, color: C.textMuted }}>
                No coordinates set yet — search an address or type them in directly.
              </div>
            )}
          </div>

          </div>{/* end left column */}

          {/* Booking policies (right column) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Appointment policies */}
            <SectionCard title="Booking Policies">
              <Toggle value={virtual}   onChange={() => setVirtual(v => !v)}
                label="Accept Virtual Consultations"
                sub="Patients can book telemedicine appointments with specific doctors" />
              <Toggle value={emergency} onChange={() => setEmergency(v => !v)}
                label="24/7 Emergency Services"
                sub="Accept emergency bookings outside normal operating hours" />

              {/* Approval mode */}
              <div style={{ padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Booking Approval</div>
                <div style={{ fontSize: 12, color: C.textSub, marginBottom: 10 }}>
                  Choose whether bookings are confirmed instantly or require manual review
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['auto', 'manual'] as const).map(m => (
                    <button key={m} onClick={() => setApprovalMode(m)}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                        border: `1px solid ${approvalMode === m ? C.accent : C.border}`,
                        background: approvalMode === m ? C.accentLight : C.bgAlt }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: approvalMode === m ? C.accent : C.text }}>
                        {m === 'auto' ? '⚡ Auto-Approve' : '📋 Manual Review'}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                        {m === 'auto'
                          ? 'Bookings confirmed instantly'
                          : 'Admin reviews each booking request'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Requires referral */}
              <Toggle value={requiresRef} onChange={() => setRequiresRef(v => !v)}
                label="Require Referral / Evidence"
                sub="Patients must upload referral letter or describe symptoms for manual-approval bookings" />
            </SectionCard>

            {/* Operating Hours */}
            <SectionCard title="Operating Hours">
              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>
                Drives the Schedule page grid and which days patients can book. Include weekends here if you're open.
              </div>
              <HoursEditor hours={hours} onChange={setHours} />
            </SectionCard>

            {/* Volume & Fees */}
            <SectionCard title="Volume & Fees">
              <div style={{ paddingTop: 10 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Daily Booking Limit (leave blank = unlimited)</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" min="1" value={dailyLimit}
                      onChange={e => setDailyLimit(e.target.value)}
                      placeholder="e.g. 50 — blank for no limit"
                      style={inputStyle} />
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>
                    When limit is reached for the day, patients are prompted to book the next available day.
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>OPD / Walk-in Consultation Fee (₦)</label>
                  <input type="number" min="0" value={opdFee}
                    onChange={e => setOpdFee(e.target.value)}
                    placeholder="0" style={inputStyle} />
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>
                    Fee charged for general in-person hospital bookings (not doctor-specific virtual). Set 0 for free OPD.
                  </div>
                </div>

                {/* Cancellation policy reminder */}
                <div style={{ background: C.bgAlt, border: `1px solid ${C.border}`,
                  borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                    Platform Cancellation Policy
                  </div>
                  <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                    • Cancelled &gt;24hrs before appointment → <strong style={{ color: C.text }}>100% refund</strong><br />
                    • Cancelled ≤24hrs before appointment → <strong style={{ color: C.text }}>50% refund</strong><br />
                    • No-show: patient has <strong style={{ color: C.text }}>48 hours</strong> to reschedule free of charge<br />
                    • Rejected bookings → <strong style={{ color: C.text }}>100% refund</strong> always
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Patient Reminders */}
            <SectionCard title="Patient Reminders">
              <Toggle value={smsReminder}   onChange={() => setSmsReminder(v => !v)}
                label="SMS Reminders" sub="Send patients SMS 24h before appointment" />
              <Toggle value={emailReminder} onChange={() => setEmailReminder(v => !v)}
                label="Email Reminders" sub="Send patients email 1h before appointment" />
            </SectionCard>

            {/* Subscription */}
            <SectionCard title="Subscription Plan">
              <div style={{ background: C.accentLight, border: `1px solid ${C.accentBorder}`,
                borderRadius: 12, padding: '12px 16px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.accent }}>PRO Plan</div>
                  <div style={{ fontSize: 12, color: C.textSub }}>25 doctors · Unlimited · EMR + Virtual</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
                    ₦100k<span style={{ fontSize: 11, fontWeight: 400, color: C.textSub }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.accent }}>Trial active</div>
                </div>
              </div>
              <button style={{ width: '100%', padding: '9px', borderRadius: 10,
                border: `1px solid ${C.border}`, background: C.card,
                color: C.textSub, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>
                Manage Billing
              </button>
            </SectionCard>

            {/* Save */}
            {saveErr && (
              <div style={{ background: 'rgba(220,60,60,0.1)', border: '1px solid rgba(220,60,60,0.3)',
                borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#f07070' }}>
                ⚠️ {saveErr}
              </div>
            )}
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '13px', borderRadius: 12,
                background: saved ? C.accentLight : C.accent,
                color: saved ? C.accent : C.id === 'forest' ? '#061208' : '#fff',
                border: saved ? `1px solid ${C.accentBorder}` : 'none',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
