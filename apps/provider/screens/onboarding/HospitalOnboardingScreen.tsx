import { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import * as Location from 'expo-location'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

const STEPS = ['Basics', 'Verification', 'Location', 'Clinics', 'Specialties', 'Features', 'Hours', 'Plan']
const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun',
  'Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

interface Plan { id: string; name: string; price_monthly: number | null }

// Canonical vocabulary, shared with web and enforced by hospitals_type_check.
// `type` answers what care the facility provides; ownership is its own axis
// below, because the old flat list mixed the two (a federal teaching hospital
// is both, and the list forced a choice).
const HOSPITAL_TYPES: { value: string; label: string }[] = [
  { value: 'hospital',          label: 'General Hospital' },
  { value: 'clinic',            label: 'Clinic' },
  { value: 'specialist_center', label: 'Specialist Centre' },
  { value: 'diagnostic',        label: 'Diagnostic Centre' },
  { value: 'teaching',          label: 'Teaching Hospital' },
  { value: 'maternity',         label: 'Maternity Centre' },
]

const OWNERSHIP_OPTIONS: { value: string; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'federal', label: 'Federal' },
  { value: 'state',   label: 'State' },
  { value: 'mission', label: 'Mission' },
  { value: 'ngo',     label: 'NGO' },
]

interface DayHours { day: number; open: string; close: string; closed: boolean }

function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day, open: '08:00', close: '18:00', closed: day === 0,
  }))
}

interface Specialty { id: string; name: string }

interface Props { navigation: any }

