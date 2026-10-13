import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { QUEUE_FONTS } from '../components/ui/Typography'

// Keep the native splash up until Plus Jakarta Sans is loaded, so the first frame
// is already in the brand font instead of flashing the system font.
SplashScreen.preventAutoHideAsync().catch(() => {})

export function useQueueFonts(): boolean {
  const [loaded, error] = useFonts(QUEUE_FONTS)
  const ready = loaded || !!error   // a font failure must never block the app
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}) }, [ready])
  return ready
}
