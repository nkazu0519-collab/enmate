<script setup lang="ts">
// 立ち寄り先を追加する画面（仕様書 §4.5）。周辺観光・周辺グルメ・検索のタブから、続けていくつも足せる（足しても閉じない）。
// スマホでは下から出るシート、PC では左の列に重ねて出し、右の地図は見えたままにする
import { searchNearby, searchPlaces, type NearbyKind, type NearbyPlace } from '~/services/place'
import type { Place, Stop } from '~/types/plan'
import { formatDistance } from '~/utils/datetime'
import { stopFromPlace } from '~/utils/legs'

const props = defineProps<{
  legLabel: string
  center: Place // その日に向かう場所（周辺のおすすめを探す中心）
  defaultPosition: 'first' | 'last' // 寄る順番の初期値（行きは到着の直前、帰りは出発の直後）
}>()
const stops = defineModel<Stop[]>('stops', { required: true })
const emit = defineEmits<{ close: [] }>()

type Tab = NearbyKind | 'search'
const TABS: { id: Tab; label: string }[] = [
  { id: 'sightseeing', label: '周辺観光' },
  { id: 'meal', label: '周辺グルメ' },
  { id: 'search', label: '検索' },
]
const FIRST_COUNT = 6

const tab = ref<Tab>('sightseeing')
const lists = reactive<Record<Tab, NearbyPlace[] | null>>({ sightseeing: null, meal: null, search: null })
const loading = ref(false)
const error = ref('')
const showAll = ref(false)
const word = ref('')
const added = ref('')

// 寄る順番（0 始まりの差し込み位置）。立ち寄り先が増えたら初期値に戻す
const defaultIndex = () => (props.defaultPosition === 'first' ? 0 : stops.value.length)
const position = ref(defaultIndex())
watch(() => stops.value.length, () => (position.value = defaultIndex()))

async function load(t: Tab) {
  tab.value = t
  showAll.value = false
  error.value = ''
  if (t === 'search' || lists[t]) return
  loading.value = true
  try {
    lists[t] = await searchNearby(t, props.center)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '探せませんでした。もう一度押してください。'
  } finally {
    loading.value = false
  }
}

async function search() {
  const query = word.value.trim()
  if (query === '' || loading.value) return
  loading.value = true
  error.value = ''
  showAll.value = false
  try {
    lists.search = await searchPlaces(query)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '検索に失敗しました。もう一度押してください。'
  } finally {
    loading.value = false
  }
}

const current = computed(() => lists[tab.value])
const shown = computed(() => (current.value && !showAll.value ? current.value.slice(0, FIRST_COUNT) : (current.value ?? [])))

function isAdded(place: Place): boolean {
  return stops.value.some((s) => s.place.lat === place.lat && s.place.lon === place.lon)
}

function add(place: Place) {
  const index = Math.min(position.value, stops.value.length)
  const stop = stopFromPlace(place, tab.value === 'search' ? undefined : tab.value)
  stops.value = [...stops.value.slice(0, index), stop, ...stops.value.slice(index)]
  added.value = `「${place.name}」を${index + 1}番目の立ち寄り先に追加しました`
}

function distanceText(place: NearbyPlace): string {
  if (tab.value === 'search' || place.distanceMeters === undefined) return place.address ?? ''
  return `${props.center.name}から ${formatDistance(place.distanceMeters)}`
}

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  load('sightseeing')
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="`${props.legLabel}の立ち寄り先を追加`">
      <header class="sheet-header">
        <h2 class="sheet-title">{{ props.legLabel }}の立ち寄り先を追加</h2>
        <button type="button" class="btn btn-small" @click="emit('close')">✕ 閉じる</button>
      </header>

      <div class="tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="tab === t.id"
          @click="load(t.id)"
        >
          {{ t.label }}
        </button>
      </div>

      <label v-if="stops.length > 0" class="field order">
        <span class="field-label">寄る順番</span>
        <select v-model.number="position" class="input">
          <option v-for="(stop, i) in stops" :key="i" :value="i">{{ i + 1 }}番目（{{ stop.place.name }}の前）</option>
          <option :value="stops.length">{{ stops.length + 1 }}番目（最後）</option>
        </select>
      </label>

      <p v-if="added" class="notice notice-info" role="status">{{ added }}</p>

      <form v-if="tab === 'search'" class="search-row" @submit.prevent="search">
        <input v-model="word" class="input" type="search" placeholder="名前やキーワード（例: ラーメン、美術館）" aria-label="立ち寄り先の名前やキーワード" maxlength="50" />
        <button type="submit" class="btn" :disabled="loading || word.trim() === ''">{{ loading ? '検索中…' : '検索' }}</button>
      </form>
      <p v-if="tab === 'search'" class="muted">
        全国から探します。高速道路の SA/PA を入れると、高速を降りずに寄る休憩として計算します。通る都道府県から探す機能は、宿泊（段階3）と一緒に作ります。
      </p>
      <p v-else class="muted">{{ props.center.name }}の周辺（{{ tab === 'meal' ? '約3km' : '約10km' }}以内）を、近い順に出します。</p>

      <p v-if="loading && tab !== 'search'" class="muted">探しています…</p>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <p v-else-if="current && current.length === 0" class="notice notice-warn">見つかりませんでした。</p>

      <ul v-if="shown.length > 0" class="results">
        <li v-for="place in shown" :key="place.spotCode ?? `${place.lat},${place.lon}`" class="result">
          <div class="result-body">
            <p class="result-name">{{ place.name }}</p>
            <p class="muted">{{ [place.category, distanceText(place)].filter(Boolean).join('・') }}</p>
            <a v-if="place.spotCode" class="result-link" :href="spotUrl(place.spotCode)" target="_blank" rel="noopener">NAVITIMEで詳しく見る↗</a>
          </div>
          <button v-if="isAdded(place)" type="button" class="btn btn-small" disabled>✓ 立ち寄り先に追加済み</button>
          <button v-else type="button" class="btn btn-small btn-primary" @click="add(place)">＋ここに立ち寄る</button>
        </li>
      </ul>
      <button v-if="current && current.length > FIRST_COUNT && !showAll" type="button" class="btn btn-block" @click="showAll = true">
        もっと見る（あと{{ current.length - FIRST_COUNT }}件）
      </button>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: var(--header-height) 0 0 0;
  z-index: 1200;
  background: rgba(31, 41, 51, 0.35);
}

/* スマホ: 下から出るシート */
.sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  max-height: 85%;
  padding: 16px;
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: var(--color-surface);
}

/* PC: 左の列に重ねて出し、右の地図は見えたままにする */
@media (min-width: 1000px) {
  .backdrop {
    right: auto;
    width: min(600px, 45vw);
    background: transparent;
  }

  .sheet {
    top: 0;
    max-height: none;
    border-right: 1px solid var(--color-border);
    border-radius: 0;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.12);
  }
}

.sheet > * + * {
  margin-top: 12px;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sheet-title {
  font-size: 1.1rem;
}

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
}

.tab {
  padding: 8px 14px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
}

.tab[aria-selected='true'] {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary-dark);
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-row .btn {
  flex-shrink: 0;
}

.results {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
}

.result + .result {
  border-top: 1px solid var(--color-border);
}

.result-body {
  min-width: 0;
}

.result-name {
  font-weight: 600;
  line-height: 1.4;
}

.result-link {
  font-size: 0.875rem;
}

.result .btn {
  flex: none;
}
</style>
