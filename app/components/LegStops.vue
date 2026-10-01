<script setup lang="ts">
// 区間1つ分の立ち寄り先を編集する欄。名前で探すか、会場の周辺のグルメ・観光から選んで足す
import { searchNearby, type NearbyKind, type NearbyPlace } from '~/services/place'
import type { Place, Stop, StopKind } from '~/types/plan'
import { formatDistance } from '~/utils/datetime'
import { DEFAULT_STAY_MINUTES, MAX_STAY_MINUTES, MAX_STOPS, STOP_KIND_LABELS } from '~/utils/legs'

const props = defineProps<{ legLabel: string; venue: Place }>()
const stops = defineModel<Stop[]>({ required: true })

const KINDS = Object.keys(STOP_KIND_LABELS) as StopKind[]
const NEARBY_LABELS: Record<NearbyKind, string> = { meal: 'グルメ', sightseeing: '観光' }

const full = computed(() => stops.value.length >= MAX_STOPS)

function add(place: Place, kind: StopKind) {
  if (full.value) return
  stops.value = [...stops.value, { place, kind, stayMinutes: DEFAULT_STAY_MINUTES[kind] }]
}

function remove(index: number) {
  stops.value = stops.value.filter((_, i) => i !== index)
}

function move(index: number, by: -1 | 1) {
  const next = [...stops.value]
  const [stop] = next.splice(index, 1)
  next.splice(index + by, 0, stop!)
  stops.value = next
}

function update(index: number, patch: Partial<Stop>) {
  stops.value = stops.value.map((stop, i) => (i === index ? { ...stop, ...patch } : stop))
}

// 名前で探して選んだら、すぐ立ち寄り先に足して欄を空に戻す
const picked = ref<Place | null>(null)
watch(picked, (place) => {
  if (!place) return
  add(place, 'other')
  picked.value = null
})

// 会場の周辺。ボタンを押した時だけ探す（同じ会場・種類なら使い回す）
const nearbyKind = ref<NearbyKind | null>(null)
const nearby = ref<NearbyPlace[] | null>(null)
const nearbyLoading = ref(false)
const nearbyError = ref('')

async function openNearby(kind: NearbyKind) {
  if (nearbyLoading.value) return
  nearbyKind.value = kind
  nearby.value = null
  nearbyError.value = ''
  nearbyLoading.value = true
  try {
    nearby.value = await searchNearby(kind, props.venue)
  } catch (e) {
    nearbyError.value = e instanceof Error ? e.message : '探せませんでした。もう一度押してください。'
  } finally {
    nearbyLoading.value = false
  }
}

function isAdded(place: Place): boolean {
  return stops.value.some((s) => s.place.lat === place.lat && s.place.lon === place.lon)
}
</script>

<template>
  <section class="stops">
    <h4 class="stops-title">{{ props.legLabel }}の立ち寄り先</h4>

    <ol v-if="stops.length > 0" class="stop-list">
      <li v-for="(stop, i) in stops" :key="`${stop.place.lat},${stop.place.lon},${i}`" class="stop">
        <div class="stop-head">
          <span class="stop-order">{{ i + 1 }}</span>
          <span class="stop-name">{{ stop.place.name }}</span>
          <span class="stop-moves">
            <button type="button" class="btn btn-small" :disabled="i === 0" :aria-label="`${stop.place.name}を前へ`" @click="move(i, -1)">↑</button>
            <button type="button" class="btn btn-small" :disabled="i === stops.length - 1" :aria-label="`${stop.place.name}を後ろへ`" @click="move(i, 1)">↓</button>
            <button type="button" class="btn btn-small btn-danger" :aria-label="`${stop.place.name}を外す`" @click="remove(i)">外す</button>
          </span>
        </div>
        <div class="stop-fields">
          <label>
            <span class="sr-only">種類</span>
            <select class="input" :value="stop.kind" @change="update(i, { kind: ($event.target as HTMLSelectElement).value as StopKind })">
              <option v-for="kind in KINDS" :key="kind" :value="kind">{{ STOP_KIND_LABELS[kind] }}</option>
            </select>
          </label>
          <label class="stay">
            <input
              class="input"
              type="number"
              min="0"
              :max="MAX_STAY_MINUTES"
              step="5"
              :value="stop.stayMinutes"
              :aria-label="`${stop.place.name}にいる時間（分）`"
              @input="update(i, { stayMinutes: ($event.target as HTMLInputElement).valueAsNumber })"
            />
            <span>分いる</span>
          </label>
        </div>
      </li>
    </ol>
    <p v-else class="muted">寄りたい所があれば足してください。いる時間も含めて、時刻を計算し直します。</p>

    <p v-if="full" class="muted">立ち寄り先は{{ MAX_STOPS }}か所までです。</p>
    <template v-else>
      <PlaceField v-model="picked" :label="`名前で探して${props.legLabel}に足す`" placeholder="例: 道の駅、サービスエリア、店の名前" />

      <div class="nearby-buttons">
        <span class="muted">{{ props.venue.name }}の周辺から選ぶ:</span>
        <button v-for="kind in (['meal', 'sightseeing'] as NearbyKind[])" :key="kind" type="button" class="btn btn-small" :disabled="nearbyLoading" @click="openNearby(kind)">
          {{ nearbyLoading && nearbyKind === kind ? '探しています…' : NEARBY_LABELS[kind] }}
        </button>
      </div>
      <p v-if="nearbyError" class="notice notice-error" role="alert">{{ nearbyError }}</p>
      <p v-else-if="nearby && nearby.length === 0" class="notice notice-warn">周辺に見つかりませんでした。</p>
      <ul v-else-if="nearby && nearbyKind" class="nearby">
        <li v-for="place in nearby" :key="place.spotCode ?? `${place.lat},${place.lon}`" class="nearby-item">
          <div>
            <p class="nearby-name">{{ place.name }}</p>
            <p class="muted">
              {{ [place.category, place.distanceMeters !== undefined ? `会場から${formatDistance(place.distanceMeters)}` : ''].filter(Boolean).join('・') }}
            </p>
          </div>
          <button type="button" class="btn btn-small" :disabled="isAdded(place)" @click="add(place, nearbyKind)">
            {{ isAdded(place) ? '足しました' : '足す' }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.stops > * + * {
  margin-top: 10px;
}

.stops-title {
  font-size: 0.95rem;
}

.stop-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.stop {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.stop + .stop {
  margin-top: 8px;
}

.stop-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stop-order {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-text);
  color: #fff;
  font-size: 0.8rem;
}

.stop-name {
  flex: 1;
  font-weight: 600;
  line-height: 1.4;
}

.stop-moves {
  display: flex;
  flex: none;
  gap: 4px;
}

.stop-moves .btn {
  min-width: 36px;
  padding: 4px 8px;
}

.stop-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.stop-fields select {
  width: auto;
}

.stay {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stay .input {
  width: 90px;
}

.nearby-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.nearby {
  max-height: 320px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.nearby-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
}

.nearby-item + .nearby-item {
  border-top: 1px solid var(--color-border);
}

.nearby-name {
  font-weight: 600;
  line-height: 1.4;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
