import { useState, useCallback, useEffect } from 'react'
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Chip,
  Field, Notice, Btn, Empty, Initials,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { getCompletedAppointments, updateUserProfile, getMedicalHistory, updateMedicalHistory } from '@queue/shared/lib/api'
import type { MedicalHistory } from '@queue/shared/lib/api'
import { DateOfBirthSelect } from '@queue/shared/components/ui/DateOfBirthSelect'

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

const DEFAULT_NOTES: MedicalHistory = { conditions: [], allergies: [], medications: '', surgeries: '', familyHistory: '', otherConditions: '', otherAllergies: '' }

export function MedicalHistoryScreen({ navigation }: Props) {
  const { theme: t }          = useTheme()
  const { user, refreshProfile } = useAuth()

  const [appts,    setAppts]   = useState<any[]>([])
  const [notes,    setNotes]   = useState<MedicalHistory>(DEFAULT_NOTES)
  const [loading,  setLoading] = useState(true)
  const [tab,      setTab]     = useState<'history' | 'profile'>('profile')
  const [saving,   setSaving]  = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Editable profile fields
  const [bloodGroup, setBloodGroup] = useState(user?.blood_group ?? '')
  const [gender,     setGender]     = useState(user?.gender ?? '')
  const [dob,        setDob]        = useState(user?.date_of_birth ?? '')
  const [otherConditions, setOtherConditions] = useState('')
  const [otherAllergies, setOtherAllergies] = useState('')

  // ML3: Re-sync form fields when user context refreshes (e.g. after saving)
  useEffect(() => {
    setBloodGroup(user?.blood_group ?? '')
    setGender(user?.gender ?? '')
    setDob(user?.date_of_birth ?? '')
  }, [user?.blood_group, user?.gender, user?.date_of_birth])

  const load = useCallback(async () => {
    // No signed-in user means there is nothing to load and never will be;
    // returning without clearing `loading` leaves a spinner for ever.
    if (!user) { setLoading(false); return }
    setLoading(true)
    const [completed, historyResult] = await Promise.all([
      getCompletedAppointments(user.id),
      getMedicalHistory(user.id),
    ])
    setAppts(completed)
    if (historyResult.ok) {
      setHistoryError(null)
      setNotes(historyResult.data)
      setOtherConditions(historyResult.data.otherConditions ?? '')
      setOtherAllergies(historyResult.data.otherAllergies ?? '')
    } else {
      // Distinct from "no history recorded" -- a blank allergy list read as
      // "no known allergies" would be a clinically meaningful difference
      // from "we couldn't load it."
      setHistoryError(historyResult.error)
    }
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function saveNotes(updated: MedicalHistory) {
    const previous = notes
    setNotes(updated)
    if (!user) return
    const result = await updateMedicalHistory(user.id, updated)
    if (!result.ok) {
      setNotes(previous)
      Alert.alert('Could not save', 'Your change was not saved. Please check your connection and try again.')
    }
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
    <Screen>
      <AppBar title="Health profile" onBack={() => navigation.goBack()} />
      <Seg<'profile' | 'history'>
        value={tab}
        onChange={setTab}
        options={[{ key: 'profile', label: 'Health profile' }, { key: 'history', label: 'Consultations' }]}
      />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <Body keyboardShouldPersistTaps="handled">

            {/* ── Health profile ── */}
            {tab === 'profile' && (
              <>
                {historyError && (
                  <Notice tone="red" icon="alert-circle-outline">
                    We could not load your conditions, allergies and medications. That is not the same as
                    having none recorded — pull down or tap Retry before assuming the list is empty.
                  </Notice>
                )}
                {historyError && (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <Btn label="Retry" variant="secondary" small onPress={load} />
                  </View>
                )}

                <SectionHead title="Basic information" />
                <Card pad style={{ gap: 16 }}>
                  <View style={{ gap: 8 }}>
                    <CardLabel>Blood group</CardLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {BLOOD_GROUPS.map(bg => (
                        <Chip key={bg} label={bg} on={bloodGroup === bg} onPress={() => setBloodGroup(bg)} />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    <CardLabel>Gender</CardLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {GENDERS.map(g => (
                        <Chip
                          key={g} label={g}
                          on={gender === g.toLowerCase()}
                          onPress={() => setGender(g.toLowerCase())}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    <CardLabel>Date of birth</CardLabel>
                    <DateOfBirthSelect value={dob} onChange={setDob} />
                  </View>

                  <Btn label="Save changes" loading={saving} onPress={saveProfile} />
                </Card>

                <SectionHead title="Current conditions" />
                <Card pad style={{ gap: 14 }}>
                  <Text style={{ fontSize: 12.5, color: t.q.ink60 }}>Tap any that apply to you.</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {CONDITION_PROMPTS.map(c => (
                      <Chip key={c} label={c} on={notes.conditions.includes(c)} onPress={() => toggleCondition(c)} />
                    ))}
                  </View>
                  <Field
                    label="Anything else"
                    value={otherConditions}
                    onChangeText={setOtherConditions}
                    onEndEditing={() => saveNotes({ ...notes, otherConditions })}
                    placeholder="Type any other conditions…"
                  />
                </Card>

                <SectionHead title="Allergies" />
                <Card pad style={{ gap: 14 }}>
                  {/* Allergies are the one list on this screen a clinician reads
                      first, so a selected allergy is drawn in the alert tone
                      rather than the ordinary selected tone. */}
                  <Text style={{ fontSize: 12.5, color: t.q.ink60 }}>Select all that apply.</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ALLERGY_PROMPTS.map(a => {
                      const on = notes.allergies.includes(a)
                      return (
                        <Pressable
                          key={a}
                          onPress={() => toggleAllergy(a)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={{
                            minHeight: 36, paddingHorizontal: 14, borderRadius: 999,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: on ? t.q.redBg : t.q.surface,
                            borderWidth: 1, borderColor: on ? t.q.redFill : t.q.line,
                          }}>
                          <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? t.q.red : t.q.ink70 }}>
                            {a}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Field
                    label="Anything else"
                    value={otherAllergies}
                    onChangeText={setOtherAllergies}
                    onEndEditing={() => saveNotes({ ...notes, otherAllergies })}
                    placeholder="Type any other allergies…"
                  />
                </Card>

                <SectionHead title="Current medications" />
                <View style={{ paddingHorizontal: 16 }}>
                  <Field
                    label="What you take now"
                    value={notes.medications}
                    onChangeText={v => saveNotes({ ...notes, medications: v })}
                    multiline numberOfLines={3}
                    placeholder="e.g. Amlodipine 5 mg daily, Metformin 500 mg twice daily…"
                    style={{ minHeight: 80, textAlignVertical: 'top' }}
                  />
                </View>

                <SectionHead title="Previous surgeries" />
                <View style={{ paddingHorizontal: 16 }}>
                  <Field
                    label="Operations and procedures"
                    value={notes.surgeries}
                    onChangeText={v => saveNotes({ ...notes, surgeries: v })}
                    multiline numberOfLines={3}
                    placeholder="e.g. Appendectomy (2019), caesarean section (2021)…"
                    style={{ minHeight: 80, textAlignVertical: 'top' }}
                  />
                </View>

                <SectionHead title="Family history" />
                <View style={{ paddingHorizontal: 16 }}>
                  <Field
                    label="Conditions that run in your family"
                    value={notes.familyHistory}
                    onChangeText={v => saveNotes({ ...notes, familyHistory: v })}
                    multiline numberOfLines={4}
                    placeholder="e.g. Father — hypertension, diabetes. Mother — breast cancer…"
                    style={{ minHeight: 96, textAlignVertical: 'top' }}
                  />
                </View>

                <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                  <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                    Your health profile is shared with a hospital only when you book there.
                  </Text>
                </View>
              </>
            )}

            {/* ── Consultations ── */}
            {tab === 'history' && (
              appts.length === 0 ? (
                <Card style={{ marginTop: 16 }}>
                  <Empty
                    icon="medical-outline"
                    title="No consultations yet"
                    body="A completed visit appears here with the doctor's notes and summary."
                  />
                </Card>
              ) : (
                <>
                  <SectionHead title={`${appts.length} completed ${appts.length === 1 ? 'visit' : 'visits'}`} />
                  <Card>
                    {appts.map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Hair />}
                        <Row
                          leading={<Initials name={a.doctor?.full_name} size={40} tint="#7C2D12" />}
                          title={a.doctor?.full_name ?? 'Doctor'}
                          sub={[
                            a.doctor?.specialty?.name,
                            a.hospital?.name,
                            new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }),
                          ].filter(Boolean).join(' · ')}
                          pill={a.diagnosis ? 'Diagnosed' : 'Seen'}
                          pillTone={a.diagnosis ? 'green' : 'neutral'}
                          chevron
                          onPress={() => navigation.navigate('AppointmentDetail', { appointment: a })}
                        />
                      </View>
                    ))}
                  </Card>
                </>
              )
            )}
          </Body>
        </KeyboardAvoidingView>
      )}
    </Screen>
  )
}
