// NOTE: expo-haptics is not listed in package.json yet.
// Install it with:  npx expo install expo-haptics
// Until installed, calls are no-ops on simulator and will throw on a real device.
import * as Haptics from 'expo-haptics'

export const haptics = {
  tap:     () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error:   () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  heavy:   () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
}
