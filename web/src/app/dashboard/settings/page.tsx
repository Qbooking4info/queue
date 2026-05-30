import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) redirect('/onboarding')

  const { data: adminRecord } = await db
    .from('hospital_admins')
    .select('hospital_id, role')
    .eq('user_id', profile.id)
    .single()
  if (!adminRecord) redirect('/onboarding')

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
      <h1 className="text-2xl font-bold mb-8">Hospital Settings</h1>

      {/* Profile */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-4">Profile</h2>
        <div className="grid gap-3 text-sm">
          {[
            { label: 'Name',         value: hospital?.name },
            { label: 'Type',         value: hospital?.type },
            { label: 'Address',      value: hospital?.address },
            { label: 'City / State', value: `${hospital?.city}, ${hospital?.state}` },
            { label: 'Phone',        value: hospital?.phone ?? '—' },
            { label: 'Email',        value: hospital?.email ?? '—' },
            { label: 'WhatsApp',     value: hospital?.whatsapp ?? '—' },
            { label: 'Verified',     value: hospital?.is_verified ? '✓ Yes' : '⏳ Pending verification' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2 border-b border-white/5">
              <span className="text-[#7A9089]">{row.label}</span>
              <span className="text-right font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-4">Features</h2>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Virtual Consultations', active: hospital?.accepts_virtual, icon: '💻' },
            { label: '24/7 Emergency',        active: hospital?.emergency_hours,  icon: '🚨' },
          ].map(f => (
            <div key={f.label} className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2"><span>{f.icon}</span>{f.label}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full border ${f.active ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-[#4A6058] bg-white/5 border-white/10'}`}>
                {f.active ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Operating Hours */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5 mb-4">
        <h2 className="font-bold mb-4">Operating Hours</h2>
        <div className="flex flex-col gap-1.5 text-sm">
          {DAYS.map((day, i) => {
            const h = hours.find((oh: { day_of_week: number }) => oh.day_of_week === i)
            return (
              <div key={day} className="flex justify-between py-1.5 border-b border-white/5">
                <span className="text-[#7A9089]">{day}</span>
                <span className={h ? 'text-white' : 'text-[#4A6058]'}>
                  {h ? `${h.open_time?.slice(0,5)} – ${h.close_time?.slice(0,5)}` : 'Closed'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Subscription */}
      <section className="bg-[#111915] border border-white/7 rounded-2xl p-5">
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
