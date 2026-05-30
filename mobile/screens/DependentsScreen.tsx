import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, Alert } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Dependent {
  id: string; full_name: string; relationship: string; date_of_birth: string | null
}

export function DependentsScreen({ navigation }: { navigation: any }) {
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [loading, setLoading]       = useState(true)
  const [adding, setAdding]         = useState(false)
  const [name, setName]             = useState('')
  const [relationship, setRelationship] = useState('')
  const [saving, setSaving]         = useState(false)
  const [patientId, setPatientId]   = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
      if (!profile) { setLoading(false); return }
      setPatientId(profile.id)
      const { data } = await supabase
        .from('dependents')
        .select('id,full_name,relationship,date_of_birth')
        .eq('user_id', profile.id)
        .order('full_name')
      setDependents((data as Dependent[]) ?? [])
    } catch (_) {}
    setLoading(false)
  }

  async function handleAdd() {
    if (!patientId) { Alert.alert('Error', 'Still loading. Please wait.'); return }
    if (!name.trim()) { Alert.alert('Error', 'Please enter the full name.'); return }
    if (!relationship.trim()) { Alert.alert('Error', 'Please enter the relationship.'); return }
    setSaving(true)
    const { error } = await supabase.from('dependents').insert({
      user_id: patientId,
      full_name: name.trim(),
      relationship: relationship.trim(),
    })
    setSaving(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setName(''); setRelationship(''); setAdding(false)
      load()
    }
  }

  async function handleRemove(id: string, depName: string) {
    Alert.alert('Remove Dependent', `Remove ${depName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('dependents').delete().eq('id', id)
        if (error) Alert.alert('Error', error.message)
        else load()
      }},
    ])
  }

  const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other']

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage Dependents</Text>
        {!adding && (
          <TouchableOpacity onPress={() => setAdding(true)} style={styles.addBtn}>
            <Text style={{ color: t.accent, fontSize: 20, lineHeight: 24 }}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {adding && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Add Dependent</Text>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              value={name} onChangeText={setName}
              placeholder="e.g. Amaka Okafor"
              placeholderTextColor={t.textMuted}
              style={styles.input}
            />
            <Text style={styles.label}>Relationship</Text>
            <View style={styles.chips}>
              {RELATIONSHIPS.map(r => (
                <TouchableOpacity key={r} onPress={() => setRelationship(r)}
                  style={[styles.chip, relationship === r && styles.chipActive]}>
                  <Text style={[styles.chipText, relationship === r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setAdding(false)} style={styles.cancelBtn}>
                <Text style={{ color: t.textSub, fontSize: font.base, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} disabled={saving} style={styles.saveBtn}>
                <Text style={{ color: '#060A07', fontSize: font.base, fontWeight: '800' }}>
                  {saving ? 'Saving…' : 'Add Dependent'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <Text style={styles.placeholder}>Loading…</Text>
        ) : dependents.length === 0 && !adding ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>👨‍👩‍👧</Text>
            <Text style={styles.emptyTitle}>No dependents added</Text>
            <Text style={styles.emptyBody}>Add family members so you can book appointments on their behalf</Text>
            <TouchableOpacity onPress={() => setAdding(true)} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Add Dependent</Text>
            </TouchableOpacity>
          </View>
        ) : (
          dependents.map(dep => (
            <View key={dep.id} style={styles.card}>
              <View style={styles.avatar}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: t.accent }}>
                  {dep.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.depName}>{dep.full_name}</Text>
                <Text style={styles.depRel}>{dep.relationship}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemove(dep.id, dep.full_name)}>
                <Text style={{ color: '#FF5C5C', fontSize: font.sm, fontWeight: '600' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: t.bg },
  header:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4, flex: 1 },
  addBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  scroll:        { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  form:          { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg },
  formTitle:     { fontSize: font.md, fontWeight: '800', color: t.text, marginBottom: spacing.lg },
  label:         { fontSize: font.xs, fontWeight: '600', color: t.textSub, marginBottom: 6 },
  input:         { backgroundColor: t.bg, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, fontSize: font.base, color: t.text, marginBottom: spacing.md },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: t.border },
  chipActive:    { borderColor: t.accent, backgroundColor: t.accentMuted },
  chipText:      { fontSize: font.sm, color: t.textSub, fontWeight: '600' },
  chipTextActive:{ color: t.accent },
  formActions:   { flexDirection: 'row', gap: spacing.sm },
  cancelBtn:     { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: t.border },
  saveBtn:       { flex: 2, paddingVertical: 13, alignItems: 'center', borderRadius: radius.lg, backgroundColor: t.accent },
  placeholder:   { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  emptyState:    { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:    { fontSize: font.lg, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody:     { fontSize: font.sm, color: t.textSub, textAlign: 'center', maxWidth: 260, lineHeight: 20, marginBottom: 24 },
  emptyBtn:      { backgroundColor: t.accent, paddingHorizontal: spacing.xl, paddingVertical: 13, borderRadius: radius.lg },
  emptyBtnText:  { color: '#060A07', fontWeight: '800', fontSize: font.base },
  card:          { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  avatar:        { width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  depName:       { fontSize: font.base, fontWeight: '700', color: t.text },
  depRel:        { fontSize: font.sm, color: t.textSub, marginTop: 2 },
})
