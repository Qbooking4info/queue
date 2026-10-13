import { useCallback, useState } from 'react'
import { View, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Header, Card, SectionTitle, PrimaryButton, EmptyState } from '@queue/shared/components/ui/v3'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getWallet, topUpWallet, naira, type WalletState } from '@queue/shared/lib/wallet'

const QUICK = [2000, 5000, 10000, 20000]
const TX_META = {
  topup:      { icon: 'add-circle-outline', label: 'Top-up' },
  payment:    { icon: 'calendar-outline',   label: 'Booking payment' },
  refund:     { icon: 'arrow-undo-outline', label: 'Refund' },
  adjustment: { icon: 'swap-vertical',      label: 'Adjustment' },
} as const

export function WalletScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [amount, setAmount] = useState('5000')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => { setWallet(await getWallet()); setRefreshing(false) }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  async function topUp() {
    const n = Math.round(Number(amount))
    if (!n || n < 500) { haptics.error(); Alert.alert('Top up', 'Enter at least ₦500.'); return }
    setBusy(true)
    const r = await topUpWallet(n)
    setBusy(false)
    if (r.status === 'success') { haptics.success(); Alert.alert('Wallet topped up', `${naira(n * 100)} added to your wallet.`) }
    else if (r.status === 'pending') Alert.alert('Almost there', 'We are confirming the payment with your bank. Your balance updates shortly.')
    else if (r.status === 'error') { haptics.error(); Alert.alert('Top up', r.message) }
    load()
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Wallet" subtitle="Pay for visits in one tap" onBack={() => navigation.goBack()}>
        <View>
          <Text style={{ color: '#CCFBF1', fontSize: 13 }}>Available balance</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 }} accessibilityLabel={`Balance ${wallet ? naira(wallet.balanceKobo) : 'loading'}`}>
            {wallet ? naira(wallet.balanceKobo) : '—'}
          </Text>
        </View>
      </Header>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        {wallet?.notReady && (
          <Card style={{ backgroundColor: t.statusBusy.bg, borderColor: t.statusBusy.border }}>
            <Text style={{ fontSize: 13, color: t.textPrimary }}>The wallet is being switched on. You'll be able to top up soon.</Text>
          </Card>
        )}
        <Card style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>Top up</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {QUICK.map(q => {
              const on = String(q) === amount
              return (
                <TouchableOpacity key={q} onPress={() => { haptics.tap(); setAmount(String(q)) }} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center', borderWidth: 1,
                    borderColor: on ? t.accent : t.cardBorder, backgroundColor: on ? t.accentBg : t.cardBg }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: on ? t.accent : t.textSecondary }}>{naira(q * 100)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.textMuted }}>₦</Text>
            <TextInput value={amount} onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Top up amount"
              style={{ flex: 1, minHeight: 48, paddingHorizontal: 8, fontSize: 16, color: t.textPrimary }} />
          </View>
          <PrimaryButton label={`Top up ${amount ? naira(Number(amount) * 100) : ''}`} icon="card-outline" loading={busy} disabled={!!wallet?.notReady} onPress={topUp} />
          <Text style={{ fontSize: 12, color: t.textMuted }}>Secured by Paystack. Card, bank transfer or USSD.</Text>
        </Card>

        <SectionTitle title="History" />
        {!wallet ? <SkeletonCard /> : wallet.transactions.length === 0 ? (
          <EmptyState icon="wallet-outline" title="No transactions yet" body="Top-ups, payments and refunds show up here." />
        ) : (
          <Card style={{ paddingVertical: 0 }}>
            {wallet.transactions.map((tx, i) => {
              const meta = TX_META[tx.type]
              const credit = tx.amount_kobo > 0
              return (
                <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8,
                  borderBottomWidth: i === wallet.transactions.length - 1 ? 0 : 1, borderBottomColor: t.cardBorder }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={meta.icon as any} size={20} color={t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: t.textPrimary }}>{tx.description || meta.label}</Text>
                    <Text style={{ fontSize: 12, color: t.textMuted }}>
                      {new Date(tx.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                      {tx.status !== 'success' ? ` · ${tx.status === 'pending' ? 'Pending' : 'Failed'}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: tx.status === 'failed' ? t.textMuted : credit ? t.statusSuccess.text : t.textPrimary }}>
                    {credit ? '+' : '−'}{naira(Math.abs(tx.amount_kobo))}
                  </Text>
                </View>
              )
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