export function HospitalOnboardingScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, refreshProfile, setPendingHospitalOnboarding, signOut } = useAuth()

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Step 0 – Basics
  const [name,        setName]        = useState('')
  const [type,        setType]        = useState('hospital')
  const [ownership,   setOwnership]   = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [whatsapp,    setWhatsapp]    = useState('')

  // Step 1 – Verification
  const [regNumber,  setRegNumber]  = useState('')
  const [mdcnNumber, setMdcnNumber] = useState('')

  // Step 2 – Location
  const [address, setAddress] = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState('')
  const [latitude,  setLatitude]  = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locating,  setLocating]  = useState(false)

  // Step 3 – Clinics
  const [clinicModel, setClinicModel] = useState<'single' | 'multi'>('single')
  const [clinicNames, setClinicNames] = useState<string[]>(['OPD'])

  // Step 4 – Specialties
  const [specialties,     setSpecialties]     = useState<Specialty[]>([])
  const [selectedSpecIds, setSelectedSpecIds] = useState<string[]>([])
  const [specsLoaded,     setSpecsLoaded]     = useState(false)

  // Step 5 – Features
  const [acceptsVirtual,  setAcceptsVirtual]  = useState(false)
  const [emergencyHours,  setEmergencyHours]  = useState(false)
  const [is24Hours,       setIs24Hours]       = useState(false)
  const [approvalMode,    setApprovalMode]    = useState<'auto' | 'manual'>('auto')

  // Step 6 – Hours
  const [hours, setHours] = useState<DayHours[]>(defaultHours())

  // Step 7 – Plan
  const [plans,       setPlans]       = useState<Plan[]>([])
  const [planId,      setPlanId]      = useState<string | null>(null)
  const [plansLoaded, setPlansLoaded] = useState(false)

  useEffect(() => { loadSpecialties() }, [])

  const loadSpecialties = useCallback(async () => {
    if (specsLoaded) return
    const { data } = await supabase.from('specialties').select('id, name').order('name')
    setSpecialties(data ?? [])
    setSpecsLoaded(true)
  }, [specsLoaded])

  function goNext() {
    if (step === 0 && !name.trim()) { Alert.alert('Required', 'Hospital name is required.'); return }
    if (step === 2 && !address.trim()) { Alert.alert('Required', 'Address is required.'); return }
    if (step === 4 && !specsLoaded) loadSpecialties()
    if (step === 6 && !plansLoaded) loadPlans()
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else handleSubmit()
  }

  async function goBack() {
    if (step > 0) { setStep(s => s - 1); return }

    // In the provider app this screen is the whole tree for a newly registered
    // hospital: there is no MainTabs to fall back to (that route belongs to the
    // patient app), and the account has no doctor/staff/crew role yet, so nothing
    // else would render. Backing out therefore means signing out -- which is also
    // the only escape from an account stuck mid-registration, since the auth user's
    // registered_via metadata routes it straight back here on every launch.
    setPendingHospitalOnboarding(false)
    if (navigation.canGoBack()) { navigation.goBack(); return }
    await signOut()
  }

  async function captureLocation() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required to pin your hospital on the map. You can also skip this and set it later from the web portal.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLatitude(pos.coords.latitude)
      setLongitude(pos.coords.longitude)
      haptics.success()
    } catch {
      Alert.alert('Could not get location', 'Please try again, or set your coordinates later from the web portal.')
    } finally {
      setLocating(false)
    }
  }

  const loadPlans = useCallback(async () => {
    if (plansLoaded) return
    const { data } = await supabase
      .from('subscription_plans')
      .select('id, name, price_monthly')
      .eq('is_active', true)
      .order('sort_order')
    const list = (data ?? []) as Plan[]
    setPlans(list)
    // Match web's default so the two clients pre-select the same plan.
    const growth = list.find(pl => pl.name === 'growth')
    if (growth) setPlanId(growth.id)
    setPlansLoaded(true)
  }, [plansLoaded])

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')

      const clinics = clinicModel === 'single'
        ? [{ name: 'OPD', is_opd: true }]
        : clinicNames.filter(n => n.trim()).map((n, i) => ({ name: n.trim(), is_opd: i === 0 }))

      const res = await fetch(`${API_URL}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          name: name.trim(),
          type,
          ownership,
          description: description.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          registrationNumber: regNumber.trim() || null,
          mdcnNumber: mdcnNumber.trim() || null,
          whatsapp: whatsapp.trim() || null,
          address: address.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          latitude,
          longitude,
          clinicModel,
          clinics,
          accepts_virtual: acceptsVirtual,
          emergency_hours: emergencyHours,
          is_24_hours: is24Hours,
          approvalMode,
          specialtyIds: selectedSpecIds,
          hours,
          planId,
        }),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Onboarding failed')

      haptics.success()
      setPendingHospitalOnboarding(false)
      await refreshProfile()
      setDone(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Onboarding failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={72} color="#00C265" style={{ marginBottom: 20 }} />
          <Text style={[s.doneTitle, { color: t.textPrimary }]}>Hospital registered!</Text>
          <Text style={[s.doneSub, { color: t.textMuted }]}>
            {name} is now on Queue.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')}
            style={[s.doneBtn, { backgroundColor: t.accent }]}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={goBack}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.stepLabel, { color: t.textMuted }]}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress bar */}
      <View style={[s.progressTrack, { backgroundColor: t.cardBorder }]}>
        <View style={[s.progressFill, { backgroundColor: t.accent, width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* ── STEP 0: Basics ── */}
          {step === 0 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Hospital basics</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>Tell us about your hospital.</Text>
              <Field label="Hospital Name *" value={name} onChange={setName} placeholder="e.g. Lagos General Hospital" theme={t} />
              <Field label="Email" value={email} onChange={setEmail} placeholder="admin@hospital.com" keyboard="email-address" theme={t} />
              <Field label="Phone" value={phone} onChange={setPhone} placeholder="+234 000 000 0000" keyboard="phone-pad" theme={t} />
              <Field label="WhatsApp (optional)" value={whatsapp} onChange={setWhatsapp} placeholder="+234 000 000 0000" keyboard="phone-pad" theme={t} />
              <Text style={[s.fieldLabel, { color: t.textMuted }]}>HOSPITAL TYPE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {HOSPITAL_TYPES.map(tp => (
                    <TouchableOpacity key={tp.value} onPress={() => setType(tp.value)}
                      style={[s.chip, { borderColor: type === tp.value ? t.accent : t.cardBorder, backgroundColor: type === tp.value ? `${t.accent}18` : t.cardBg }]}>
                      <Text style={[s.chipText, { color: type === tp.value ? t.accent : t.textMuted }]}>{tp.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={[s.fieldLabel, { color: t.textMuted }]}>OWNERSHIP (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {OWNERSHIP_OPTIONS.map(op => {
                    const active = ownership === op.value
                    return (
                      <TouchableOpacity key={op.value} onPress={() => setOwnership(active ? null : op.value)}
                        style={[s.chip, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? `${t.accent}18` : t.cardBg }]}>
                        <Text style={[s.chipText, { color: active ? t.accent : t.textMuted }]}>{op.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>

              <Field label="Description (optional)" value={description} onChange={setDescription} placeholder="Brief description of your hospital…" multiline theme={t} />
            </>
          )}

          {/* ── STEP 1: Verification ── */}
          {step === 1 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Verification</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>Your registration details help us verify your hospital.</Text>
              <Field label="CAC/Hospital Reg. Number" value={regNumber} onChange={setRegNumber} placeholder="RC 000000" theme={t} />
              <Field label="MDCN/NHI Number (optional)" value={mdcnNumber} onChange={setMdcnNumber} placeholder="MDCN/..." theme={t} />
              <View style={[s.infoBanner, { backgroundColor: `${t.accent}10`, borderColor: `${t.accent}30` }]}>
                <Ionicons name="information-circle-outline" size={16} color={t.accent} />
                <Text style={[s.infoText, { color: t.textMuted }]}>Your details are reviewed by our team. You can still proceed while verification is pending.</Text>
              </View>
            </>
          )}

          {/* ── STEP 2: Location ── */}
          {step === 2 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Location</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>Where is your hospital located?</Text>
              <Field label="Address *" value={address} onChange={setAddress} placeholder="12 Hospital Road" theme={t} />
              <Field label="City" value={city} onChange={setCity} placeholder="Lagos" theme={t} />

              <Text style={[s.fieldLabel, { color: t.textMuted }]}>STATE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {NIGERIAN_STATES.map(st => (
                    <TouchableOpacity key={st} onPress={() => setState(st)}
                      style={[s.chip, { borderColor: state === st ? t.accent : t.cardBorder, backgroundColor: state === st ? `${t.accent}18` : t.cardBg }]}>
                      <Text style={[s.chipText, { color: state === st ? t.accent : t.textMuted }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Coordinates. Ambulance dispatch ranks candidate hospitals by
                  distance and the patient directory sorts by proximity, so a
                  hospital with no coordinates is invisible to both. Neither
                  client captured this before — the column was sent as null. */}
              <Text style={[s.fieldLabel, { color: t.textMuted }]}>MAP COORDINATES</Text>
              <TouchableOpacity onPress={captureLocation} disabled={locating}
                style={[s.addBtn, { borderColor: latitude != null ? t.accent : t.cardBorder, backgroundColor: t.cardBg, marginBottom: 8 }]}>
                {locating
                  ? <ActivityIndicator size="small" color={t.accent} />
                  : <Ionicons name={latitude != null ? 'checkmark-circle' : 'location-outline'} size={16} color={latitude != null ? t.accent : t.textMuted} />}
                <Text style={[s.addBtnText, { color: latitude != null ? t.accent : t.textMuted }]}>
                  {locating ? 'Getting location…' : latitude != null ? 'Location captured' : 'Use my current location'}
                </Text>
              </TouchableOpacity>
              {latitude != null && longitude != null && (
                <Text style={[s.infoText, { color: t.textMuted, marginBottom: 12 }]}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)} — stand at the hospital for an accurate pin.
                </Text>
              )}
            </>
          )}

          {/* ── STEP 3: Clinic Structure ── */}
          {step === 3 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Clinic structure</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>How is your hospital organised?</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {[
                  { key: 'single' as const, label: 'Single OPD', sub: 'One general outpatient department' },
                  { key: 'multi' as const,  label: 'Multiple Clinics', sub: 'Separate clinics e.g. Cardiology, Paeds' },
                ].map(opt => (
                  <TouchableOpacity key={opt.key} onPress={() => setClinicModel(opt.key)}
                    style={[s.modelCard, { flex: 1, borderColor: clinicModel === opt.key ? t.accent : t.cardBorder, backgroundColor: clinicModel === opt.key ? `${t.accent}12` : t.cardBg }]}>
                    <Text style={[s.modelLabel, { color: clinicModel === opt.key ? t.accent : t.textPrimary }]}>{opt.label}</Text>
                    <Text style={[s.modelSub, { color: t.textMuted }]}>{opt.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {clinicModel === 'multi' && (
                <>
                  <Text style={[s.fieldLabel, { color: t.textMuted }]}>CLINIC NAMES</Text>
                  {clinicNames.map((cn, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      <View style={[s.fieldInput, { flex: 1, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                        <TextInput value={cn} onChangeText={v => { const a = [...clinicNames]; a[i] = v; setClinicNames(a) }}
                          placeholder={`Clinic ${i + 1} name`} placeholderTextColor={t.textMuted}
                          style={[s.fieldInputText, { color: t.textPrimary }]} />
                      </View>
                      {clinicNames.length > 1 && (
                        <TouchableOpacity onPress={() => setClinicNames(clinicNames.filter((_, j) => j !== i))}
                          style={[s.removeBtn, { borderColor: t.cardBorder }]}>
                          <Ionicons name="remove" size={16} color="#FF5C5C" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => setClinicNames([...clinicNames, ''])}
                    style={[s.addBtn, { borderColor: t.accent }]}>
                    <Ionicons name="add" size={16} color={t.accent} />
                    <Text style={[s.addBtnText, { color: t.accent }]}>Add clinic</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* ── STEP 4: Specialties ── */}
          {step === 4 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Specialties</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>What specialties does your hospital offer? (Select all that apply)</Text>
              {!specsLoaded ? (
                <View style={{ alignItems: 'center', paddingTop: 40 }}>
                  <ActivityIndicator color={t.accent} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {specialties.map(sp => {
                    const selected = selectedSpecIds.includes(sp.id)
                    return (
                      <TouchableOpacity key={sp.id} onPress={() => {
                        setSelectedSpecIds(prev => selected ? prev.filter(id => id !== sp.id) : [...prev, sp.id])
                      }} style={[s.specChip, { borderColor: selected ? t.accent : t.cardBorder, backgroundColor: selected ? `${t.accent}18` : t.cardBg }]}>
                        <Text style={[s.chipText, { color: selected ? t.accent : t.textMuted }]}>{sp.name}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </>
          )}

          {/* ── STEP 5: Features ── */}
          {step === 5 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Features</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>Configure what your hospital offers.</Text>
              <View style={[s.settingsCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                {[
                  { label: 'Virtual consultations', sub: 'Allow video call bookings', value: acceptsVirtual, set: setAcceptsVirtual },
                  { label: 'Emergency hours', sub: 'Accept walk-ins outside hours', value: emergencyHours, set: setEmergencyHours },
                  { label: '24-hour service', sub: 'Hospital runs around the clock', value: is24Hours, set: setIs24Hours },
                ].map((item, i) => (
                  <View key={item.label} style={[s.settingsRow, { borderTopColor: t.cardBorder, borderTopWidth: i === 0 ? 0 : 1 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontSize: 14, fontWeight: '600', color: t.textPrimary }]}>{item.label}</Text>
                      <Text style={[{ fontSize: 11, color: t.textMuted, marginTop: 2 }]}>{item.sub}</Text>
                    </View>
                    <Switch value={item.value} onValueChange={item.set} trackColor={{ true: t.accent, false: t.cardBorder }} />
                  </View>
                ))}
                <View style={[s.settingsRow, { borderTopColor: t.cardBorder, borderTopWidth: 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '600', color: t.textPrimary }]}>Auto-approve bookings</Text>
                    <Text style={[{ fontSize: 11, color: t.textMuted, marginTop: 2 }]}>Instantly confirm without staff review</Text>
                  </View>
                  <Switch value={approvalMode === 'auto'} onValueChange={v => setApprovalMode(v ? 'auto' : 'manual')}
                    trackColor={{ true: t.accent, false: t.cardBorder }} />
                </View>
              </View>
            </>
          )}

          {/* ── STEP 6: Hours ── */}
          {step === 6 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Operating hours</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>When is your hospital open? You can edit this later.</Text>
              <View style={[s.settingsCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                {hours.map((h, i) => (
                  <View key={h.day} style={[s.hoursRow, { borderTopColor: t.cardBorder, borderTopWidth: i === 0 ? 0 : 1 }]}>
                    <Text style={[s.dayLabel, { color: t.textPrimary }]}>{DAYS[h.day]}</Text>
                    <Switch value={!h.closed}
                      onValueChange={v => { const a = [...hours]; a[i] = { ...a[i], closed: !v }; setHours(a) }}
                      trackColor={{ true: t.accent, false: t.cardBorder }} />
                    {!h.closed && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TimeInput value={h.open} onChange={v => { const a = [...hours]; a[i] = { ...a[i], open: v }; setHours(a) }} theme={t} />
                        <Text style={{ color: t.textMuted }}>–</Text>
                        <TimeInput value={h.close} onChange={v => { const a = [...hours]; a[i] = { ...a[i], close: v }; setHours(a) }} theme={t} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── STEP 7: Plan (summary) ── */}
          {step === 7 && (
            <>
              <Text style={[s.stepTitle, { color: t.textPrimary }]}>Ready to launch</Text>
              <Text style={[s.stepSub, { color: t.textMuted }]}>Review your setup and register your hospital.</Text>

              <View style={[s.summaryCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                {[
                  { label: 'Name',        value: name },
                  { label: 'Type',        value: HOSPITAL_TYPES.find(h => h.value === type)?.label ?? type },
                  { label: 'Address',     value: [address, city, state].filter(Boolean).join(', ') },
                  { label: 'Clinics',     value: clinicModel === 'single' ? 'Single OPD' : `${clinicNames.filter(n => n.trim()).length} clinics` },
                  { label: 'Specialties', value: `${selectedSpecIds.length} selected` },
                  { label: 'Virtual',     value: acceptsVirtual ? 'Enabled' : 'Disabled' },
                  { label: 'Approval',    value: approvalMode === 'auto' ? 'Auto-approve' : 'Manual review' },
                  { label: 'Open 24h',    value: is24Hours ? 'Yes' : 'No' },
                  { label: 'Coordinates', value: latitude != null && longitude != null ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` : 'Not set' },
                ].map((row, i, arr) => (
                  <View key={row.label} style={[s.summaryRow, { borderBottomColor: t.cardBorder, borderBottomWidth: i < arr.length - 1 ? 1 : 0 }]}>
                    <Text style={[s.summaryLabel, { color: t.textMuted }]}>{row.label}</Text>
                    <Text style={[s.summaryValue, { color: t.textPrimary }]} numberOfLines={2}>{row.value || '—'}</Text>
                  </View>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: t.textMuted, marginTop: 20 }]}>SUBSCRIPTION PLAN</Text>
              {!plansLoaded ? (
                <ActivityIndicator color={t.accent} style={{ marginVertical: 16 }} />
              ) : plans.length === 0 ? (
                <View style={[s.infoBanner, { backgroundColor: `${t.accent}10`, borderColor: `${t.accent}30` }]}>
                  <Ionicons name="information-circle-outline" size={16} color={t.accent} />
                  <Text style={[s.infoText, { color: t.textMuted }]}>No plans available right now — a starter plan will be assigned automatically.</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {plans.map(pl => {
                    const active = planId === pl.id
                    return (
                      <TouchableOpacity key={pl.id} onPress={() => setPlanId(pl.id)}
                        style={[s.modelCard, { flexDirection: 'row', alignItems: 'center', gap: 12,
                          borderColor: active ? t.accent : t.cardBorder,
                          backgroundColor: active ? `${t.accent}12` : t.cardBg }]}>
                        <View style={[s.radio, { borderColor: active ? t.accent : t.cardBorder }]}>
                          {active && <View style={[s.radioDot, { backgroundColor: t.accent }]} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.modelLabel, { color: active ? t.accent : t.textPrimary, textTransform: 'capitalize' }]}>{pl.name}</Text>
                          <Text style={[s.modelSub, { color: t.textMuted }]}>
                            {pl.price_monthly ? `₦${pl.price_monthly.toLocaleString()}/month` : 'Free'} · 90-day trial
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom nav */}
      <View style={[s.footer, { backgroundColor: t.canvasBg, borderTopColor: t.cardBorder }]}>
        <TouchableOpacity onPress={goBack} style={[s.backBtn, { borderColor: t.cardBorder }]}>
          <Ionicons name="arrow-back" size={18} color={t.textPrimary} />
          <Text style={[s.backBtnText, { color: t.textPrimary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNext} disabled={submitting}
          style={[s.nextBtn, { backgroundColor: submitting ? `${t.accent}88` : t.accent }]}>
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.nextBtnText}>{step === STEPS.length - 1 ? 'Register' : 'Continue'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function Field({ label, value, onChange, placeholder, keyboard, multiline, theme: t }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; keyboard?: any; multiline?: boolean; theme: any
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.fieldLabel, { color: t.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={[s.fieldInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, ...(multiline ? { height: 80, alignItems: 'flex-start', paddingTop: 12 } : {}) }]}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.textMuted}
          keyboardType={keyboard ?? 'default'} multiline={multiline}
          style={[s.fieldInputText, { color: t.textPrimary }]} />
      </View>
    </View>
  )
}

function TimeInput({ value, onChange, theme: t }: { value: string; onChange: (v: string) => void; theme: any }) {
  return (
    <View style={[s.timeInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
      <TextInput value={value} onChangeText={onChange} maxLength={5} keyboardType="numbers-and-punctuation"
        style={[s.timeInputText, { color: t.textPrimary }]} />
    </View>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  stepLabel:   { fontSize: 12, fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: '#ddd', marginHorizontal: 20, borderRadius: 99 },
  progressFill:  { height: '100%', borderRadius: 99 },
  stepTitle:   { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 4, marginTop: 16 },
  stepSub:     { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  fieldLabel:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  fieldInput:  { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  fieldInputText: { fontSize: 14 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  specChip:    { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  chipText:    { fontSize: 12, fontWeight: '700' },
  modelCard:   { borderRadius: 14, borderWidth: 1, padding: 14 },
  radio:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot:    { width: 8, height: 8, borderRadius: 4 },
  modelLabel:  { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  modelSub:    { fontSize: 11, lineHeight: 16 },
  removeBtn:   { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  addBtnText:  { fontSize: 13, fontWeight: '700' },
  settingsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  hoursRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dayLabel:    { width: 36, fontSize: 12, fontWeight: '700' },
  timeInput:   { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, width: 60 },
  timeInputText: { fontSize: 12, textAlign: 'center' },
  summaryCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  summaryRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  summaryLabel: { fontSize: 12, fontWeight: '500' },
  summaryValue: { fontSize: 12, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  infoBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  infoText:    { flex: 1, fontSize: 12, lineHeight: 18 },
  footer:      { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13 },
  backBtnText: { fontSize: 14, fontWeight: '700' },
  nextBtn:     { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  nextBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  doneTitle:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center', marginBottom: 10 },
  doneSub:     { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn:     { borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
