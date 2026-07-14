import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import * as ExpoLocation from 'expo-location'

interface Coords { latitude: number; longitude: number }

interface LocationCtx {
  coords:    Coords | null
  granted:   boolean
  loading:   boolean
  request:   () => Promise<void>
}

const Ctx = createContext<LocationCtx>({ coords: null, granted: false, loading: true, request: async () => {} })

export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords,  setCoords]  = useState<Coords | null>(null)
  const [granted, setGranted] = useState(false)
  const [loading, setLoading] = useState(true)

  async function request() {
    setLoading(true)
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync()
    if (status !== 'granted') { setLoading(false); return }
    setGranted(true)
    const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
    setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
    setLoading(false)
  }

  useEffect(() => {
    ExpoLocation.getForegroundPermissionsAsync().then(async ({ status }) => {
      if (status === 'granted') {
        setGranted(true)
        const loc = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
        setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return <Ctx.Provider value={{ coords, granted, loading, request }}>{children}</Ctx.Provider>
}

export const useLocation = () => useContext(Ctx)

/** Haversine distance in km between two coordinates */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = (b.latitude  - a.latitude)  * Math.PI / 180
  const dLon = (b.longitude - a.longitude) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2
          + Math.cos(a.latitude * Math.PI / 180)
          * Math.cos(b.latitude * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
