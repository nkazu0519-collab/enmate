<script setup lang="ts">
// 地図（MapLibre ＋ OpenFreeMap の Positron）。渡されたルートの線と目印を描き、全体が収まる範囲を表示する
// 灰色の濃淡だけの地図にして、ルートの線を目立たせる（2026-10-02 に本人が地理院タイルから変更。設計書 §10.7）
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// 地図の計算を受け持つ worker。MapLibre は自分のファイルの隣から読み込もうとするが、ビルドすると場所が変わるので、
// Vite に1つのファイルへまとめさせ、その URL を教える
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { MapPoint, MapRoute } from '~/types/map'

setWorkerUrl(workerUrl)

const props = defineProps<{ routes: MapRoute[]; points: MapPoint[] }>()
const emit = defineEmits<{ 'rest-click': [id: string] }>()

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const JAPAN_CENTER: [number, number] = [138, 36.5] // 経度, 緯度
// 動かせる範囲（日本の周り。南は沖縄・先島、北は北海道、東は南鳥島の手前まで）。スマホで指が滑って海の上で迷わないように
const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [122, 20],
  [150, 46.5],
]
const POINT_ICONS = { home: '🏠', venue: '🏟', hotel: '🏨', stop: '📍', rest: '🅿️' }
const POINT_LABELS = { home: '出発地', venue: '会場', hotel: '宿泊先', stop: '立ち寄り先', rest: '休憩の提案' }
// 地図の画像を読み込めなかったときの、線と目印だけの地図
const PLAIN_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f2f2f0' } }] }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// Positron の地名は「Nagaoka 長岡市」のようにローマ字と併記なので、日本語の名前だけにする
async function loadStyle(): Promise<StyleSpecification | null> {
  try {
    const style = (await $fetch<StyleSpecification>(STYLE_URL, { retry: 0, timeout: 10_000 })) as StyleSpecification
    for (const layer of style.layers) {
      // 名前を出す設定だけを置き換える。道路番号の標識（「18」などの番号を出す設定）まで置き換えると、
      // 番号用の小さな四角に道路名が入って崩れる（2026-10-02 本人の指摘）
      if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
      if (JSON.stringify(layer.layout['text-field']).includes('name:latin')) layer.layout['text-field'] = ['coalesce', ['get', 'name:ja'], ['get', 'name']]
    }
    return style
  } catch {
    return null
  }
}

const el = ref<HTMLElement>()
const styleFailed = ref(false)
let map: MapLibreMap | undefined
let ready = false
let markers: Marker[] = []

function pinElement(point: MapPoint): HTMLElement {
  const small = point.kind === 'rest' || point.kind === 'stop'
  const pin = document.createElement('div')
  pin.className = `map-pin map-pin-${point.kind}${small ? ' map-pin-small' : ''}`
  pin.innerHTML = point.kind === 'rest' ? escapeHtml(point.label ?? '休') : `${point.icon ?? POINT_ICONS[point.kind]}${point.label ? `<b>${escapeHtml(point.label)}</b>` : ''}`
  return pin
}

function addMarker(point: MapPoint) {
  if (!map) return
  const position: [number, number] = [point.place.lon, point.place.lat]
  const title = `${POINT_LABELS[point.kind]}: ${point.place.name}`
  const pin = pinElement(point)

  if (point.kind === 'rest' && point.id) {
    // 休憩候補の吹き出しは常に出しておき、押すと「ここで30分休憩する」と同じように立ち寄り先に入れる（仕様書 §4.8）
    const id = point.id
    const wrap = document.createElement('div')
    wrap.className = 'map-rest'
    wrap.setAttribute('role', 'button')
    wrap.tabIndex = 0
    wrap.setAttribute('aria-label', `${point.place.name}で30分休憩する`)
    wrap.innerHTML = `<span class="rest-tip"><span class="rest-tip-badge">${escapeHtml(point.label ?? '')} ${escapeHtml(point.note ?? '')}</span><br>${escapeHtml(point.place.name)}<br><span class="rest-tip-add">＋ここで30分休憩する</span></span>`
    wrap.append(pin)
    wrap.addEventListener('click', () => emit('rest-click', id))
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        emit('rest-click', id)
      }
    })
    // 目印の中心がその地点に来るよう、下端から目印の半分（14px）ずらす
    markers.push(new Marker({ element: wrap, anchor: 'bottom', offset: [0, 14] }).setLngLat(position).addTo(map))
    return
  }

  pin.title = title
  pin.setAttribute('aria-label', title)
  const popup = new Popup({ offset: 20, closeButton: false }).setText(title)
  markers.push(new Marker({ element: pin }).setLngLat(position).setPopup(popup).addTo(map))
}

