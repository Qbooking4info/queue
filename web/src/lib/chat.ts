// Messaging between every Queue operator (tables + RPCs from
// 20261012000002_conversations_messages). Patients, doctors and crews are members as
// themselves; hospital staff answer from their hospital's shared inbox. Threads are
// only created through start_conversation(), which checks the relationship
// server-side. Until the migration is applied every call reports `notReady`.
// Web copy of packages/shared/lib/chat.ts (the web app is outside the npm
// workspace @queue/shared lives in). Keep the two in step: same tables, same RPCs.
/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors the untyped mobile module */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// Untyped: the chat tables and RPCs aren't in the generated web types.
//
// Built on first use, not at module load. createClient() reads
// NEXT_PUBLIC_SUPABASE_PUBLIC_KEY and throws when it is absent, and this module
// reaches the dashboard through Shell.tsx -- so at build time, where that env
// var need not exist, a module-scope client failed prerendering for every page
// under /dashboard rather than for the one call that needed it.
let _supabase: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!_supabase) _supabase = createClient() as unknown as SupabaseClient
  return _supabase
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = sb() as unknown as Record<string | symbol, unknown>
    const value = c[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(c) : value
  },
})

export type MemberRole = 'patient' | 'doctor' | 'hospital' | 'crew'
/** Kept for screens that still say which app they're in. */
export type ChatRole = MemberRole

export interface ConversationMember {
  id: string
  auth_id: string | null
  hospital_id: string | null
  role: MemberRole
  display_name: string
  avatar_url: string | null
  last_read_at: string | null
}

export interface Conversation {
  id: string
  kind: 'patient_doctor' | 'patient_hospital' | 'doctor_hospital' | 'crew_hospital'
  status: 'open' | 'closed'
  last_message_at: string | null
  created_at: string
  members: ConversationMember[]
  /** The caller's own side (themselves, or their hospital inbox). */
  me: ConversationMember | null
  /** The other side of the thread. */
  other: ConversationMember | null
  unread: number
  last_body: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_member_id: string | null
  sender_role: MemberRole | null
  sender_name: string | null
  body: string
  created_at: string
}

export type ChatResult<T> = { ok: true; data: T } | { ok: false; notReady?: boolean; error: string }

const isNotReady = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || /does not exist|schema cache|Could not find the function/i.test(e.message ?? ''))

function fail<T>(e: { code?: string; message?: string }): ChatResult<T> {
  return { ok: false, notReady: isNotReady(e), error: e.message ?? 'Something went wrong' }
}

// Who "me" is across threads: my sign-in, plus any hospital inbox I staff.
let meCache: { at: number; authId: string; hospitalIds: string[] } | null = null
async function whoAmI() {
  if (meCache && Date.now() - meCache.at < 60_000) return meCache
  const { data: { session } } = await supabase.auth.getSession()
  const authId = session?.user.id ?? ''
  const { data } = await supabase.rpc('my_staff_hospital_ids')
  const hospitalIds = ((data as any[]) ?? []).map(r => (typeof r === 'string' ? r : r?.my_staff_hospital_ids ?? r?.hospital_id)).filter(Boolean)
  meCache = { at: Date.now(), authId, hospitalIds }
  return meCache
}
export function resetChatIdentity() { meCache = null }

const isMine = (m: ConversationMember, me: { authId: string; hospitalIds: string[] }) =>
  (m.auth_id != null && m.auth_id === me.authId) || (m.hospital_id != null && me.hospitalIds.includes(m.hospital_id))

const CONV_SELECT = 'id, kind, status, last_message_at, created_at, members:conversation_members(id, auth_id, hospital_id, role, display_name, avatar_url, last_read_at)'

function shape(raw: any, me: { authId: string; hospitalIds: string[] }): Conversation {
  const members: ConversationMember[] = raw.members ?? []
  // Prefer my personal membership over a hospital inbox if both match.
  const mine = members.filter(m => isMine(m, me)).sort((a, b) => (a.auth_id ? 0 : 1) - (b.auth_id ? 0 : 1))[0] ?? null
  const other = members.find(m => m.id !== mine?.id) ?? null
  return { ...raw, members, me: mine, other, unread: 0, last_body: null }
}

