export interface HospitalsMapMarker {
  id: string
  latitude: number
  longitude: number
  title: string
  subtitle?: string
}

export interface HospitalsMapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export interface HospitalsMapProps {
  markers: HospitalsMapMarker[]
  initialRegion: HospitalsMapRegion
  style?: any
  interactive?: boolean
  showsUserLocation?: boolean
  onMarkerPress?: (id: string) => void
}
