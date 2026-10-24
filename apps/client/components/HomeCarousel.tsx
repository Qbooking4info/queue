import { useRef, useState } from 'react'
import {
  View, ScrollView, TouchableOpacity, StyleSheet,
  useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'

type IconName = React.ComponentProps<typeof Ionicons>['name']

export interface Slide {
  key: string
  title: string
  body: string
  icon: IconName
  /** Shown as a pill under the body. Omit on the slide that carries the search bar. */
  cta?: string
  onPress: () => void
  /** Only the lead slide carries the search field, as in the reference design. */
  search?: { placeholder: string; onFilter?: () => void }
  /** Red treatment for the emergency slide. */
  tone?: 'brand' | 'alert'
}

const GAP = 12
const SIDE = 20

/**
 * The home hero: a swipeable band of large cards, the first of which replaces
 * the old one-line "No upcoming visits" row.
 *
 * Laid out edge to edge by cancelling the parent's 20px side padding with
 * negative margins, then restoring it as contentContainer padding. That way a
 * card can scroll past the screen edge while the first one still lines up with
 * everything above and below it.
 */
export function HomeCarousel({ slides }: { slides: Slide[] }) {
  const { theme: t } = useTheme()
  const { width } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const lastIndex = useRef(0)

  const cardW = width - SIDE * 2
  const stride = cardW + GAP

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / stride)
    if (i !== lastIndex.current && i >= 0 && i < slides.length) {
      lastIndex.current = i
      setIndex(i)
    }
  }

  if (slides.length === 0) return null

  return (
    <View style={{ gap: 12 }}>
      {/* flexGrow/flexShrink 0: a horizontal ScrollView inside a column parent
          otherwise stretches to fill and clips whatever sits beneath it. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={stride}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -SIDE }}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
      >
        {slides.map(s => (
          <SlideCard key={s.key} slide={s} width={cardW} />
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={st.dots} accessibilityRole="tablist" accessibilityLabel={`${index + 1} of ${slides.length}`}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[
                st.dot,
                i === index
                  ? { width: 18, backgroundColor: t.accent }
                  : { backgroundColor: t.textMuted, opacity: 0.35 },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

function SlideCard({ slide, width }: { slide: Slide; width: number }) {
  const { theme: t } = useTheme()
  const dark = t.id === 'forest'
  const alert = slide.tone === 'alert'

  // Light mode uses a pale mint wash with dark teal text, matching the
  // reference; dark mode deepens it instead of inverting, so the accent keeps
  // working on both grounds.
  const colors: [string, string] = alert
    ? (dark ? ['#3B1517', '#2A1012'] : ['#FEE9E9', '#FDD9DA'])
    : (dark ? ['#14403F', '#102A2C'] : ['#E8F7F3', '#D2EFE8'])

  const ink    = alert ? (dark ? '#FCA5A5' : '#7F1D1D') : (dark ? '#E8F1F0' : '#0B3B3F')
  const subInk = alert ? (dark ? '#F3BDBD' : '#9B4444') : (dark ? '#B8C7C9' : '#2F5C5C')
  const orb    = alert ? (dark ? '#F87171' : '#EF4444') : (dark ? '#2DD4BF' : '#0F766E')

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => { haptics.tap(); slide.onPress() }}
      accessibilityRole="button"
      accessibilityLabel={`${slide.title}. ${slide.body}`}
      style={{ width }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[st.card, { borderColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,118,110,0.14)' }]}
      >
        {/* Decorative motif. The reference puts a photo here; Queue ships no
            such asset, so this is drawn from concentric discs and an icon
            rather than inventing stock imagery. */}
        <View pointerEvents="none" style={st.motifWrap}>
          <View style={[st.motifOuter, { backgroundColor: orb, opacity: dark ? 0.14 : 0.12 }]} />
          <View style={[st.motifInner, { backgroundColor: orb, opacity: dark ? 0.2 : 0.16 }]} />
          <Ionicons name={slide.icon} size={54} color={orb} style={{ opacity: dark ? 0.9 : 0.8 }} />
        </View>

        <View style={{ gap: 6, paddingRight: 96 }}>
          <Text style={[st.title, { color: ink }]} numberOfLines={2}>{slide.title}</Text>
          <Text style={[st.body, { color: subInk }]} numberOfLines={2}>{slide.body}</Text>
        </View>

        {slide.search ? (
          <View style={[st.search, { backgroundColor: dark ? 'rgba(8,20,22,0.55)' : '#FFFFFF', borderColor: dark ? 'rgba(255,255,255,0.10)' : '#E3ECEB' }]}>
            <Ionicons name="search" size={18} color={subInk} />
            <Text style={[st.searchText, { color: subInk }]} numberOfLines={1}>{slide.search.placeholder}</Text>
            <TouchableOpacity
              onPress={() => { haptics.tap(); (slide.search?.onFilter ?? slide.onPress)() }}
              accessibilityRole="button"
              accessibilityLabel="Filters"
              hitSlop={8}
              style={[st.filterBtn, { backgroundColor: orb }]}
            >
              <Ionicons name="options-outline" size={17} color={dark ? '#081416' : '#FFFFFF'} />
            </TouchableOpacity>
          </View>
        ) : slide.cta ? (
          <View style={[st.cta, { backgroundColor: orb }]}>
            <Text style={[st.ctaText, { color: dark && !alert ? '#081416' : '#FFFFFF' }]}>{slide.cta}</Text>
            <Ionicons name="arrow-forward" size={15} color={dark && !alert ? '#081416' : '#FFFFFF'} />
          </View>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    minHeight: 172,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: { fontSize: 21, fontWeight: '800', lineHeight: 27 },
  body:  { fontSize: 13, lineHeight: 19 },

  motifWrap: {
    position: 'absolute', right: 10, top: 0, bottom: 0,
    width: 112, alignItems: 'center', justifyContent: 'center',
  },
  motifOuter: { position: 'absolute', width: 112, height: 112, borderRadius: 56 },
  motifInner: { position: 'absolute', width: 76,  height: 76,  borderRadius: 38 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 52, borderRadius: 26, borderWidth: 1,
    paddingLeft: 16, paddingRight: 6,
  },
  searchText: { flex: 1, fontSize: 14 },
  filterBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  cta: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start', height: 42,
    paddingHorizontal: 18, borderRadius: 21,
  },
  ctaText: { fontSize: 14, fontWeight: '800' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
})
