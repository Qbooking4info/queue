import { getHospitalContext } from '@/lib/getHospitalContext'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage() {
  const { db, adminRecord } = await getHospitalContext()

  const { data: hospital } = await db
    .from('hospitals')
    .select('*, hospital_operating_hours(*), hospital_specialties(specialty_id, specialties(name, icon)), hospital_subscriptions(status, trial_ends_at, plan_id, subscription_plans(display_name, price_monthly))')
    .eq('id', adminRecord.hospital_id)
    .single()

  const hours = hospital?.hospital_operating_hours ?? []
  const subscription = Array.isArray(hospital?.hospital_subscriptions)
    ? hospital?.hospital_subscriptions[0]
    : hospital?.hospital_subscriptions
  const plan = Array.isArray(subscription?.subscription_plans)
    ? subscription?.subscription_plans[0]
    : subscription?.subscription_plans

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Hospital Settings</h1>

      {/* Read-only info */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-4">Hospital Info</h2>
        <div className="grid gap-2 text-sm">
          {[
            { label: 'Name',         value: hospital?.name },
            { label: 'Type',         value: hospital?.type },
            { label: 'City / State', value: `${hospital?.city}, ${hospital?.state}` },
            { label: 'Verified',     value: hospital?.is_verified ? '✓ Verified' : '⏳ Pending verification' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2 border-b border-white/5">
              <span className="text-[#7A9089]">{row.label}</span>
              <span className="font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Editable form */}
      <SettingsForm
        hospital={{
          id:              hospital?.id ?? '',
          phone:           hospital?.phone ?? null,
          email:           hospital?.email ?? null,
          whatsapp:        hospital?.whatsapp ?? null,
          description:     hospital?.description ?? null,
          address:         hospital?.address ?? '',
          accepts_virtual: hospital?.accepts_virtual ?? false,
          emergency_hours: hospital?.emergency_hours ?? false,
        }}
        hours={hours}
      />

      {/* Subscription */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5 mt-4">
        <h2 className="font-bold mb-4">Subscription</h2>
        {subscription ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#7A9089]">Plan</span>
              <span className="font-bold text-green-400">{plan?.display_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A9089]">Price</span>
              <span>₦{plan?.price_monthly?.toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#7A9089]">Status</span>
              <span className={`capitalize px-2.5 py-0.5 rounded-full border text-xs font-bold ${
                subscription.status === 'trialing' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                subscription.status === 'active'   ? 'text-green-400 bg-green-500/10 border-green-500/20' :
                'text-red-400 bg-red-500/10 border-red-500/20'
              }`}>{subscription.status}</span>
            </div>
            {subscription.trial_ends_at && (
              <div className="flex justify-between">
                <span className="text-[#7A9089]">Trial ends</span>
                <span>{subscription.trial_ends_at}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#4A6058]">No active subscription</p>
        )}
      </section>
    </div>
  )
}
