import { useState } from 'react'
import { MessagesScreen } from '@queue/shared/screens/MessagesScreen'
import { NewMessageSheet, type ChatOption } from '@queue/shared/components/NewMessageSheet'
import { useAuth } from '@queue/shared/contexts/AuthContext'

// Messages tab: chats with patients (started from a consultation) and with the
// hospitals this doctor is linked to (started here).
export function DoctorMessagesScreen({ navigation }: { navigation: any }) {
  const { doctorProfile } = useAuth()
  const [picking, setPicking] = useState(false)
  const options: ChatOption[] = (doctorProfile?.linkedHospitals ?? []).map(h => ({
    id: h.hospitalId, target: 'hospital', title: h.hospitalName, subtitle: 'Hospital front desk', icon: 'business-outline',
  }))
  return (
    <>
      <MessagesScreen navigation={navigation} role="doctor" onNew={() => setPicking(true)}
        subtitle="Patients and your hospitals"
        emptyBody='Message a patient from their consultation, or tap "New message" to reach one of your hospitals.' />
      <NewMessageSheet visible={picking} onClose={() => setPicking(false)} options={options} navigation={navigation}
        title="Message a hospital" />
    </>
  )
}
