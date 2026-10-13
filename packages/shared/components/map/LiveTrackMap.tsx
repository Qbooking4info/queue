// Live tracking map for Queue Ambulance: patient (live or booked pin), the crew's own
// unit, and the receiving hospital. Leaflet + OpenStreetMap inside a WebView, so it
// needs no Google Maps key and renders on every build (the Google key is restricted
// to the patient app's package + signing cert, which left the crew map blank).
//
// Positions are pushed into the page with injectJavaScript, so the map updates in
// place without reloading or losing the crew's pan/zoom.
import { useEffect, useMemo, useRef } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { WebView } from 'react-native-webview'

export interface LatLng { lat: number; lng: number }
export interface LiveTrackData {
  patient: (LatLng & { live?: boolean; label?: string }) | null
  unit?: LatLng | null
  destination?: (LatLng & { name?: string }) | null
}

const HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#m{margin:0;height:100%;width:100%;background:#E6F4F2}
  .pin{border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}
  .pt{width:18px;height:18px;background:#B91C1C}
  .pt.live{animation:pulse 1.6s infinite}
  .un{width:18px;height:18px;background:#0F766E}
  .hs{width:16px;height:16px;background:#134E4A;border-radius:4px}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(185,28,28,.55)}70%{box-shadow:0 0 0 14px rgba(185,28,28,0)}100%{box-shadow:0 0 0 0 rgba(185,28,28,0)}}
  .leaflet-control-attribution{font-size:9px}
</style></head><body><div id="m"></div><script>
  var map = L.map('m', { zoomControl: false, attributionControl: true }).setView([6.5244, 3.3792], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  var icon = function (c) { return L.divIcon({ className: '', html: '<div class="pin ' + c + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) };
  var mk = {}, line = null, userMoved = false, first = true;
  map.on('dragstart zoomstart', function () { if (!first) userMoved = true });
  function put(key, p, cls, title) {
    if (!p) { if (mk[key]) { map.removeLayer(mk[key]); delete mk[key] } return }
    if (!mk[key]) mk[key] = L.marker([p.lat, p.lng], { icon: icon(cls), title: title }).addTo(map).bindTooltip(title);
    else { mk[key].setLatLng([p.lat, p.lng]); mk[key].setIcon(icon(cls)); mk[key].setTooltipContent(title) }
  }
  window.update = function (d) {
    put('patient', d.patient, 'pt' + (d.patient && d.patient.live ? ' live' : ''), (d.patient && d.patient.label) || 'Patient');
    put('unit', d.unit, 'un', 'Your ambulance');
    put('dest', d.destination, 'hs', (d.destination && d.destination.name) || 'Hospital');
    var pts = ['unit', 'patient', 'dest'].filter(function (k) { return mk[k] }).map(function (k) { return mk[k].getLatLng() });
    if (line) map.removeLayer(line);
    line = pts.length > 1 ? L.polyline(pts, { color: '#0F766E', weight: 4, opacity: .7, dashArray: '8 8' }).addTo(map) : null;
    if (!userMoved && pts.length) {
      if (pts.length === 1) map.setView(pts[0], 15); else map.fitBounds(L.latLngBounds(pts).pad(0.3));
    }
    first = false;
  };
  window.recenter = function () { userMoved = false; window.update(window.__last || {}) };
  document.addEventListener('message', function (e) { try { var d = JSON.parse(e.data); window.__last = d; window.update(d) } catch (_) {} });
  window.addEventListener('message', function (e) { try { var d = JSON.parse(e.data); window.__last = d; window.update(d) } catch (_) {} });
</script></body></html>`

export function LiveTrackMap({ data, style, recenterKey }: {
  data: LiveTrackData
  style?: StyleProp<ViewStyle>
  /** Change this value to snap the view back to fit everything. */
  recenterKey?: number
}) {
  const ref = useRef<WebView>(null)
  const ready = useRef(false)
  const payload = useMemo(() => JSON.stringify(data), [data])

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.__last=${payload};window.update(${payload});true;`)
  }, [payload])
  useEffect(() => {
    if (ready.current && recenterKey) ref.current?.injectJavaScript('window.recenter();true;')
  }, [recenterKey])

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#E6F4F2' }, style]} accessibilityLabel="Live tracking map">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: HTML }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => {
          ready.current = true
          ref.current?.injectJavaScript(`window.__last=${payload};window.update(${payload});true;`)
        }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
      />
    </View>
  )
}
