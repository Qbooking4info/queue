import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Modal, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getDependents, addDependent, updateDependent, deleteDependent } from '../lib/api'
import { DateOfBirthSelect } from '../components/ui/DateOfBirthSelect'

interface Props { navigation: any }

const RELATIONSHIPS: { label: string; value: string }[] = [
  { label: 'Spouse',  value: 'spouse'  },
  { label: 'Child',   value: 'child'   },
  { label: 'Parent',  value: 'parent'  },
  { label: 'Sibling', value: 'sibling' },
  { label: 'Other',   value: 'other'   },
]
const GENDERS       = ['Female', 'Male', 'Other']

interface Dependent { id: string; full_name: string; relationship: string | null; date_of_birth: string | null; gender: string | null }

const EMPTY_FORM = { full_name: '', relationship: '', date_of_birth: '', gender: '' }

export function DependentsScreen({ navigation }: Props) {
  const { theme: t }    = useTheme()
  const { user }        = useAuth()
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState<Dependent | null>(null)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setDependents(await getDependents(user.id))
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(d: Dependent) {
    setEditing(d)
    setForm({ full_name: d.full_name, relationship: d.relationship ?? '', date_of_birth: d.date_of_birth ?? '', gender: d.gender ?? '' })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required.'); return }
    if (!form.relationship)     { setError('Please select a relationship.'); return }
    if (!user) return
    setSaving(true)
    setError('')
    if (editing) {
      await updateDependent(editing.id, { full_name: form.full_name.trim(), relationship: form.relationship, date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined })
    } else {
      await addDependent(user.id, { full_name: form.full_name.trim(), relationship: form.relationship, date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined })
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await deleteDependent(id)
    setDeleting(null)
    load()
  }

  const RELATION_ICONS: Record<string, string> = { spouse: '💑', child: '👶', parent: '👨‍👩‍👦', sibling: '🤝', other: '👤', Spouse: '💑', Child: '👶', Parent: '👨‍👩‍👦', Sibling: '🤝', Other: '👤' }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Dependents</Text>
        <TouchableOpacity onPress={openAdd}
          style={[s.addBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
          <Text style={[s.addBtnText, { color: t.accent }]}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Add / Edit Modal */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setModalOpen(false)} />
        <View style={[s.sheet, { backgroundColor: t.cardBg }]}>
          <View style={[s.sheetHandle, { backgroundColor: t.inputBorder }]} />
          <Text style={[s.sheetTitle, { color: t.textPrimary }]}>{editing ? 'Edit dependent' : 'Add dependent'}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[s.fieldLabel, { color: t.textMuted }]}>Full name *</Text>
            <TextInput
              value={form.full_name} onChangeText={v => setForm(f => ({ ...f, full_name: v }))}
              placeholder="e.g. Emeka Okonkwo" placeholderTextColor={t.textMuted}
              style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
            />

            <Text style={[s.fieldLabel, { color: t.textMuted }]}>Relationship *</Text>
            <View style={s.pillRow}>
              {RELATIONSHIPS.map(r => (
                <TouchableOpacity key={r.value} onPress={() => setForm(f => ({ ...f, relationship: r.value }))}
                  style={[s.pill, { borderColor: form.relationship === r.value ? t.accent : t.cardBorder, backgroundColor: form.relationship === r.value ? t.accentBg : t.inputBg }]}>
                  <Text style={[s.pillText, { color: form.relationship === r.value ? t.accent : t.textMuted, fontWeight: form.relationship === r.value ? '700' : '400' }]}>
                    {RELATION_ICONS[r.label] ?? '👤'} {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: t.textMuted }]}>Date of birth</Text>
            <DateOfBirthSelect
              value={form.date_of_birth}
              onChange={v => setForm(f => ({ ...f, date_of_birth: v }))}
            />

            <Text style={[s.fieldLabel, { color: t.textMuted }]}>Gender</Text>
            <View style={s.pillRow}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g} onPress={() => setForm(f => ({ ...f, gender: g.toLowerCase() }))}
                  style={[s.pill, { borderColor: form.gender === g.toLowerCase() ? t.accent : t.cardBorder, backgroundColor: form.gender === g.toLowerCase() ? t.accentBg : t.inputBg }]}>
                  <Text style={[s.pillText, { color: form.gender === g.toLowerCase() ? t.accent : t.textMuted, fontWeight: form.gender === g.toLowerCase() ? '700' : '400' }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity onPress={handleSave} disabled={saving}
              style={[s.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}>
              <Text style={s.saveBtnText}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add dependent'}</Text>
            </TouchableOpacity>

            {editing && (
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Remove dependent?',
                    `Remove ${editing.full_name} from your account?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => { setModalOpen(false); handleDelete(editing.id) } },
                    ]
                  )
                }}
                style={[s.deleteBtn, { borderColor: 'rgba(255,92,92,0.4)', backgroundColor: 'rgba(255,92,92,0.07)' }]}>
                <Text style={s.deleteBtnText}>Remove dependent</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* List */}
      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {dependents.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>👨‍👩‍👧</Text>
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No dependents yet</Text>
              <Text style={[s.emptySub, { color: t.textMuted }]}>
                Add family members so you can book appointments on their behalf.
              </Text>
              <TouchableOpacity onPress={openAdd}
                style={[s.emptyAddBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.emptyAddBtnText, { color: t.accent }]}>+ Add first dependent</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[s.countText, { color: t.textMuted }]}>{dependents.length} dependent{dependents.length !== 1 ? 's' : ''}</Text>
              {dependents.map(d => (
                <TouchableOpacity key={d.id} onPress={() => openEdit(d)} activeOpacity={0.75}
                  style={[s.depCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={[s.depAvatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                    <Text style={{ fontSize: 22 }}>{RELATION_ICONS[d.relationship ?? ''] ?? '👤'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.depName, { color: t.textPrimary }]}>{d.full_name}</Text>
                    <Text style={[s.depMeta, { color: t.textMuted }]}>
                      {d.relationship ?? 'Dependent'}
                      {d.date_of_birth ? ` · ${d.date_of_birth}` : ''}
                      {d.gender ? ` · ${d.gender}` : ''}
                    </Text>
                  </View>
                  {deleting === d.id
                    ? <ActivityIndicator color={t.accent} size="small" />
                    : <Text style={[s.editArrow, { color: t.textMuted }]}>›</Text>
                  }
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  back:           { fontSize: 22 },
  title:          { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  addBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  addBtnText:     { fontSize: 12, fontWeight: '700' },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '85%' },
  sheetHandle:    { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:          { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  pillRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  pillText:       { fontSize: 12 },
  errorText:      { color: '#F87171', fontSize: 12, marginTop: 8 },
  saveBtn:        { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 18 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteBtn:      { borderRadius: 14, padding: 13, alignItems: 'center', marginTop: 8, borderWidth: 1 },
  deleteBtnText:  { color: '#FF5C5C', fontSize: 13, fontWeight: '600' },
  emptyCard:      { borderRadius: 20, borderWidth: 1, padding: 36, alignItems: 'center' },
  emptyTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySub:       { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyAddBtn:    { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, borderWidth: 1 },
  emptyAddBtnText:{ fontSize: 13, fontWeight: '700' },
  countText:      { fontSize: 11, marginBottom: 12 },
  depCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1 },
  depAvatar:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  depName:        { fontSize: 14, fontWeight: '700' },
  depMeta:        { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  editArrow:      { fontSize: 22 },
})
