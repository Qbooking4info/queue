import { useNetworkState } from 'expo-network'

/**
 * Is the device actually unable to reach the network right now?
 *
 * Audit finding 8-D: nothing in the app distinguished "no data" from "no
 * signal", so a failed request in a dead spot rendered as an empty list. For an
 * app whose emergency flow gets used in exactly those conditions, telling the
 * two apart is worth more than the finding's severity suggests.
 *
 * Deliberately conservative. `isInternetReachable` is `undefined` before the
 * first probe resolves, and on Android it can briefly report false on a
 * perfectly good connection while the reachability check is in flight. Only a
 * definite `false` counts as offline — a banner that flickers during normal use
 * teaches people to ignore it, which costs more than the banner is worth.
 */
export function useIsOffline(): boolean {
  const state = useNetworkState()

  if (state.isConnected === false) return true
  if (state.isConnected && state.isInternetReachable === false) return true
  return false
}
