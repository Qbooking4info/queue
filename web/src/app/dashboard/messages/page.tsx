'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import {
  listConversations, getConversation, listMessages, sendMessage, markRead, setConversationStatus,
  subscribeToMessages, ROLE_LABEL, type Conversation, type ChatMessage,
} from '@/lib/chat'
import { PageHeader, Segmented, Empty, Button } from '@/components/dashboard/v31'

// v3.1 Messages: the hospital inbox. Patients, doctors and ambulance crews who
// message this hospital land here; replies go out as the hospital. Same tables
// and RPCs as Queue Hospital's Messages screen.

type Filter = 'open' | 'unread' | 'closed'

const timeOf = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso), now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function MessagesPage() {
  const { theme: C } = useTheme()
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [active, setActive] = useState<Conversation | null>(null)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    const r = await listConversations('hospital')
    if (r.ok) { setConvs(r.data); setError(null) } else { setConvs([]); setError(r.notReady ? 'Messaging isn’t set up for this hospital yet.' : r.error) }
  }, [])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('c')
    if (id) setActiveId(id)
  }, [])
  useEffect(() => { const t = setInterval(loadList, 20_000); return () => clearInterval(t) }, [loadList])

  // Open a thread: load it, its messages, mark read, follow new messages live.
  useEffect(() => {
    if (!activeId) { setActive(null); setMsgs([]); return }
    let cancelled = false
    ;(async () => {
      const [c, m] = await Promise.all([getConversation(activeId), listMessages(activeId)])
      if (cancelled) return
      setActive(c.ok ? c.data : null)
      setMsgs(m.ok ? m.data : [])
      await markRead(activeId)
      loadList()
    })()
    const off = subscribeToMessages(activeId, m => {
      setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
      markRead(activeId)
    })
    const url = new URL(window.location.href); url.searchParams.set('c', activeId); window.history.replaceState(null, '', url)
    return () => { cancelled = true; off() }
  }, [activeId, loadList])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  const shown = useMemo(() => (convs ?? [])
    .filter(c => filter === 'closed' ? c.status === 'closed' : c.status !== 'closed')
    .filter(c => filter !== 'unread' || c.unread > 0)
    .filter(c => !q.trim() || (c.other?.display_name ?? '').toLowerCase().includes(q.trim().toLowerCase())
      || (c.last_body ?? '').toLowerCase().includes(q.trim().toLowerCase())), [convs, filter, q])

  const counts = useMemo(() => ({
    open: (convs ?? []).filter(c => c.status !== 'closed').length,
    unread: (convs ?? []).filter(c => c.status !== 'closed' && c.unread > 0).length,
    closed: (convs ?? []).filter(c => c.status === 'closed').length,
  }), [convs])

  async function send() {
    if (!activeId || !draft.trim() || sending) return
    setSending(true)
    const r = await sendMessage({ conversationId: activeId, body: draft })
    setSending(false)
    if (r.ok) { setDraft(''); setMsgs(prev => prev.some(x => x.id === r.data.id) ? prev : [...prev, r.data]); loadList() }
    else setError(r.error)
  }

  async function toggleStatus() {
    if (!active) return
    const err = await setConversationStatus(active.id, active.status === 'closed' ? 'open' : 'closed')
    if (err) { setError(err); return }
    const c = await getConversation(active.id); if (c.ok) setActive(c.data)
    loadList()
  }

  const inputStyle = { height: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text,
    padding: '0 12px', fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        .q-msg-grid { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 16px; min-height: 560px; }
        @media (max-width: 860px) {
          .q-msg-grid { grid-template-columns: 1fr; }
          .q-msg-grid[data-open="true"] .q-msg-list { display: none; }
          .q-msg-grid[data-open="false"] .q-msg-thread { display: none; }
        }
        .q-conv:hover { background: ${C.bgAlt}; }
        .q-msg-back { display: none; }
        @media (max-width: 860px) { .q-msg-back { display: inline-flex; } }
      `}</style>
      <PageHeader title="Messages" eyebrow="Patients, doctors and crews who contact your hospital" />
      {error && <div role="alert" style={{ padding: 12, borderRadius: 12, background: C.redLight, color: C.red, fontSize: 13 }}>{error}</div>}

      <div className="q-msg-grid" data-open={activeId ? 'true' : 'false'}>
        <section className="q-msg-list" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12,
          display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <input aria-label="Search conversations" placeholder="Search name or message" value={q} onChange={e => setQ(e.target.value)} style={inputStyle} />
          <Segmented label="Filter conversations" value={filter} onChange={setFilter}
            options={[{ key: 'open', label: 'Open', count: counts.open }, { key: 'unread', label: 'Unread', count: counts.unread }, { key: 'closed', label: 'Closed', count: counts.closed }]} />
          <div role="list" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 620 }}>
            {convs == null ? <div style={{ padding: 12, fontSize: 13, color: C.textMuted }}>Loading…</div>
              : shown.length === 0 ? <Empty title={filter === 'unread' ? 'All caught up' : 'No conversations'}
                  body={filter === 'open' ? 'Patients can message you after booking, and you can message a patient from Patients.' : undefined} />
              : shown.map(c => (
                <button key={c.id} type="button" role="listitem" className="q-conv" onClick={() => setActiveId(c.id)}
                  aria-current={c.id === activeId ? 'true' : undefined}
                  style={{ textAlign: 'left', border: 'none', borderRadius: 10, padding: '10px 10px', cursor: 'pointer', fontFamily: 'inherit',
                    background: c.id === activeId ? C.accentLight : 'transparent', display: 'flex', gap: 10, alignItems: 'center', color: C.text }}>
                  <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 99, background: C.accentLight, color: C.accent, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                    {(c.other?.display_name ?? '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.other?.display_name ?? 'Unknown'}</b>
                      <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{timeOf(c.last_message_at)}</span>
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 13, color: c.unread ? C.text : C.textMuted, fontWeight: c.unread ? 600 : 400,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.other ? `${ROLE_LABEL[c.other.role]} · ` : ''}{c.last_body ?? 'No messages yet'}
                      </span>
                      {c.unread > 0 && <span aria-label={`${c.unread} unread`} style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: C.accent,
                        color: C.id === 'forest' ? '#04201D' : '#FFFFFF', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.unread}</span>}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </section>

        <section className="q-msg-thread" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
          display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 560 }}>
          {!activeId || !active ? (
            <Empty title={activeId ? 'Loading…' : 'Select a conversation'} body={activeId ? undefined : 'Pick a thread on the left to read and reply.'} />
          ) : (
            <>
              <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                <span className="q-msg-back"><Button ariaLabel="Back to conversations" onClick={() => setActiveId(null)}>←</Button></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{active.other?.display_name ?? 'Unknown'}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{active.other ? ROLE_LABEL[active.other.role] : ''}{active.status === 'closed' ? ' · closed' : ''}</div>
                </div>
                <Button variant={active.status === 'closed' ? 'link' : 'secondary'} onClick={toggleStatus}>
                  {active.status === 'closed' ? 'Reopen' : 'Close conversation'}
                </Button>
              </header>
              <div aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520 }}>
                {msgs.length === 0 && <div style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', marginTop: 24 }}>No messages yet. Say hello.</div>}
                {msgs.map(m => {
                  const mine = m.sender_member_id === active.me?.id
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                      <div style={{ padding: '9px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: mine ? C.accent : C.bgAlt, color: mine ? (C.id === 'forest' ? '#04201D' : '#FFFFFF') : C.text,
                        borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4 }}>
                        {m.body}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3, textAlign: mine ? 'right' : 'left' }}>
                        {mine ? (m.sender_name ?? 'You') : (m.sender_name ?? '')} · {timeOf(m.created_at)}
                      </div>
                    </div>
                  )
                })}
                <div ref={endRef} />
              </div>
              {active.status === 'closed' ? (
                <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.textMuted }}>This conversation is closed. Reopen it to reply.</div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); send() }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${C.border}` }}>
                  <textarea aria-label="Message" value={draft} onChange={e => setDraft(e.target.value)} rows={1} placeholder="Write a reply…"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    style={{ ...inputStyle, height: 44, padding: '11px 12px', resize: 'none' }} />
                  <Button type="submit" variant="primary" disabled={!draft.trim() || sending}>{sending ? 'Sending…' : 'Send'}</Button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
