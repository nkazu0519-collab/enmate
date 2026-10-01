<script setup lang="ts">
// 立ち寄り先を追加する画面（仕様書 §4.5）。周辺観光・周辺グルメ・通る都道府県・検索のタブから、続けていくつも足せる（足しても閉じない）。
// スマホでは下から出るシート、PC では左の列に重ねて出し、右の地図は見えたままにする
import { searchAlongRoute, searchPopular, searchWordIn } from '~/services/area'
import { searchNearby, type NearbyKind, type NearbyPlace } from '~/services/place'
import type { Place, Stop } from '~/types/plan'
import { formatDistance } from '~/utils/datetime'
import { stopFromPlace } from '~/utils/legs'
import type { Prefecture } from '~/utils/routeArea'

const props = defineProps<{
  legLabel: string
  center: Place // その日に向かう場所（周辺のおすすめを探す中心）
  defaultPosition: 'first' | 'last' // 寄る順番の初期値（行きは到着の直前、帰りは出発の直後）
  loadRoute: () => Promise<[number, number][]> // その区間のルートの形（通る都道府県を調べる）
}>()
const stops = defineModel<Stop[]>('stops', { required: true })
const emit = defineEmits<{ close: [] }>()

type SpotKind = Exclude<NearbyKind, 'hotel'>
type Tab = SpotKind | 'area'
const TABS: { id: Tab; label: string }[] = [
  { id: 'sightseeing', label: '周辺観光' },
  { id: 'meal', label: '周辺グルメ' },
  { id: 'area', label: '通る都道府県・検索' },
]
const KIND_LABELS: Record<SpotKind, string> = { sightseeing: '観光', meal: 'グルメ' }
const FIRST_COUNT = 6

const tab = ref<Tab>('sightseeing')
const lists = reactive<Record<Tab, NearbyPlace[] | null>>({ sightseeing: null, meal: null, area: null })
const loading = ref(false)
const error = ref('')
const showAll = ref(false)
const added = ref('')

// 通る都道府県・検索のタブ。言葉で検索している間（searchedWord が空でない）は、探す範囲と種類の切り替えを出さない
const areas = useRouteAreas(props.loadRoute)
const pref = ref<Prefecture | null>(null)
const range = ref<'route' | 'all'>('route')
const areaKind = ref<SpotKind>('sightseeing')
const word = ref('')
const searchedWord = ref('')

// 寄る順番（0 始まりの差し込み位置）。立ち寄り先が増えたら初期値に戻す
const defaultIndex = () => (props.defaultPosition === 'first' ? 0 : stops.value.length)
const position = ref(defaultIndex())
watch(() => stops.value.length, () => (position.value = defaultIndex()))

// 一覧を出す処理。途中で条件を変えたら、前の結果は使わない
let request = 0
async function show(t: Tab, find: () => Promise<NearbyPlace[]>, failMessage = '探せませんでした。もう一度押してください。') {
  const id = ++request
  loading.value = true
  error.value = ''
  showAll.value = false
  lists[t] = null
  try {
    const places = await find()
    if (id === request) lists[t] = places
  } catch (e) {
    if (id === request) error.value = e instanceof Error ? e.message : failMessage
  } finally {
    if (id === request) loading.value = false
  }
}

function load(t: Tab) {
  tab.value = t
  showAll.value = false
  error.value = ''
  if (t === 'area') {
    areas.load()
    return
  }
  if (!lists[t]) show(t, () => searchNearby(t, props.center))
}

// 通る都道府県・検索のタブの一覧を、今の条件で出し直す
function showArea() {
  const p = pref.value
  if (searchedWord.value) {
    show('area', () => searchWordIn(searchedWord.value, p), '検索に失敗しました。もう一度押してください。')
  } else if (!p) {
    // 進んでいる検索の結果は使わない（言葉を消したあとに、前の言葉の結果が出ないようにする）
    request++
    loading.value = false
    lists.area = null
  } else if (range.value === 'route') {
    show('area', () => searchAlongRoute(areaKind.value, areas.shape.value, areas.samples.value ?? [], p))
  } else {
    show('area', () => searchPopular(areaKind.value, p))
  }
}

function selectPref(next: Prefecture | null) {
  pref.value = next
  showArea()
}

function search() {
  const query = word.value.trim()
  if (query === '' || loading.value) return
  searchedWord.value = query
  showArea()
}