export async function listConversations(_role?: MemberRole): Promise<ChatResult<Conversation[]>> {
  const me = await whoAmI()
  const { data, error } = await supabase.from('conversations').select(CONV_SELECT)
    .order('last_message_at', { ascending: false, nullsFirst: false }).limit(100)
  if (error) return fail(error)
  const convs = ((data as any[]) ?? []).map(c => shape(c, me))
  if (convs.length === 0) return { ok: true, data: [] }
  const { data: msgs } = await supabase.from('messages')
    .select('conversation_id, body, sender_member_id, created_at')
    .in('conversation_id', convs.map(c => c.id)).order('created_at', { ascending: false }).limit(500)
  for (const c of convs) {
    const mine = (msgs ?? []).filter((m: any) => m.conversation_id === c.id)
    c.last_body = mine[0]?.body ?? null
    const since = c.me?.last_read_at ? new Date(c.me.last_read_at).getTime() : 0
    c.unread = mine.filter((m: any) => m.sender_member_id !== c.me?.id && new Date(m.created_at).getTime() > since).length
  }
  return { ok: true, data: convs }
}

export type ChatTarget = 'doctor' | 'patient' | 'hospital' | 'crew'

/**
 * Open (or reuse) a thread. target ids: doctor -> doctors.id, patient -> users.id,
 * hospital -> hospitals.id, crew -> users.id of a fleet crew member.
 */
export async function startConversation(target: ChatTarget, targetId: string, appointmentId?: string | null): Promise<ChatResult<string>> {
  const { data, error } = await supabase.rpc('start_conversation', {
    p_target_type: target, p_target: targetId, p_appointment: appointmentId ?? null,
  })
  if (error) return fail(error)
  return { ok: true, data: data as string }
}

/** Back-compat for the patient app's "Message doctor" button. */
export async function getOrCreateConversation(input: { patientId?: string; doctorId: string; appointmentId?: string | null }): Promise<ChatResult<{ id: string }>> {
  const r = await startConversation('doctor', input.doctorId, input.appointmentId)
  return r.ok ? { ok: true, data: { id: r.data } } : r
}

export async function getConversation(id: string): Promise<ChatResult<Conversation>> {
  const me = await whoAmI()
  const { data, error } = await supabase.from('conversations').select(CONV_SELECT).eq('id', id).single()
  if (error) return fail(error)
  return { ok: true, data: shape(data, me) }
}

export async function listMessages(conversationId: string): Promise<ChatResult<ChatMessage[]>> {
  const { data, error } = await supabase.from('messages').select('*')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500)
  if (error) return fail(error)
  return { ok: true, data: (data as ChatMessage[]) ?? [] }
}

/** Sender fields are stamped server-side from the caller's membership. */
export async function sendMessage(input: { conversationId: string; body: string }): Promise<ChatResult<ChatMessage>> {
  const body = input.body.trim()
  if (!body) return { ok: false, error: 'Message is empty' }
  const { data, error } = await supabase.from('messages')
    .insert({ conversation_id: input.conversationId, body }).select('*').single()
  if (error) return fail(error)
  return { ok: true, data: data as ChatMessage }
}

export async function markRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { p_conv: conversationId })
}

export async function setConversationStatus(conversationId: string, status: 'open' | 'closed') {
  const { error } = await supabase.rpc('set_conversation_status', { p_conv: conversationId, p_status: status })
  return error ? error.message : null
}

/** Live new messages in one conversation. Returns an unsubscribe function. */
export function subscribeToMessages(conversationId: string, onMessage: (m: ChatMessage) => void): () => void {
  const ch = supabase.channel(`chat-${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      payload => onMessage(payload.new as ChatMessage))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  patient: 'Patient', doctor: 'Doctor', hospital: 'Hospital', crew: 'Ambulance crew',
}
