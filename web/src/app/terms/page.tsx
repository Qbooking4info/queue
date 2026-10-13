import type { Metadata } from 'next'
import { LegalPage, Section } from '@/components/legal/LegalPage'

export const metadata: Metadata = { title: 'Terms of Service · Queue' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="12 October 2026">
      <p>These terms govern your use of Queue, Queue Doctor, Queue Hospital and Queue Ambulance (together, &ldquo;Queue&rdquo;). By creating an account you agree to them.</p>
      <Section title="1. What Queue does">
        <p>Queue helps you find and book care, join hospital queues, consult doctors online, request ambulances and keep your health records in one place. Queue connects you with independent hospitals, doctors and ambulance operators; they, not Queue, provide the care.</p>
      </Section>
      <Section title="2. Emergencies">
        <p>Queue is not a substitute for emergency services. If you or someone else is in danger, call 112 or 767 immediately. Ambulance availability and arrival times are estimates and are not guaranteed.</p>
      </Section>
      <Section title="3. Your account">
        <p>You must give accurate information and keep your password private. You are responsible for activity on your account, including accounts you manage for family members. Health professionals must hold a valid licence and keep it current.</p>
      </Section>
      <Section title="4. Payments, wallet and refunds">
        <p>Payments are processed by Paystack. Booking fees and consultation prices are shown before you pay. Wallet balances can only be used within Queue, are not interest-bearing, and are not a bank account. Refunds follow the cancellation policy shown at booking: full refund more than 24 hours before the visit, otherwise 50%.</p>
      </Section>
      <Section title="5. Messaging">
        <p>Messages are for care coordination. Do not use chat for emergencies. Doctors are not required to reply outside their working hours.</p>
      </Section>
      <Section title="6. Acceptable use">
        <p>Do not misuse Queue, impersonate others, harass staff or patients, or attempt to access data that is not yours. We may suspend accounts that do.</p>
      </Section>
      <Section title="7. Deleting your account">
        <p>You can delete your account at any time from Profile. Some records may be kept where the law or a hospital&apos;s medical-records duty requires it.</p>
      </Section>
      <Section title="8. Liability">
        <p>To the extent the law allows, Queue is not liable for the clinical care provided by hospitals, doctors or ambulance operators, or for losses caused by events outside our control.</p>
      </Section>
      <Section title="9. Contact">
        <p>Questions about these terms: qbooking4info@gmail.com.</p>
      </Section>
    </LegalPage>
  )
}