function draw() {
  if (!map || !ready) return
  // 帰りを下に、行きを上に描く（同じ太さなので、同じ道を通るところは行きの線が見える）
  const drawn = [...props.routes.filter((r) => r.direction === 'return'), ...props.routes.filter((r) => r.direction !== 'return')].filter((r) => r.shape.length >= 2)
  ;(map.getSource('routes') as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: drawn.map((route) => ({
      type: 'Feature',
      properties: { direction: route.direction === 'return' ? 'return' : 'outbound' },
      geometry: { type: 'LineString', coordinates: route.shape.map(([lat, lon]) => [lon, lat]) },
    })),
  })

  for (const marker of markers) marker.remove()
  markers = []
  for (const point of props.points) addMarker(point)

  const bounds = new LngLatBounds()
  for (const route of drawn) for (const [lat, lon] of route.shape) bounds.extend([lon, lat])
  for (const point of props.points) bounds.extend([point.place.lon, point.place.lat])
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 32, maxZoom: 13, animate: false })
  else map.jumpTo({ center: JAPAN_CENTER, zoom: 4 })
}

onMounted(async () => {
  const style = await loadStyle()
  if (!el.value) return // 読み込み中にページを離れた
  styleFailed.value = style === null
  map = new MapLibreMap({
    container: el.value,
    style: style ?? PLAIN_STYLE,
    center: JAPAN_CENTER,
    zoom: 4,
    maxBounds: JAPAN_BOUNDS,
    maxZoom: 17,
    renderWorldCopies: false,
    // 回転・傾きは使わない（北が上のまま）
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: false },
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new NavigationControl({ showCompass: false }), 'top-left')
  map.on('load', () => {
    if (!map) return
    map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    // 白い縁取りを先にすべて敷いてから線を重ねる（1本ずつ描くと、行きの縁取りが帰りの線を隠す）
    map.addLayer({ id: 'route-casing', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.95 } })
    // 帰りも行きと同じ太さ（2026-10-02 本人の指示）
    map.addLayer({ id: 'route-return', type: 'line', source: 'routes', filter: ['==', ['get', 'direction'], 'return'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e65100', 'line-width': 5, 'line-opacity': 0.75 } })
    map.addLayer({ id: 'route-outbound', type: 'line', source: 'routes', filter: ['==', ['get', 'direction'], 'outbound'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0d47a1', 'line-width': 5 } })
    ready = true
    draw()
  })
})

// 描く中身が変わったときだけ描き直す（時刻の入力のたびに表示範囲が動かないようにする）。
// 線は点をすべて比べ（両端と点の数が同じで、途中だけ違うルートもある）、目印は絵と番号も比べる（立ち寄り先の種類を変えたとき）
const signature = computed(() =>
  [
    ...props.routes.map((r) => `${r.id}:${r.direction}:${r.shape.join(';')}`),
    ...props.points.map((p) => `${p.kind}:${p.place.lat},${p.place.lon}:${p.icon ?? ''}:${p.label ?? ''}:${p.note ?? ''}:${p.place.name}`),
  ].join('|'),
)
watch(signature, draw)

onBeforeUnmount(() => {
  map?.remove()
  map = undefined
  ready = false
  markers = []
})
</script>

<template>
  <div class="map-wrap">
    <div ref="el" class="map" role="application" aria-label="ルートの地図" />
    <p v-if="styleFailed" class="notice notice-warn">地図の画像を読み込めなかったため、ルートの線と目印だけを出しています。</p>
    <p class="legend muted">
      <span class="swatch swatch-outbound" />行き
      <span class="swatch swatch-return" />帰り
    </p>
  </div>
</template>

<style scoped>
.map-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.map {
  flex: 1;
  min-height: 320px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.notice {
  margin-top: 6px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.swatch {
  display: inline-block;
  width: 28px;
  border-radius: 3px;
}

.swatch-outbound {
  height: 5px;
  background: var(--color-primary-dark);
}

.swatch-return {
  height: 5px;
  margin-left: 12px;
  background: var(--color-return);
  opacity: 0.75;
}
</style>

<!-- 目印は MapLibre が地図の上に置く要素なので、scoped を付けないスタイルで指定する -->
<style>
/* 位置は MapLibre が決める（position を指定すると、目印どうしが前の目印の高さ分ずれる） */
.map-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  border: 2px solid #1f2933;
  border-radius: 50%;
  background: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.map-pin-small {
  width: 28px;
  height: 28px;
  font-size: 15px;
}

.map-pin b {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #1f2933;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.map-pin-rest {
  border-color: #e65100;
  background: #e65100;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

/* 休憩候補: 吹き出しを目印の上に常に出す */
.map-rest {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.map-rest:focus-visible {
  outline: none;
}

.map-rest:focus-visible .rest-tip {
  outline: 3px solid #0d47a1;
}

.rest-tip {
  position: relative;
  padding: 4px 8px;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  color: #1f2933;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  text-align: center;
}

.rest-tip::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  margin-left: -6px;
  border: 6px solid transparent;
  border-top-color: #fff;
  border-bottom: 0;
}

.rest-tip-badge {
  font-weight: 700;
  color: #e65100;
}

.rest-tip-add {
  font-weight: 700;
  color: #0d47a1;
}

.maplibregl-popup-content {
  padding: 6px 10px;
  font-size: 13px;
}
</style>
