import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { listConversations, type ChatRole } from '../lib/chat'

// Total unread chat messages for the Messages tab dot. Refreshes on app focus and
// every 30 s; reports 0 until the chat migration is live (listConversations fails).
export function useUnreadMessages(role: ChatRole, enabled = true): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => listConversations(role).then(r => {
      if (alive) setCount(r.ok ? r.data.reduce((n, c) => n + (c.unread ?? 0), 0) : 0)
    }).catch(() => {})
    load()
    const timer = setInterval(load, 30_000)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load() })
    return () => { alive = false; clearInterval(timer); sub.remove() }
  }, [role, enabled])
  return count
}
