import { useCallback, useState } from 'react'
import { View, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getWallet, topUpWallet, naira, type WalletState } from '@queue/shared/lib/wallet'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Chip, Notice, Btn,
  BottomBar, Empty, Mono, CardLabel, NUMS,
} from '@queue/shared/components/q'

const QUICK = [2000, 5000, 10000, 20000]

const TX_META = {
  topup: { icon: 'add-circle-outline', label: 'Top-up' },
  payment: { icon: 'calendar-outline', label: 'Booking payment' },
  refund: { icon: 'arrow-undo-outline', label: 'Refund' },
  adjustment: { icon: 'swap-vertical', label: 'Adjustment' },
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
    if (r.status === 'success') {
      haptics.success()
      Alert.alert('Wallet topped up', `${naira(n * 100)} added to your wallet.`)
    } else if (r.status === 'pending') {
      Alert.alert('Almost there', 'We are confirming the payment with your bank. Your balance updates shortly.')
    } else if (r.status === 'error') {
      haptics.error()
      Alert.alert('Top up', r.message)
    }
    load()
  }

  const notReady = !!wallet?.notReady

  return (
    <Screen>
      <AppBar title="Wallet" onBack={() => navigation.goBack()} />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
          tintColor={t.q.primary} colors={[t.q.primary]} />
      }>
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <CardLabel>Available balance</CardLabel>
          <Text
            accessibilityLabel={`Balance ${wallet ? naira(wallet.balanceKobo) : 'loading'}`}
            style={[{ fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1.4, color: t.q.ink, marginTop: 2 }, NUMS]}>
            {wallet ? naira(wallet.balanceKobo) : '—'}
          </Text>
        </View>

        {notReady && (
          <Notice tone="amber">
            The wallet is being switched on. You will be able to top up soon — nothing is charged in
            the meantime.
          </Notice>
        )}

        <SectionHead title="Top up" />
        <Card pad style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {QUICK.map(q => (
              <Chip
                key={q}
                label={naira(q * 100)}
                on={String(q) === amount}
                onPress={() => { haptics.tap(); setAmount(String(q)) }}
              />
            ))}
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
            borderRadius: 14, borderWidth: 1, borderColor: t.q.line, backgroundColor: t.q.field,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t.q.ink60 }}>₦</Text>
            <TextInput
              value={amount}
              onChangeText={v => setAmount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              accessibilityLabel="Top up amount"
              style={{ flex: 1, minHeight: 48, paddingHorizontal: 8, fontSize: 16, color: t.q.ink }}
            />
          </View>

          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            Secured by Paystack. Card, bank transfer or USSD.
          </Text>
        </Card>

        <SectionHead title="Transactions" />
        {!wallet ? (
          <View style={{ marginHorizontal: 16 }}><SkeletonCard /></View>
        ) : wallet.transactions.length === 0 ? (
          <Card>
            <Empty icon="wallet-outline" title="No transactions yet"
              body="Top-ups, payments and refunds show up here." />
          </Card>
        ) : (
          <Card>
            {wallet.transactions.map((tx, i) => {
              const meta = TX_META[tx.type]
              const credit = tx.amount_kobo > 0
              return (
                <View key={tx.id}>
                  {i > 0 && <Hair />}
                  <Row
                    icon={meta.icon as any}
                    iconTone={credit ? 'green' : 'neutral'}
                    title={tx.description || meta.label}
                    sub={`${new Date(tx.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}${tx.status !== 'success' ? ` · ${tx.status === 'pending' ? 'pending' : 'failed'}` : ''}`}
                    right={
                      <Mono
                        size={14} weight="700"
                        color={tx.status === 'failed' ? t.q.ink60 : credit ? t.q.green : t.q.ink}>
                        {credit ? '+' : '−'}{naira(Math.abs(tx.amount_kobo))}
                      </Mono>
                    }
                  />
                </View>
              )
            })}
          </Card>
        )}
      </Body>

      <BottomBar meta={
        <Mono size={12} color={t.q.ink60}>
          {notReady ? 'Top-ups paused' : 'Instant · Paystack'}
        </Mono>
      }>
        <Btn
          grow
          label={`Top up ${amount ? naira(Number(amount) * 100) : ''}`}
          icon="card-outline"
          loading={busy}
          disabled={notReady}
          onPress={topUp}
        />
      </BottomBar>
    </Screen>
  )
}
