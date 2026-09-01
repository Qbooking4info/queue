import AsyncStorage from '@react-native-async-storage/async-storage'
import * as TaskManager from 'expo-task-manager'
import * as ExpoLocation from 'expo-location'
import { sendLocationPing } from './crew-api'

/**
 * Background position reporting for on-duty ambulance crews.
 *
 * Why this exists: find_candidate_units drops any unit whose last fix is older
 * than unit_location_ttl_seconds() (120s). Until now the crew app only reported
 * position while CrewHomeScreen was open and in the foreground, so a crew member
 * who locked their phone — which is what actually happens in a moving
 * ambulance — silently fell out of dispatch about two minutes later. The duty
 * toggle said "on duty"; dispatch could not see them.
 *
 * The task is registered at module scope because TaskManager must know the task
 * name before the OS can hand work back to a cold-started process. Registering
 * it inside a component would mean a task the OS wakes up but the app cannot
 * handle.
 */

export const CREW_LOCATION_TASK = 'queue-crew-location'

/**
 * Which unit the background task should report for.
 *
 * Held in module scope AND on disk. The module variable alone is not enough: when
 * Android reclaims the process and later restarts it to deliver a batch of fixes, the
 * module is re-imported fresh with activeUnitId back to null, and the task dropped the
 * entire batch on the floor. That is why position reports arrived in short bursts at the
 * correct 30s cadence and then stopped dead for hours -- fixes only survived while the
 * JS context that called setBackgroundUnit() was still alive. Persisting the id lets a
 * cold-started task recover who it is reporting for.
 */
const UNIT_KEY = 'queue.crew.backgroundUnitId'
let activeUnitId: string | null = null

export function setBackgroundUnit(id: string | null) {
  activeUnitId = id
  // Fire-and-forget: the in-memory value covers this process, the stored one covers
  // the next cold start. A storage failure must not stop reporting.
  if (id === null) void AsyncStorage.removeItem(UNIT_KEY).catch(() => {})
  else void AsyncStorage.setItem(UNIT_KEY, id).catch(() => {})
}

/** The unit id, falling back to disk when this is a cold-started headless process. */
async function resolveUnitId(): Promise<string | null> {
  if (activeUnitId) return activeUnitId
  try {
    const stored = await AsyncStorage.getItem(UNIT_KEY)
    // Warm the module so subsequent deliveries in this process skip the read.
    if (stored) activeUnitId = stored
    return stored
  } catch {
    return null
  }
}

interface LocationTaskData { locations?: ExpoLocation.LocationObject[] }

TaskManager.defineTask(CREW_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[crew] background location task error', error.message)
    return
  }
  const locations = (data as LocationTaskData)?.locations ?? []
  if (!locations.length) return

  const unitId = await resolveUnitId()
  if (!unitId) return

  try {
    // The OS batches fixes and may deliver several at once after a gap.
    // record_unit_location() validates and orders them server-side, so send the
    // batch rather than only the newest — the intermediate points are what make
    // the patient's tracking map move smoothly instead of jumping.
    await sendLocationPing(
      unitId,
      locations.map(l => ({
        lat: l.coords.latitude,
        lng: l.coords.longitude,
        heading: l.coords.heading ?? undefined,
        speedKmh: l.coords.speed != null ? l.coords.speed * 3.6 : undefined,
        accuracyM: l.coords.accuracy ?? undefined,
        recordedAt: new Date(l.timestamp).toISOString(),
      })),
    )
  } catch (err) {
    // Never throw out of a background task — the OS treats a throwing task as
    // misbehaving and will stop waking the app, which would take the unit out
    // of dispatch permanently rather than for one missed interval.
    console.warn('[crew] background ping failed', err)
  }
})

/**
 * Ask for background permission and start reporting.
 *
 * Returns why it failed rather than a bare boolean, because "you declined
 * Always-allow" and "location services are off" need different words in front
 * of a crew member who believes they are visible to dispatch.
 */
export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'foreground_denied' | 'background_denied' | 'unavailable' }

export async function startBackgroundLocation(ambulanceId: string): Promise<StartResult> {
  const fg = await ExpoLocation.requestForegroundPermissionsAsync()
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground_denied' }

  const bg = await ExpoLocation.requestBackgroundPermissionsAsync()
  if (bg.status !== 'granted') return { ok: false, reason: 'background_denied' }

  setBackgroundUnit(ambulanceId)

  const already = await ExpoLocation.hasStartedLocationUpdatesAsync(CREW_LOCATION_TASK).catch(() => false)
  if (already) return { ok: true }

  try {
    await ExpoLocation.startLocationUpdatesAsync(CREW_LOCATION_TASK, {
      accuracy: ExpoLocation.Accuracy.Balanced,
      // Comfortably inside the 120s staleness window, so a unit stays
      // dispatchable even if one interval is missed.
      timeInterval: 30_000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      // Android requires a visible notification for background location. It is
      // also honest: a crew should be able to see that the app is tracking them
      // while on duty, and dismiss it by going off duty.
      foregroundService: {
        notificationTitle: 'Queue — on duty',
        notificationBody: 'Reporting your position so dispatch can send you jobs.',
        notificationColor: '#FF5C5C',
      },
    })
    return { ok: true }
  } catch (err) {
    console.warn('[crew] could not start background location', err)
    return { ok: false, reason: 'unavailable' }
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  setBackgroundUnit(null)
  try {
    const running = await ExpoLocation.hasStartedLocationUpdatesAsync(CREW_LOCATION_TASK)
    if (running) await ExpoLocation.stopLocationUpdatesAsync(CREW_LOCATION_TASK)
  } catch {
    /* already stopped, or the task was never registered on this platform */
  }
}
