'use client'
import { useState, useRef, useEffect } from 'react'
import { CLINIC_SERVICE_GROUPS } from '@/lib/clinic-services'
import { useTheme } from '@/contexts/ThemeContext'

interface Props {
  selected: string[]
  onChange: (tags: string[]) => void
}

export function ServiceTagPicker({ selected, onChange }: Props) {
  const { theme: C } = useTheme()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag])
  }

  const q = search.trim().toLowerCase()
  const filteredGroups = CLINIC_SERVICE_GROUPS.map(g => ({
    ...g,
    services: q ? g.services.filter(s => s.toLowerCase().includes(q)) : g.services,
  })).filter(g => g.services.length > 0)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', minHeight: 42, background: C.bgAlt, border: `1px solid ${open ? C.accent : C.borderMed}`,
          borderRadius: 10, padding: '8px 12px', cursor: 'pointer', boxSizing: 'border-box',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          transition: 'border-color .15s',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ fontSize: 13, color: C.textMuted }}>Select services offered…</span>
        ) : (
          selected.map(tag => (
            <span key={tag} style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: C.accentLight, color: C.accent, border: `1px solid ${C.accentBorder}`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {tag}
              <span
                onClick={e => { e.stopPropagation(); toggle(tag) }}
                style={{ cursor: 'pointer', opacity: 0.6, fontSize: 10 }}>✕</span>
            </span>
          ))
        )}
        <span style={{ marginLeft: 'auto', color: C.textMuted, fontSize: 12, flexShrink: 0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 200, top: 'calc(100% + 6px)', left: 0, right: 0,
          background: C.card, border: `1px solid ${C.borderMed}`, borderRadius: 12,
          boxShadow: '0 12px 36px rgba(0,0,0,0.3)', maxHeight: 340, display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search services…"
              style={{
                width: '100%', background: C.bgAlt, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '7px 10px', fontSize: 12, color: C.text,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Groups */}
          <div style={{ overflowY: 'auto', padding: '8px 0' }}>
            {filteredGroups.map(group => (
              <div key={group.label}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase',
                  letterSpacing: '.06em', padding: '8px 14px 4px',
                }}>
                  {group.label}
                </div>
                {group.services.map(service => {
                  const checked = selected.includes(service)
                  return (
                    <div
                      key={service}
                      onClick={() => toggle(service)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px', cursor: 'pointer',
                        background: checked ? C.accentLight : 'transparent',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLDivElement).style.background = C.bgAlt }}
                      onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? C.accent : C.borderMed}`,
                        background: checked ? C.accent : 'transparent', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .1s',
                      }}>
                        {checked && <span style={{ fontSize: 9, color: C.id === 'forest' ? '#061208' : '#fff', fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: checked ? C.accent : C.text }}>{service}</span>
                    </div>
                  )
                })}
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: C.textMuted }}>
                No services match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>

          {/* Footer count */}
          {selected.length > 0 && (
            <div style={{
              borderTop: `1px solid ${C.border}`, padding: '8px 14px', flexShrink: 0,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>
                {selected.length} service{selected.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={e => { e.stopPropagation(); onChange([]); }}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: C.textMuted, fontFamily: 'inherit',
                }}>
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
