import { useEffect, useState } from 'react'
import { MessagesScreen } from '@queue/shared/screens/MessagesScreen'
import { NewMessageSheet, type ChatOption } from '@queue/shared/components/NewMessageSheet'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'

// The hospital's shared inbox: every staff member sees and answers the same threads
// with patients, doctors and the hospital's own ambulance crews.
export function HospitalMessagesScreen({ navigation }: { navigation: any }) {
  const { staffProfile } = useAuth()
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<ChatOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!picking || !staffProfile?.hospitalId) return
    setLoading(true)
    supabase.rpc('get_hospital_staff_roster', { p_hospital_id: staffProfile.hospitalId }).then(({ data }: { data: any }) => {
      const doctors: ChatOption[] = (data?.doctors ?? []).filter((d: any) => d.is_active !== false).map((d: any) => ({
        id: d.id, target: 'doctor', title: `Dr. ${String(d.full_name ?? '').replace(/^Dr\.?\s*/i, '')}`,
        subtitle: d.specialty_name ?? 'Doctor', icon: 'medkit-outline',
      }))
      const crew: ChatOption[] = (data?.staff ?? []).filter((s: any) => s.role === 'ambulance_crew').map((s: any) => ({
        id: s.id, target: 'crew', title: s.full_name, subtitle: 'Ambulance crew', avatarUrl: s.avatar_url, icon: 'car-outline',
      }))
      setOptions([...doctors, ...crew])
      setLoading(false)
    })
  }, [picking, staffProfile?.hospitalId])

  return (
    <>
      <MessagesScreen navigation={navigation} role="hospital" onBack={() => navigation.goBack()} onNew={() => setPicking(true)}
        subtitle="Shared inbox for your hospital"
        emptyBody='Patients, doctors and crews can reach your hospital here. Tap "New message" to start one.' />
      <NewMessageSheet visible={picking} onClose={() => setPicking(false)} options={options} loading={loading} navigation={navigation}
        title="Message a doctor or crew" />
    </>
  )
}
