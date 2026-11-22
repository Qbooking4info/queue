import { useState, useCallback } from 'react'
import { View, ActivityIndicator, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Hair, SectionHead, Seg, Stat, StatStrip, Mono,
} from '@queue/shared/components/q'
import { useTheme }  from '@queue/shared/contexts/ThemeContext'
import { useAuth }   from '@queue/shared/contexts/AuthContext'
import { supabase }  from '@queue/shared/lib/supabase'
import { todayLocalDate } from '@queue/shared/lib/format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Range = 'today' | 'week' | 'month' | 'year'

interface DoctorWaitConsultStats { doctorId: string; doctorName: string; avgWaitMinutes: number | null; avgConsultMinutes: number | null; sampleSize: number }
interface Collected { collected: number; refunded: number; payout: number; count: number }
interface Stats {
  total: number; completed: number; cancelled: number; pending: number
  avgWaitMinutes: number | null; avgConsultMinutes: number | null
  doctorStats: DoctorWaitConsultStats[]
  /** What the fee maths says the completed appointments were worth. */
  revenue?: number | null
  /** What actually arrived through Queue. Null for a clinic-scoped caller --
   *  payments carry no clinic, and attributing the hospital's takings to one
   *  clinic would be worse than saying nothing. */
  collected?: Collected | null
}
interface SpecialtyRow { name: string; count: number; pct: number }

/** Naira, or an em dash where there is no figure rather than a confident 0. */
function money(n: number | null | undefined): string {
  return n == null ? '—' : `₦${Math.round(n).toLocaleString('en-NG')}`
}

