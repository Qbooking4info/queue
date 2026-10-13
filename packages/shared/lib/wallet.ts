// Patient wallet (tables from 20261012000004_wallet; routes under /api/wallet).
// The app only READS the balance and history. Top-ups go through Paystack and are
// credited by the server after it verifies the charge; wallet payments are debited
// server-side from the booking's real fee.
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export interface WalletTx {
  id: string; type: 'topup' | 'payment' | 'refund' | 'adjustment'
  amount_kobo: number; balance_after_kobo: number | null; status: 'pending' | 'success' | 'failed'
  description: string | null; created_at: string
}
export interface WalletState { balanceKobo: number; transactions: WalletTx[]; notReady?: boolean }

export const naira = (kobo: number) => '₦' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })

async function headers(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }
}

export async function getWallet(): Promise<WalletState> {
  const [{ data: w, error: e1 }, { data: tx }] = await Promise.all([
    supabase.from('wallets').select('balance_kobo').maybeSingle(),
    supabase.from('wallet_transactions').select('id, type, amount_kobo, balance_after_kobo, status, description, created_at')
      .order('created_at', { ascending: false }).limit(50),
  ])
  if (e1 && /does not exist|schema cache/i.test(e1.message)) return { balanceKobo: 0, transactions: [], notReady: true }
  return { balanceKobo: Number((w as any)?.balance_kobo ?? 0), transactions: ((tx as WalletTx[]) ?? []) }
}

export type TopUpOutcome = { status: 'success' | 'pending' | 'cancelled' } | { status: 'error'; message: string }

/** Paystack checkout for a top-up, then ask the server to verify and credit it. */
export async function topUpWallet(amountNaira: number): Promise<TopUpOutcome> {
  if (!API_URL) return { status: 'error', message: 'Payments are not configured in this build' }
  let reference: string, url: string
  try {
    const res = await fetch(`${API_URL}/api/wallet/topup`, { method: 'POST', headers: await headers(), body: JSON.stringify({ amount: amountNaira }) })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { status: 'error', message: body?.error ?? (res.status === 404 ? 'Wallet top-ups are being switched on.' : 'Could not start the top-up') }
    reference = body.reference; url = body.authorizationUrl
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Network error' } }

  try { await WebBrowser.openAuthSessionAsync(url, `${API_URL}/payment/complete`) } catch { return { status: 'error', message: 'Checkout could not be opened' } }

  try {
    const res = await fetch(`${API_URL}/api/wallet/verify`, { method: 'POST', headers: await headers(), body: JSON.stringify({ reference }) })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { status: 'error', message: body?.error ?? 'Could not verify the top-up' }
    return { status: body.status === 'success' ? 'success' : body.status === 'pending' ? 'pending' : 'cancelled' }
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Network error' } }
}

export type WalletPayOutcome = { status: 'success' } | { status: 'insufficient' } | { status: 'error'; message: string }

export async function payWithWallet(appointmentId: string): Promise<WalletPayOutcome> {
  try {
    const res = await fetch(`${API_URL}/api/wallet/pay`, { method: 'POST', headers: await headers(), body: JSON.stringify({ appointmentId }) })
    const body = await res.json().catch(() => null)
    if (res.status === 402) return { status: 'insufficient' }
    if (!res.ok) return { status: 'error', message: body?.error ?? 'Could not pay from your wallet' }
    return { status: 'success' }
  } catch (e) { return { status: 'error', message: e instanceof Error ? e.message : 'Network error' } }
}
