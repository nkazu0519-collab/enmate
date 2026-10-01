<script setup lang="ts">
// 地図（Leaflet ＋ 地理院タイル）。渡されたルートの線と目印を描き、全体が収まる範囲を表示する
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapPoint, MapRoute } from '~/types/map'

const props = defineProps<{ routes: MapRoute[]; points: MapPoint[] }>()

const JAPAN_CENTER: [number, number] = [36.5, 138]
const POINT_ICONS = { home: '🏠', venue: '🏟', stop: '📍', rest: '🅿️' }
const POINT_LABELS = { home: '出発地', venue: '会場', stop: '立ち寄り先', rest: '休憩の提案' }

const el = ref<HTMLElement>()
let map: L.Map | undefined
let layer: L.LayerGroup | undefined

function draw() {
  if (!map || !layer) return
  layer.clearLayers()
  const bounds = L.latLngBounds([])

  // 行きと帰りは同じ道を通ることが多いので、帰りを太く下に、行きを細く上に描いて両方見えるようにする
  const ordered = [
    ...props.routes.filter((r) => r.direction === 'return'),
    ...props.routes.filter((r) => r.direction !== 'return'),
  ]
  const drawn = ordered.filter((route) => route.shape.length >= 2)
  // 白い縁取りを先にすべて敷いてから線を重ねる（1本ずつ描くと、行きの縁取りが帰りの線を隠す）
  for (const route of drawn) {
    L.polyline(route.shape, { color: '#ffffff', weight: (route.direction === 'return' ? 10 : 5) + 6, opacity: 0.95 }).addTo(layer)
  }
  for (const route of drawn) {
    const isReturn = route.direction === 'return'
    const line = L.polyline(route.shape, {
      color: isReturn ? '#e65100' : '#0d47a1',
      weight: isReturn ? 10 : 5,
      opacity: isReturn ? 0.75 : 1,
    }).addTo(layer)
    bounds.extend(line.getBounds())
  }

  for (const point of props.points) {
    const position: [number, number] = [point.place.lat, point.place.lon]
    const small = point.kind === 'rest' || point.kind === 'stop'
    const size = small ? 28 : 36
    L.marker(position, {
      icon: L.divIcon({
        className: small ? 'map-pin map-pin-small' : 'map-pin',
        html: point.icon ?? POINT_ICONS[point.kind],
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
      title: `${POINT_LABELS[point.kind]}: ${point.place.name}`,
    })
      .bindTooltip(`${POINT_LABELS[point.kind]}: ${point.place.name}`)
      .addTo(layer)
    bounds.extend(position)
  }

  if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 })
  else map.setView(JAPAN_CENTER, 5)
}

onMounted(() => {
  map = L.map(el.value!)
  // 標準地図だと色が濃くてルートの線が埋もれるので、淡色地図を使う
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    minZoom: 5,
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
  }).addTo(map)
  layer = L.layerGroup().addTo(map)
  draw()
})

// 描く中身が変わったときだけ描き直す（時刻の入力のたびに表示範囲が動かないようにする）
const signature = computed(() =>
  [
    ...props.routes.map((r) => `${r.id}:${r.shape.length}:${r.shape[0]}:${r.shape.at(-1)}`),
    ...props.points.map((p) => `${p.kind}:${p.place.lat},${p.place.lon}`),
  ].join('|'),
)
watch(signature, draw)

onBeforeUnmount(() => {
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="map-wrap">
    <div ref="el" class="map" role="application" aria-label="ルートの地図" />
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

/* 地図の色味を落として、ルートの線と目印を目立たせる */
.map :deep(.leaflet-tile-pane) {
  filter: saturate(0.3) brightness(1.04);
}

.map {
  flex: 1;
  min-height: 320px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
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
  height: 10px;
  margin-left: 12px;
  background: var(--color-return);
  opacity: 0.75;
}
</style>

<!-- 目印は Leaflet が作る要素なので、scoped を付けないスタイルで指定する -->
<style>
.map-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #1f2933;
  border-radius: 50%;
  background: #fff;
  font-size: 20px;
  line-height: 1;
}

.map-pin-small {
  font-size: 15px;
}
</style>