function fmtMinutes(m: number | null): string {
  if (m == null) return '—'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const SPEC_COLORS = ['#0F766E','#5B9EFF','#A78BFA','#EF9F27','#FF8C42']

interface Props { navigation: { goBack: () => void; canGoBack?: () => boolean } }

export function StaffAnalyticsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()

  const [range,      setRange]      = useState<Range>('month')
  const [stats,      setStats]      = useState<Stats>({ total: 0, completed: 0, cancelled: 0, pending: 0, avgWaitMinutes: null, avgConsultMinutes: null, doctorStats: [] })
  const [specialty,  setSpecialty]  = useState<SpecialtyRow[]>([])
  const [inperson,   setInperson]   = useState(0)
  const [virtual,    setVirtual]    = useState(0)
  const [ytdMonths,  setYtdMonths]  = useState<string[]>([])
  const [ytdCounts,  setYtdCounts]  = useState<number[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const hospitalId = staffProfile?.hospitalId

  function getBounds(r: Range): { from: string; to: string } {
    const now = new Date()
    const pad  = (n: number) => String(n).padStart(2, '0')
    const fmt  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const today = fmt(now)
    if (r === 'today') return { from: today, to: today }
    if (r === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: fmt(d), to: today }
    }
    if (r === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: fmt(d), to: today }
    }
    return { from: `${now.getFullYear()}-01-01`, to: today }
  }

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    const { from, to } = getBounds(range)
    const year = new Date().getFullYear()
    const ytdTo = todayLocalDate()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {}

      const [statsRes, apptsRes, ytdRes] = await Promise.all([
        fetch(`${API_URL}/api/appointments/stats?from=${from}&to=${to}`, { headers }),
        fetch(`${API_URL}/api/appointments?from=${from}&to=${to}`, { headers }),
        fetch(`${API_URL}/api/appointments?from=${year}-01-01&to=${ytdTo}`, { headers }),
      ])

      if (statsRes.ok) setStats(await statsRes.json())

      if (apptsRes.ok) {
        const { appointments = [] } = await apptsRes.json()
        // specialty breakdown
        const counts: Record<string, number> = {}
        let ip = 0, vt = 0
        appointments.forEach((a: any) => {
          const name = a.specialty_name ?? 'General'
          counts[name] = (counts[name] ?? 0) + 1
          if (a.type === 'virtual') vt++; else ip++
        })
        const total = appointments.length || 1
        setSpecialty(
          Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 100) }))
        )
        setInperson(ip); setVirtual(vt)
      }

      if (ytdRes.ok) {
        const { appointments: ytd = [] } = await ytdRes.json()
        const cur = new Date().getMonth()
        const counts2 = Array(cur + 1).fill(0)
        ytd.forEach((a: any) => {
          const m = new Date(a.appointment_date).getMonth()
          if (m <= cur) counts2[m]++
        })
        setYtdMonths(MONTH_NAMES.slice(0, cur + 1))
        setYtdCounts(counts2)
      }
    } catch { /* silent */ }

    setLoading(false)
    setRefreshing(false)
  }, [hospitalId, range])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const showUp = stats.total > 0 ? Math.round(stats.completed / stats.total * 100) : 0
  const total  = inperson + virtual || 1

  const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: '7 days' },
    { key: 'month', label: 'Month' },
    { key: 'year',  label: 'Year' },
  ]

  return (
    <Screen>
      <AppBar
        title="Analytics"
        sub="Appointments and trends"
        onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <Seg<Range>
        value={range} onChange={setRange}
        options={RANGES.map(r => ({ key: r.key, label: r.label }))}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          <SectionHead title="Selected period" />
          <StatStrip>
            <Stat label="Appointments" value={stats.total} note={`${stats.completed} completed`} />
            <Stat label="Show-up" value={`${showUp}%`}
              tone={showUp < 80 ? 'amber' : undefined}
              note={`${stats.cancelled} cancelled`} />
            <Stat label="Avg wait" value={stats.avgWaitMinutes ?? '—'}
              unit={stats.avgWaitMinutes != null ? 'min' : undefined}
              note={stats.avgConsultMinutes != null ? `${stats.avgConsultMinutes} min consult` : 'no consults timed'}
              last />
          </StatStrip>

          {/* Two money figures, never merged into one. "Earned" is the fee
              maths over completed appointments; "collected" is what actually
              came through Queue. They differ whenever a patient pays at the
              desk, a payment fails, or a booking is refunded -- and a single
              number would quietly report income the hospital never received. */}
          <SectionHead title="Money" />
          <Card>
            <StatStrip>
              <Stat label="Earned" value={money(stats.revenue ?? null)}
                note="completed appointments" />
              {stats.collected
                ? <Stat label="Collected in Queue" value={money(stats.collected.collected)}
                    note={`${stats.collected.count} paid online`} last />
                : <Stat label="Collected in Queue" value="—"
                    note="hospital-wide figure only" last />}
            </StatStrip>
            {!!stats.collected && (stats.collected.refunded > 0 || stats.collected.payout > 0) && (
              <>
                <Hair inset={0} />
                <StatStrip>
                  <Stat label="Your payout" value={money(stats.collected.payout)} note="after platform fee" />
                  <Stat label="Refunded" value={money(stats.collected.refunded)}
                    tone={stats.collected.refunded > 0 ? 'amber' : undefined}
                    note="returned to patients" last />
                </StatStrip>
              </>
            )}
            <Hair inset={0} />
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ fontSize: 11.5, lineHeight: 16, color: t.q.ink60 }}>
                Earned is what the bookings were worth. Collected is what reached Queue — anything paid
                at your desk is in the first figure and not the second.
              </Text>
            </View>
          </Card>

          <SectionHead title="Visit type" />
          <Card pad style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round((inperson / total) * 100)}%`, backgroundColor: t.q.primary }} />
              <View style={{ flex: 1, backgroundColor: t.q.amberFill }} />
            </View>
            <View style={{ gap: 8 }}>
              {[
                { label: 'In person', count: inperson, color: t.q.primary },
                { label: 'Video', count: virtual, color: t.q.amberFill },
              ].map(tp => (
                <View key={tp.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tp.color }} />
                  <Text style={{ flex: 1, fontSize: 13, color: t.q.ink }}>{tp.label}</Text>
                  <Mono size={13} weight="700">{tp.count}</Mono>
                  <Mono size={12} color={t.q.ink60}>{Math.round((tp.count / total) * 100)}%</Mono>
                </View>
              ))}
            </View>
          </Card>

          {specialty.length > 0 && (
            <>
              <SectionHead title="Top specialties" />
              <Card pad style={{ gap: 10 }}>
                {specialty.map(sp => (
                  <View key={sp.name} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: t.q.ink }}>{sp.name}</Text>
                      <Mono size={13} weight="700">{sp.count}</Mono>
                      <Mono size={12} color={t.q.ink60}>{sp.pct}%</Mono>
                    </View>
                    {/* One colour, length carries the value: a different hue per
                        row would imply the specialties are categories being
                        compared on something other than size. */}
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.q.muted, overflow: 'hidden' }}>
                      <View style={{ width: `${sp.pct}%`, height: '100%', backgroundColor: t.q.primary }} />
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}

          {!!stats.doctorStats.length && (
            <>
              <SectionHead title="By doctor" />
              <Card>
                <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
                  <Text style={{ flex: 1.4, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: t.q.ink60 }}>DOCTOR</Text>
                  <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: t.q.ink60, textAlign: 'right' }}>WAIT</Text>
                  <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: t.q.ink60, textAlign: 'right' }}>CONSULT</Text>
                  <Text style={{ flex: 0.7, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, color: t.q.ink60, textAlign: 'right' }}>VISITS</Text>
                </View>
                {stats.doctorStats.map((d, i) => (
                  <View key={d.doctorId}>
                    <Hair />
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 }}>
                      <Text numberOfLines={1} style={{ flex: 1.4, fontSize: 13, fontWeight: '600', color: t.q.ink }}>
                        {d.doctorName}
                      </Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Mono size={12.5} color={t.q.ink70}>{fmtMinutes(d.avgWaitMinutes)}</Mono>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Mono size={12.5} color={t.q.ink70}>{fmtMinutes(d.avgConsultMinutes)}</Mono>
                      </View>
                      <View style={{ flex: 0.7, alignItems: 'flex-end' }}>
                        <Mono size={12.5} color={t.q.ink60}>{d.sampleSize}</Mono>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}

          {ytdMonths.length > 0 && (
            <>
              <SectionHead title="Bookings this year" />
              <Card pad>
                {(() => {
                  const maxV = Math.max(...ytdCounts, 1)
                  return (
                    <View style={{ gap: 8 }}>
                      {/* Every bar is measured against the same maximum, and the
                          maximum is printed, so a tall bar cannot be read as a
                          bigger number than it is. */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Mono size={10.5} color={t.q.ink60}>0</Mono>
                        <Mono size={10.5} color={t.q.ink60}>{maxV} max</Mono>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
                        {ytdMonths.map((m, i) => {
                          const h = Math.max((ytdCounts[i] / maxV) * 96, 3)
                          const isLast = i === ytdMonths.length - 1
                          return (
                            <View key={m} style={{ flex: 1, alignItems: 'center', gap: 4 }}
                              accessibilityLabel={`${m}: ${ytdCounts[i]} bookings`}>
                              <Mono size={9} color={t.q.ink60}>{ytdCounts[i]}</Mono>
                              <View style={{
                                width: '100%', height: h, borderRadius: 3,
                                backgroundColor: isLast ? t.q.primary : t.q.sel,
                              }} />
                              <Text style={{ fontSize: 9, color: t.q.ink60 }}>{m}</Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  )
                })()}
              </Card>
            </>
          )}
        </Body>
      )}
    </Screen>
  )
}