// 入力欄の「✕」で言葉を消すと、ルート沿いのおすすめに戻る（全国を選んでいたら、都道府県を選ぶところから）
watch(word, (value) => {
  if (value.trim() !== '' || !searchedWord.value) return
  searchedWord.value = ''
  range.value = 'route'
  showArea()
})

const current = computed(() => lists[tab.value])
const shown = computed(() => (current.value && !showAll.value ? current.value.slice(0, FIRST_COUNT) : (current.value ?? [])))

function isAdded(place: Place): boolean {
  return stops.value.some((s) => s.place.lat === place.lat && s.place.lon === place.lon)
}

function add(place: Place) {
  const index = Math.min(position.value, stops.value.length)
  // 周辺観光・周辺グルメはタブの種類、通る都道府県・検索は場所の種類から決める（仕様書 §4.5）
  const { distanceMeters: _, ...spot } = place as NearbyPlace
  const stop = stopFromPlace(spot, tab.value === 'area' ? undefined : tab.value)
  stops.value = [...stops.value.slice(0, index), stop, ...stops.value.slice(index)]
  added.value = `「${place.name}」を${index + 1}番目の立ち寄り先に追加しました`
}

// 候補のカードの距離。周辺は探した場所から、ルート沿いはルートから。都道府県全体と言葉の検索は、距離の代わりに住所
function distanceText(place: NearbyPlace): string {
  if (place.distanceMeters === undefined) return place.address ?? ''
  if (tab.value === 'area') return `ルートから ${formatDistance(place.distanceMeters)}`
  return `${props.center.name}から ${formatDistance(place.distanceMeters)}`
}

const areaDescription = computed(() => {
  if (searchedWord.value) return pref.value ? `${pref.value.name}の中から探しました。` : '全国から探しました。'
  if (!pref.value) return '都道府県を選ぶと、その中のルート沿いのおすすめを出します。名前やキーワードを入れると、全国から探せます。'
  if (range.value === 'route') {
    return `${pref.value.name}の中の、ルートから約10km以内の${KIND_LABELS[areaKind.value]}を、ルートから近い順に出します。`
  }
  return `${pref.value.name}全体の人気の${KIND_LABELS[areaKind.value]}を出します。`
})

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`

onMounted(() => load('sightseeing'))
</script>

<template>
  <BottomSheet :title="`${props.legLabel}の立ち寄り先を追加`" @close="emit('close')">

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

    <template v-if="tab === 'area'">
      <form class="search-row" @submit.prevent="search">
        <input v-model="word" class="input" type="search" placeholder="名前やキーワード（例: ラーメン、美術館）" aria-label="立ち寄り先の名前やキーワード" maxlength="50" />
        <button type="submit" class="btn" :disabled="loading || word.trim() === ''">{{ loading && searchedWord ? '検索中…' : '検索' }}</button>
      </form>
      <p class="muted">高速道路の SA/PA を入れると、高速を降りずに寄る休憩として計算します。</p>

      <p v-if="areas.loading.value" class="muted">ルートが通る都道府県を調べています…</p>
      <p v-else-if="areas.error.value" class="notice notice-error" role="alert">{{ areas.error.value }}</p>
      <template v-else-if="areas.samples.value">
        <PrefectureSelect :prefectures="areas.prefectures.value" :selected="pref" :national="!!searchedWord" @select="selectPref" />
        <template v-if="pref && !searchedWord">
          <div class="chips" role="group" aria-label="探す範囲">
            <button type="button" class="chip" :aria-pressed="range === 'route'" @click="range = 'route'; showArea()">ルート沿い</button>
            <button type="button" class="chip" :aria-pressed="range === 'all'" @click="range = 'all'; showArea()">{{ pref.name }}全体</button>
          </div>
          <div class="chips" role="group" aria-label="種類">
            <button
              v-for="k in (['sightseeing', 'meal'] as const)"
              :key="k"
              type="button"
              class="chip"
              :aria-pressed="areaKind === k"
              @click="areaKind = k; showArea()"
            >
              {{ KIND_LABELS[k] }}
            </button>
          </div>
        </template>
      </template>
      <p class="muted">{{ areaDescription }}</p>
    </template>
    <p v-else class="muted">{{ props.center.name }}の周辺（{{ tab === 'meal' ? '約3km' : '約10km' }}以内）を、近い順に出します。</p>

    <p v-if="loading && !(tab === 'area' && searchedWord)" class="muted">探しています…</p>
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
  </BottomSheet>
</template>
