import { createNavigationContainerRef } from '@react-navigation/native'

/**
 * A navigation handle usable from outside React.
 *
 * Push notifications arrive from a native listener, not from a component, so
 * there is no `navigation` prop in scope when one is tapped. Without this the
 * routing payloads the server already sends — `appointment_id`, `request_id`,
 * `offer_id` — get discarded, and every tap dumps the user on whatever screen
 * they left the app on.
 */
export const navigationRef = createNavigationContainerRef()

/**
 * Navigation requested before the container mounted. A notification tap on a
 * cold start runs well before React Navigation is ready, and dropping it is the
 * exact case that matters most — the app was closed, so the notification is the
 * only reason the user opened it.
 */
let pending: { name: string; params?: object } | null = null

export function navigateWhenReady(name: string, params?: object) {
  if (navigationRef.isReady()) {
    // The app's navigators are untyped (no ParamList), so the generic navigate
    // signature cannot be satisfied without a cast here.
    ;(navigationRef.navigate as (n: string, p?: object) => void)(name, params)
    return
  }
  pending = { name, params }
}

/** Called from NavigationContainer's onReady. Flushes at most one deep link. */
export function flushPendingNavigation() {
  if (!pending || !navigationRef.isReady()) return
  const { name, params } = pending
  pending = null
  ;(navigationRef.navigate as (n: string, p?: object) => void)(name, params)
}
