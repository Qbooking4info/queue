import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { EmptyState, PrimaryButton } from './ui/v3'

// Shown when a signed-in account has no role in this app (e.g. a patient opening
// Queue Doctor). Same v3 empty state every app uses; the only action is sign out.
export function NoAccessScreen({ title, body, onSignOut }: { title: string; body: string; onSignOut: () => void }) {
  const { theme: t } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvasBg, justifyContent: 'center', padding: 24 }}>
      <EmptyState icon="lock-closed-outline" title={title} body={body} />
      <View style={{ marginTop: 8 }}>
        <PrimaryButton variant="ghost" icon="log-out-outline" label="Sign out" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  )
}
