import type { Metadata } from 'next'
import { LegalPage, Section } from '@/components/legal/LegalPage'

export const metadata: Metadata = { title: 'Privacy Policy · Queue' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="12 October 2026">
      <p>This policy explains what personal data Queue collects, why, and your rights under the Nigeria Data Protection Act 2023.</p>
      <Section title="What we collect">
        <p>Account details (name, email, phone, date of birth, profile photo); health information you or your care providers add (appointments, vitals, notes, prescriptions, allergies); payment records (handled by Paystack &mdash; we never store full card numbers); messages; and, when you request an ambulance or a crew is on duty, location.</p>
      </Section>
      <Section title="Why we use it">
        <p>To book and deliver your care, run hospital queues, dispatch ambulances, process payments and refunds, keep the service secure, and meet legal obligations. We do not sell your data.</p>
      </Section>
      <Section title="Who can see it">
        <p>Only the hospitals, doctors and ambulance crews involved in your care, and Queue staff who need it to support you. Payment data is shared with Paystack. Data may be disclosed where the law requires.</p>
      </Section>
      <Section title="How long we keep it">
        <p>For as long as your account is open, then only as long as the law or medical-records rules require. Deleting your account removes your sign-in and personal profile.</p>
      </Section>
      <Section title="Your rights">
        <p>You can access, correct, download or delete your data, and object to some processing. Delete your account from Profile, or email qbooking4info@gmail.com. You can also complain to the Nigeria Data Protection Commission.</p>
      </Section>
      <Section title="Security">
        <p>Data is encrypted in transit, access is limited by role, and you can lock the app with your fingerprint or face.</p>
      </Section>
    </LegalPage>
  )
}
