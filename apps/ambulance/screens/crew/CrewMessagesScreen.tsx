import { useEffect, useState } from 'react'
import { MessagesScreen } from '@queue/shared/screens/MessagesScreen'
import { NewMessageSheet, type ChatOption } from '@queue/shared/components/NewMessageSheet'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'

// Crew messages: hospitals for handover, directions and bed availability. Your own
// hospital (hospital-fleet crews) is listed first.
export function CrewMessagesScreen({ navigation }: { navigation: any }) {
  const { staffProfile } = useAuth()
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<ChatOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!picking) return
    setLoading(true)
    supabase.from('hospitals').select('id, name, city, logo_url').eq('is_active', true).order('name').limit(200)
      .then(({ data }: { data: any[] | null }) => {
        const list: ChatOption[] = (data ?? []).map(h => ({
          id: h.id, target: 'hospital', title: h.name, subtitle: h.city ?? 'Hospital', avatarUrl: h.logo_url, icon: 'business-outline',
        }))
        const own = staffProfile?.hospitalId
        list.sort((a, b) => (a.id === own ? -1 : b.id === own ? 1 : 0))
        setOptions(list)
        setLoading(false)
      })
  }, [picking, staffProfile?.hospitalId])

  return (
    <>
      <MessagesScreen navigation={navigation} role="crew" onNew={() => setPicking(true)} subtitle="Hospitals and dispatch"
        emptyBody='Message a receiving hospital about handover, or tap "New message".' />
      <NewMessageSheet visible={picking} onClose={() => setPicking(false)} options={options} loading={loading} navigation={navigation}
        title="Message a hospital" />
    </>
  )
}
