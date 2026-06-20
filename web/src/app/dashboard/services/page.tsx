'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import { getHospitalSpecialties } from '@/lib/admin-api'

interface Service {
  id: string
  name: string
  icon: string | null
  active: boolean
  docCount: number
}

export default function ServicesPage() {
  const { theme: C } = useTheme()
  const { hospital, doctors } = useAdmin()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!hospital?.id) return
    setLoading(true)
    const specs = await getHospitalSpecialties(hospital.id)

    // Count doctors per specialty
    const docCounts: Record<string, number> = {}
    doctors.forEach(d => {
      if (d.specialty_name) {
        docCounts[d.specialty_name] = (docCounts[d.specialty_name] || 0) + 1
      }
    })

    setServices(specs.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      active: true,
      docCount: docCounts[s.name] ?? 0,
    })))
    setLoading(false)
  }, [hospital?.id, doctors])

  useEffect(() => { load() }, [load])

  function toggleService(id: string) {
    setServices(sv => sv.map(s => s.id === id ? { ...s, active: !s.active } : s))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-.03em' }}>Services & Specialties</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            Manage what your hospital offers on Queue
          </div>
        </div>
        <button style={{ background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
          border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Add Service
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: C.textMuted, fontSize: 13 }}>Loading services…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: C.card,
              border: `1px solid ${s.active ? C.accentBorder : C.border}`,
              borderRadius: 16, padding: 18, transition: 'background .3s, border-color .3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.icon && <span style={{ fontSize: 20 }}>{s.icon}</span>}
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.active ? C.text : C.textMuted }}>
                    {s.name}
                  </div>
                </div>
                {/* Toggle */}
                <div onClick={() => toggleService(s.id)}
                  style={{ width: 40, height: 22, borderRadius: 99,
                    background: s.active ? C.accent : C.borderMed,
                    position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: s.active ? 20 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                </div>
              </div>

              <div style={{ fontSize: 12, color: C.textSub, marginBottom: 10 }}>
                {s.docCount > 0
                  ? `${s.docCount} doctor${s.docCount > 1 ? 's' : ''} assigned`
                  : 'No doctors assigned yet'}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ flex: 1, padding: '7px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.card,
                  color: C.textSub, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Edit
                </button>
                <button style={{ flex: 1, padding: '7px', borderRadius: 8,
                  border: `1px solid ${C.border}`, background: C.card,
                  color: C.textSub, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Pricing
                </button>
              </div>
            </div>
          ))}

          {services.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px',
              border: `2px dashed ${C.border}`, borderRadius: 16, color: C.textMuted }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🏥</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub }}>No services yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Add doctors with specialties to see services here</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
