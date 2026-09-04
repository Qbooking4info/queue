import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

// Three screens run an indefinite Animated.loop (a live-consult pulse dot, an incoming-
// call ring, an emergency-booking pulse) with no way to stop it (WCAG 2.2.2 -- motion
// that starts automatically, lasts more than 5s, and has no pause control). None of them
// carry information the pulse alone conveys -- each sits next to a color/icon/text that
// already says "recording" or "incoming call" -- so honoring the OS's reduce-motion
// setting by not looping costs nothing. Starts `false` and corrects on the next tick
// rather than blocking first render on the async check.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduced(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => { mounted = false; sub.remove() }
  }, [])

  return reduced
}
