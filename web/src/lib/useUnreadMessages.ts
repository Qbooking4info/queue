'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { listConversations } from '@/lib/chat'

/**
 * Unread messages across the caller's open conversations (the hospital inbox for
 * staff), for the sidebar's Messages badge. Recounted when any message arrives
 * that RLS lets the caller see, and every 30 s.
 */
export function useUnreadMessages(enabled: boolean) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!enabled) { setUnread(0); return }
    let cancelled = false
    const count = () => listConversations('hospital').then(r => {
      if (!cancelled && r.ok) setUnread(r.data.filter(c => c.status !== 'closed').reduce((n, c) => n + c.unread, 0))
    })
    count()
    const supabase = createClient()
    const ch = supabase.channel('unread-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, count)
      .subscribe()
    const t = setInterval(count, 30_000)
    return () => { cancelled = true; supabase.removeChannel(ch); clearInterval(t) }
  }, [enabled])
  return unread
}
