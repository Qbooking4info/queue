import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, Linking } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Doc {
  id: string; doc_type: string | null; file_name: string | null
  url: string; created_at: string | null
  appointments: { appointment_date: string; hospitals: { name: string } | null; doctors: { full_name: string; title: string } | null } | null
}

export function PrescriptionsScreen({ navigation }: { navigation: any }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
        if (!profile) { setLoading(false); return }

        const { data: appts } = await supabase
          .from('appointments')
          .select('id')
          .eq('patient_id', profile.id)

        const apptIds = (appts ?? []).map((a: { id: string }) => a.id)
        if (apptIds.length === 0) { setLoading(false); return }

        const { data } = await supabase
          .from('appointment_documents')
          .select('id,doc_type,file_name,url,created_at,appointments(appointment_date,hospitals(name),doctors(full_name,title))')
          .in('appointment_id', apptIds)
          .order('created_at', { ascending: false })

        setDocs((data as Doc[]) ?? [])
      } catch (_) {}
      setLoading(false)
    }
    load()
  }, [])

  const iconFor = (type: string | null) => {
    if (!type) return '📄'
    if (type.includes('lab') || type.includes('result')) return '🧪'
    if (type.includes('prescription')) return '💊'
    if (type.includes('scan') || type.includes('xray') || type.includes('imaging')) return '🩻'
    if (type.includes('report')) return '📋'
    return '📄'
  }

  function openDoc(doc: Doc) {
    if (doc.url) {
      Linking.openURL(doc.url).catch(() => Alert.alert('Error', 'Could not open document.'))
    } else {
      Alert.alert('Unavailable', 'Document link not available.')
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Prescriptions & Lab Results</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.placeholder}>Loading…</Text>
        ) : docs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>📄</Text>
            <Text style={styles.emptyTitle}>No documents yet</Text>
            <Text style={styles.emptyBody}>
              Prescriptions and lab results uploaded by your hospital after appointments will appear here
            </Text>
          </View>
        ) : (
          docs.map(doc => {
            const appt = Array.isArray(doc.appointments) ? doc.appointments[0] : doc.appointments
            const hospital = Array.isArray(appt?.hospitals) ? appt?.hospitals[0] : appt?.hospitals
            const doctor = Array.isArray(appt?.doctors) ? appt?.doctors[0] : appt?.doctors
            return (
              <TouchableOpacity
                key={doc.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => openDoc(doc)}>
                <View style={styles.iconWrap}>
                  <Text style={{ fontSize: 22 }}>{iconFor(doc.doc_type)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{doc.file_name ?? doc.doc_type ?? 'Document'}</Text>
                  {doctor ? <Text style={styles.meta}>{doctor.title} {doctor.full_name}</Text> : null}
                  {hospital ? <Text style={styles.meta}>{hospital.name}</Text> : null}
                  <Text style={styles.date}>{appt?.appointment_date ?? (doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '')}</Text>
                </View>
                <Text style={{ color: t.accent, fontSize: font.sm, fontWeight: '700' }}>Open ›</Text>
              </TouchableOpacity>
            )
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: t.bg },
  header:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4, flex: 1 },
  scroll:     { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  placeholder:{ color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: font.lg, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody:  { fontSize: font.sm, color: t.textSub, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  card:       { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  iconWrap:   { width: 48, height: 48, borderRadius: 14, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  docTitle:   { fontSize: font.base, fontWeight: '700', color: t.text },
  meta:       { fontSize: font.sm, color: t.textSub, marginTop: 1 },
  date:       { fontSize: font.xs, color: t.textMuted, marginTop: 3 },
})
