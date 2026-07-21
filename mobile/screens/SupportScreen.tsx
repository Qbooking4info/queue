import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Linking, Alert,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any }

const FAQS = [
  { q: 'How do I book an appointment?', a: 'Go to the Search tab or tap a hospital on the Home screen. Select a doctor, choose a date and time slot, fill in your details and confirm payment.' },
  { q: 'Can I book for a family member?', a: 'Yes. During the booking flow, choose "A dependent" in the Booking for step. You can add dependents in Profile → Manage dependents.' },
  { q: 'How do I cancel or reschedule?', a: 'Open the appointment in the Bookings tab and tap Reschedule or Cancel. Cancellations made at least 24 hours before receive a full refund.' },
  { q: 'What payment methods are accepted?', a: 'We accept debit/credit cards, bank transfer, USSD, and HMO insurance. You can switch your payment method before confirming.' },
  { q: 'How does the virtual consultation work?', a: 'Choose "Virtual" when selecting consultation type. A video room link will be sent to you 5 minutes before your slot. Join from the Bookings tab.' },
  { q: 'Is my health data secure?', a: 'Yes. All data is encrypted in transit and at rest. We comply with NDPR (Nigeria Data Protection Regulation) and never share identifiable data without consent.' },
  { q: 'What is the emergency booking premium?', a: 'A dedicated Emergency Booking (from the red banner on Home) carries a 2× fee and places you at the top of the queue. Flagging a regular booking as "Emergency" during Details carries a 1.5× fee. Either way, a doctor is prioritized for you at the hospital.' },
  { q: 'How do I get a refund?', a: 'Refunds for eligible cancellations are processed within 2–3 business days to your original payment method. Contact support if you have not received your refund.' },
]

export function SupportScreen({ navigation }: Props) {
  const { theme: t }      = useTheme()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [query, setQuery]    = useState('')
  const [sent, setSent]      = useState(false)

  function handleSend() {
    if (!query.trim()) return
    Alert.alert('Message received', "Your message has been received. We'll get back to you within 24 hours.")
    setSent(true)
    setQuery('')
  }

  function handleContact(label: string) {
    if (label === 'Call us')   { Linking.openURL('tel:+2347007838383'); return }
    if (label === 'Email us')  { Linking.openURL('mailto:support@queueapp.ng'); return }
    if (label === 'WhatsApp')  { Linking.openURL('https://wa.me/2347007838383'); return }
    if (label === 'Live chat') { Alert.alert('Coming soon', 'Live chat is not yet available. Use WhatsApp or email for faster support.'); return }
  }

  const CONTACT_OPTIONS = [
    { icon: '💬', label: 'Live chat',  sub: 'Typically replies in minutes',   color: t.accent,   bg: t.accentBg,   border: t.accentBorder },
    { icon: '📞', label: 'Call us',    sub: '+234 700 QUEUE (78383)',           color: '#38BDF8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.3)' },
    { icon: '📧', label: 'Email us',   sub: 'support@queueapp.ng',             color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
    { icon: '💚', label: 'WhatsApp',   sub: 'Chat on WhatsApp',                color: '#4ADE80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' },
  ]

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Support & Help</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[s.heroCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>👋</Text>
          <Text style={[s.heroTitle, { color: t.textPrimary }]}>How can we help?</Text>
          <Text style={[s.heroSub, { color: t.textMuted }]}>Our support team is available 8AM–10PM daily.</Text>
        </View>

        {/* Contact options */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Contact us</Text>
        <View style={s.contactGrid}>
          {CONTACT_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.label} onPress={() => handleContact(opt.label)} style={[s.contactCard, { backgroundColor: opt.bg, borderColor: opt.border }]}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>{opt.icon}</Text>
              <Text style={[s.contactLabel, { color: opt.color }]}>{opt.label}</Text>
              <Text style={[s.contactSub, { color: t.textMuted }]} numberOfLines={1}>{opt.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Send a message */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Send a message</Text>
        <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {sent ? (
            <View style={{ alignItems: 'center', padding: 12 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>✅</Text>
              <Text style={[s.sentTitle, { color: t.textPrimary }]}>Message sent!</Text>
              <Text style={[s.sentSub, { color: t.textMuted }]}>We'll get back to you within 24 hours.</Text>
              <TouchableOpacity onPress={() => setSent(false)} style={[s.sendAgainBtn, { borderColor: t.cardBorder }]}>
                <Text style={[s.sendAgainText, { color: t.accent }]}>Send another message</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                value={query} onChangeText={setQuery}
                placeholder="Describe your issue or question…"
                placeholderTextColor={t.textMuted}
                multiline numberOfLines={4}
                style={[s.textarea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
              />
              <TouchableOpacity onPress={handleSend}
                style={[s.sendBtn, { backgroundColor: t.accent, opacity: query.trim() ? 1 : 0.4 }]}>
                <Text style={s.sendBtnText}>Send message</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* FAQs */}
        <Text style={[s.sectionTitle, { color: t.textMuted }]}>Frequently asked questions</Text>
        {FAQS.map((faq, i) => (
          <TouchableOpacity key={i} onPress={() => setOpenFaq(openFaq === i ? null : i)}
            style={[s.faqItem, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={s.faqHeader}>
              <Text style={[s.faqQ, { color: t.textPrimary, flex: 1 }]}>{faq.q}</Text>
              <Text style={[s.faqArrow, { color: t.textMuted }]}>{openFaq === i ? '▲' : '▼'}</Text>
            </View>
            {openFaq === i && (
              <Text style={[s.faqA, { color: t.textSecondary, borderTopColor: t.cardBorder }]}>{faq.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* App info */}
        <View style={[s.appInfo, { borderTopColor: t.cardBorder }]}>
          <Text style={[s.appInfoText, { color: t.textMuted }]}>Queue · v1.0.0 · queueapp.ng</Text>
          <Text style={[s.appInfoText, { color: t.textMuted }]}>Made with ❤️ in Nigeria</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  back:           { fontSize: 22 },
  title:          { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  heroCard:       { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', marginBottom: 20 },
  heroTitle:      { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  heroSub:        { fontSize: 12, marginTop: 4, textAlign: 'center' },
  sectionTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 4 },
  contactGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  contactCard:    { width: '47%', borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'flex-start' },
  contactLabel:   { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  contactSub:     { fontSize: 10 },
  card:           { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  textarea:       { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, minHeight: 100, textAlignVertical: 'top', marginBottom: 10 },
  sendBtn:        { borderRadius: 12, padding: 13, alignItems: 'center' },
  sendBtnText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  sentTitle:      { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sentSub:        { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  sendAgainBtn:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  sendAgainText:  { fontSize: 12, fontWeight: '600' },
  faqItem:        { borderRadius: 14, borderWidth: 1, marginBottom: 7, overflow: 'hidden' },
  faqHeader:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13 },
  faqQ:           { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  faqArrow:       { fontSize: 11, marginTop: 2 },
  faqA:           { fontSize: 12, lineHeight: 19, borderTopWidth: 1, padding: 13, paddingTop: 10 },
  appInfo:        { alignItems: 'center', paddingTop: 20, borderTopWidth: 1, gap: 4 },
  appInfoText:    { fontSize: 11 },
})
