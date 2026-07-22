import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getCompletedAppointments, updateUserProfile, getMedicalHistory, updateMedicalHistory } from '../lib/api'
import type { MedicalHistory } from '../lib/api'

interface Props { navigation: any }

const BLOOD_GROUPS  = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−']
const GENDERS       = ['Female', 'Male', 'Other', 'Prefer not to say']
const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other']

const CONDITION_PROMPTS = [
  'Hypertension', 'Diabetes (Type 1)', 'Diabetes (Type 2)', 'Asthma',
  'Sickle Cell Disease', 'HIV/AIDS', 'Heart Disease', 'Kidney Disease',
  'Thyroid Disorder', 'Epilepsy', 'Mental Health Condition', 'Cancer',
]
const ALLERGY_PROMPTS = [
  'Penicillin', 'Aspirin', 'Ibuprofen', 'Sulfa drugs',
  'Latex', 'Peanuts', 'Shellfish', 'Pollen', 'Dust', 'Bee stings',
]

const DEFAULT_NOTES: MedicalHistory = { conditions: [], allergies: [], medications: '', surgeries: '', familyHistory: '', otherConditions: '' }

export function MedicalHistoryScreen({ navigation }: Props) {
  const { theme: t }          = useTheme()
  const { user, refreshProfile } = useAuth()

  const [appts,    setAppts]   = useState<any[]>([])
  const [notes,    setNotes]   = useState<MedicalHistory>(DEFAULT_NOTES)
  const [loading,  setLoading] = useState(true)
  const [tab,      setTab]     = useState<'history' | 'profile'>('profile')
  const [saving,   setSaving]  = useState(false)

  // Editable profile fields
  const [bloodGroup, setBloodGroup] = useState(user?.blood_group ?? '')
  const [gender,     setGender]     = useState(user?.gender ?? '')
  const [dob,        setDob]        = useState(user?.date_of_birth ?? '')
  const [otherConditions, setOtherConditions] = useState('')

  // ML3: Re-sync form fields when user context refreshes (e.g. after saving)
  useEffect(() => {
    setBloodGroup(user?.blood_group ?? '')
    setGender(user?.gender ?? '')
    setDob(user?.date_of_birth ?? '')
  }, [user?.blood_group, user?.gender, user?.date_of_birth])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [completed, history] = await Promise.all([
      getCompletedAppointments(user.id),
      getMedicalHistory(user.id),
    ])
    setAppts(completed)
    setNotes(history)
    setOtherConditions(history.otherConditions ?? '')
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function saveNotes(updated: MedicalHistory) {
    setNotes(updated)
    if (!user) return
    await updateMedicalHistory(user.id, updated)
  }

  function toggleCondition(c: string) {
    const updated = notes.conditions.includes(c)
      ? { ...notes, conditions: notes.conditions.filter(x => x !== c) }
      : { ...notes, conditions: [...notes.conditions, c] }
    saveNotes(updated)
  }

  function toggleAllergy(a: string) {
    const updated = notes.allergies.includes(a)
      ? { ...notes, allergies: notes.allergies.filter(x => x !== a) }
      : { ...notes, allergies: [...notes.allergies, a] }
    saveNotes(updated)
  }

  async function saveProfile() {
    if (!user) return
    setSaving(true)
    const ok = await updateUserProfile(user.id, {
      blood_group:    bloodGroup || undefined,
      gender:         gender     || undefined,
      date_of_birth:  dob        || undefined,
    })
    setSaving(false)
    if (ok) {
      await refreshProfile()
      Alert.alert('Saved', 'Your health profile has been updated.')
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Medical History</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Tabs */}
      <View style={[s.tabBar, { borderBottomColor: t.cardBorder }]}>
        {(['profile', 'history'] as const).map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={s.tabItem}>
            <Text style={[s.tabText, { color: tab === tb ? t.accent : t.textMuted, fontWeight: tab === tb ? '700' : '400' }]}>
              {tb === 'profile' ? 'Health Profile' : 'Consultations'}
            </Text>
            <View style={[s.tabUnderline, { backgroundColor: tab === tb ? t.accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

          {/* ── Health Profile Tab ── */}
          {tab === 'profile' && (
            <>
              {/* Basic info */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Basic information</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <Text style={[s.fieldLabel, { color: t.textMuted }]}>Blood group</Text>
                <View style={s.pillRow}>
                  {BLOOD_GROUPS.map(bg => (
                    <TouchableOpacity key={bg} onPress={() => setBloodGroup(bg)}
                      style={[s.pill, { borderColor: bloodGroup === bg ? t.accent : t.cardBorder, backgroundColor: bloodGroup === bg ? t.accentBg : t.inputBg }]}>
                      <Text style={[s.pillText, { color: bloodGroup === bg ? t.accent : t.textMuted, fontWeight: bloodGroup === bg ? '700' : '400' }]}>{bg}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.fieldLabel, { color: t.textMuted, marginTop: 14 }]}>Gender</Text>
                <View style={s.pillRow}>
                  {GENDERS.map(g => (
                    <TouchableOpacity key={g} onPress={() => setGender(g.toLowerCase())}
                      style={[s.pill, { borderColor: gender === g.toLowerCase() ? t.accent : t.cardBorder, backgroundColor: gender === g.toLowerCase() ? t.accentBg : t.inputBg }]}>
                      <Text style={[s.pillText, { color: gender === g.toLowerCase() ? t.accent : t.textMuted, fontWeight: gender === g.toLowerCase() ? '700' : '400' }]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.fieldLabel, { color: t.textMuted, marginTop: 14 }]}>Date of birth</Text>
                <TextInput
                  value={dob} onChangeText={setDob}
                  placeholder="YYYY-MM-DD" placeholderTextColor={t.textMuted}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />

                <TouchableOpacity onPress={saveProfile} disabled={saving}
                  style={[s.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}>
                  <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
                </TouchableOpacity>
              </View>

              {/* Conditions */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Current conditions</Text>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Tap to select any that apply to you</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={s.pillRow}>
                  {CONDITION_PROMPTS.map(c => (
                    <TouchableOpacity key={c} onPress={() => toggleCondition(c)}
                      style={[s.pill, { borderColor: notes.conditions.includes(c) ? t.accent : t.cardBorder, backgroundColor: notes.conditions.includes(c) ? t.accentBg : t.inputBg }]}>
                      <Text style={[s.pillText, { color: notes.conditions.includes(c) ? t.accent : t.textMuted, fontWeight: notes.conditions.includes(c) ? '700' : '400' }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.fieldLabel, { color: t.textMuted, marginTop: 12 }]}>Other conditions</Text>
                <TextInput
                  value={otherConditions}
                  onChangeText={setOtherConditions}
                  onEndEditing={() => saveNotes({ ...notes, otherConditions })}
                  placeholder="Type any other conditions…"
                  placeholderTextColor={t.textMuted}
                  style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>

              {/* Allergies */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Allergies</Text>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Select all that apply</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={s.pillRow}>
                  {ALLERGY_PROMPTS.map(a => (
                    <TouchableOpacity key={a} onPress={() => toggleAllergy(a)}
                      style={[s.pill, { borderColor: notes.allergies.includes(a) ? '#FF5C5C' : t.cardBorder, backgroundColor: notes.allergies.includes(a) ? 'rgba(255,92,92,0.1)' : t.inputBg }]}>
                      <Text style={[s.pillText, { color: notes.allergies.includes(a) ? '#FF5C5C' : t.textMuted, fontWeight: notes.allergies.includes(a) ? '700' : '400' }]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Medications */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Current medications</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <TextInput
                  value={notes.medications} onChangeText={v => saveNotes({ ...notes, medications: v })}
                  placeholder="e.g. Lisinopril 10mg daily, Metformin 500mg twice daily…"
                  placeholderTextColor={t.textMuted} multiline numberOfLines={3}
                  style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>

              {/* Surgeries */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Previous surgeries / procedures</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <TextInput
                  value={notes.surgeries} onChangeText={v => saveNotes({ ...notes, surgeries: v })}
                  placeholder="e.g. Appendectomy (2019), Cesarean section (2021)…"
                  placeholderTextColor={t.textMuted} multiline numberOfLines={3}
                  style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>

              {/* Family history */}
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Family medical history</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <TextInput
                  value={notes.familyHistory} onChangeText={v => saveNotes({ ...notes, familyHistory: v })}
                  placeholder="e.g. Father — hypertension, diabetes. Mother — breast cancer…"
                  placeholderTextColor={t.textMuted} multiline numberOfLines={4}
                  style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                />
              </View>
            </>
          )}

          {/* ── Consultations Tab ── */}
          {tab === 'history' && (
            <>
              <Text style={[s.sectionSub, { color: t.textMuted, marginBottom: 14 }]}>
                Summaries of your completed doctor visits
              </Text>
              {appts.length === 0 ? (
                <View style={[s.emptyCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <Text style={{ fontSize: 36, marginBottom: 10 }}>🩺</Text>
                  <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No consultations yet</Text>
                  <Text style={[s.emptySub, { color: t.textMuted }]}>Completed appointments will appear here with doctor notes and summaries.</Text>
                </View>
              ) : (
                appts.map(a => (
                  <View key={a.id} style={[s.apptCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <View style={s.apptHeader}>
                      <View style={[s.apptAvatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                        <Text style={[s.apptAvatarText, { color: t.accent }]}>
                          {(a.doctor?.full_name ?? 'Dr').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.apptDoctor, { color: t.textPrimary }]}>{a.doctor?.full_name ?? 'Doctor'}</Text>
                        <Text style={[s.apptSpec, { color: t.textMuted }]}>
                          {a.doctor?.specialty?.name ?? 'Specialist'} · {a.hospital?.name ?? ''}
                        </Text>
                      </View>
                      <Text style={[s.apptDate, { color: t.textMuted }]}>{a.appointment_date}</Text>
                    </View>
                    {a.reason && (
                      <View style={[s.apptSection, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.apptSectionLabel, { color: t.textMuted }]}>Reason for visit</Text>
                        <Text style={[s.apptSectionValue, { color: t.textPrimary }]}>{a.reason}</Text>
                      </View>
                    )}
                    {(a.vitals_weight_kg || a.vitals_height_cm || a.vitals_bp_systolic || a.vitals_blood_sugar) && (
                      <View style={[s.apptSection, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.apptSectionLabel, { color: t.textMuted }]}>Vitals</Text>
                        <View style={s.vitalsRow}>
                          {a.vitals_weight_kg != null && (
                            <View style={[s.vitalPill, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                              <Text style={[s.vitalPillText, { color: t.textPrimary }]}>{a.vitals_weight_kg} kg</Text>
                              <Text style={[s.vitalPillLabel, { color: t.textMuted }]}>Weight</Text>
                            </View>
                          )}
                          {a.vitals_height_cm != null && (
                            <View style={[s.vitalPill, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                              <Text style={[s.vitalPillText, { color: t.textPrimary }]}>{a.vitals_height_cm} cm</Text>
                              <Text style={[s.vitalPillLabel, { color: t.textMuted }]}>Height</Text>
                            </View>
                          )}
                          {a.vitals_bmi != null && (
                            <View style={[s.vitalPill, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                              <Text style={[s.vitalPillText, { color: t.accent }]}>{a.vitals_bmi}</Text>
                              <Text style={[s.vitalPillLabel, { color: t.accent }]}>BMI</Text>
                            </View>
                          )}
                          {a.vitals_bp_systolic != null && a.vitals_bp_diastolic != null && (
                            <View style={[s.vitalPill, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                              <Text style={[s.vitalPillText, { color: t.textPrimary }]}>{a.vitals_bp_systolic}/{a.vitals_bp_diastolic}</Text>
                              <Text style={[s.vitalPillLabel, { color: t.textMuted }]}>Blood Pressure</Text>
                            </View>
                          )}
                          {a.vitals_blood_sugar != null && (
                            <View style={[s.vitalPill, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                              <Text style={[s.vitalPillText, { color: t.textPrimary }]}>{a.vitals_blood_sugar} mg/dL</Text>
                              <Text style={[s.vitalPillLabel, { color: t.textMuted }]}>Blood Sugar</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                    {a.diagnosis && (
                      <View style={[s.apptSection, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.apptSectionLabel, { color: t.textMuted }]}>Diagnosis</Text>
                        <Text style={[s.apptSectionValue, { color: t.textPrimary }]}>{a.diagnosis}</Text>
                      </View>
                    )}
                    {a.doctor_notes && (
                      <View style={[s.apptSection, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.apptSectionLabel, { color: t.textMuted }]}>Doctor's notes</Text>
                        <Text style={[s.apptSectionValue, { color: t.textPrimary }]}>{a.doctor_notes}</Text>
                      </View>
                    )}
                    <View style={[s.apptFooter, { borderTopColor: t.cardBorder }]}>
                      <View style={[s.apptTypeBadge, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                        <Text style={[s.apptTypeBadgeText, { color: t.textMuted }]}>
                          {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'} · {a.booking_ref}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:              { flex: 1 },
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  back:              { fontSize: 22 },
  title:             { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  tabBar:            { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tabItem:           { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:           { fontSize: 13 },
  tabUnderline:      { height: 2, width: '80%', borderRadius: 99, marginTop: 4 },
  sectionTitle:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, marginTop: 16 },
  sectionSub:        { fontSize: 11, marginBottom: 8 },
  card:              { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 4 },
  fieldLabel:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  pillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:              { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  pillText:          { fontSize: 11 },
  input:             { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, marginTop: 4 },
  textarea:          { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  saveBtn:           { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 14 },
  saveBtnText:       { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyCard:         { borderRadius: 18, borderWidth: 1, padding: 32, alignItems: 'center' },
  emptyTitle:        { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  emptySub:          { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  apptCard:          { borderRadius: 16, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  apptHeader:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  apptAvatar:        { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  apptAvatarText:    { fontSize: 12, fontWeight: '700' },
  apptDoctor:        { fontSize: 13, fontWeight: '700' },
  apptSpec:          { fontSize: 11, marginTop: 1 },
  apptDate:          { fontSize: 11 },
  apptSection:       { borderTopWidth: 1, padding: 12 },
  apptSectionLabel:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  apptSectionValue:  { fontSize: 12, lineHeight: 18 },
  apptFooter:        { borderTopWidth: 1, padding: 10, flexDirection: 'row' },
  apptTypeBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  apptTypeBadgeText: { fontSize: 10, fontWeight: '600' },
  vitalsRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vitalPill:         { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 68 },
  vitalPillText:     { fontSize: 13, fontWeight: '700' },
  vitalPillLabel:    { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
})
