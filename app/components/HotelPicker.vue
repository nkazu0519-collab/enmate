<script setup lang="ts">
// 宿泊先を選ぶ画面（仕様書 §4.4）。「会場周辺」は会場から約5km以内のホテル・旅館などを近い順に出す。
// 「通る都道府県」は、前泊は自宅→会場、後泊は会場→自宅のルートが通る都道府県から探す。
// 「検索」は名前で全国から探す（仕様書にない追加。宿の名前が分かっているときのため）
import { citiesOf, searchAlongRoute, searchInCity, searchPopular, type City } from '~/services/area'
import { isLodgingCode, searchNearby, searchPlaces, type NearbyPlace } from '~/services/place'
import type { Place } from '~/types/plan'
import { formatDistance } from '~/utils/datetime'
import type { Prefecture } from '~/utils/routeArea'

const props = defineProps<{
  title: string // 例: 前日の宿泊先を選ぶ
  venue: Place
  selected: Place | null
  loadRoute: () => Promise<[number, number][]> // 通る都道府県を調べるルートの形
}>()
const emit = defineEmits<{ select: [place: Place]; close: [] }>()

type Tab = 'nearby' | 'route' | 'search'
const TABS: { id: Tab; label: string }[] = [
  { id: 'nearby', label: '会場周辺' },
  { id: 'route', label: '通る都道府県' },
  { id: 'search', label: '検索' },
]
const FIRST_COUNT = 6

const tab = ref<Tab>('nearby')
const lists = reactive<Record<Tab, NearbyPlace[] | null>>({ nearby: null, route: null, search: null })
const loading = ref(false)
const error = ref('')
const showAll = ref(false)
const word = ref('')

// 通る都道府県のタブ。pref が通らない都道府県なら、市区町村を選ぶまでは都道府県全体の人気の宿泊先を出す
const areas = useRouteAreas(props.loadRoute)
const pref = ref<Prefecture | null>(null)
const onRoute = computed(() => !!pref.value && areas.prefectures.value.some((p) => p.code === pref.value!.code))
const cities = ref<City[] | null>(null)
const cityCode = ref('') // 空ならルート沿い（通らない都道府県なら全体）
const city = computed(() => cities.value?.find((c) => c.code === cityCode.value) ?? null)
const routeCities = computed(() => (cities.value ?? []).filter((c) => areas.routeCityCodes.value.has(c.code)))
const otherCities = computed(() => (cities.value ?? []).filter((c) => !areas.routeCityCodes.value.has(c.code)))

// 一覧を出す処理。途中で別の都道府県を選んだら、前の結果は使わない
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
  if (t === 'route') areas.load()
  if (t !== 'nearby' || lists.nearby) return
  show('nearby', () => searchNearby('hotel', props.venue))
}

async function selectPref(next: Prefecture | null) {
  if (!next) return
  pref.value = next
  cityCode.value = ''
  cities.value = null
  showArea()
  try {
    const list = await citiesOf(next)
    if (pref.value?.code === next.code) cities.value = list
  } catch {
    // 市区町村のプルダウンが出せないだけで、都道府県の一覧はそのまま使える
  }
}

function showArea() {
  const p = pref.value
  if (!p) return
  const c = city.value
  if (c) show('route', () => searchInCity('hotel', c))
  else if (onRoute.value) show('route', () => searchAlongRoute('hotel', areas.shape.value, areas.samples.value ?? [], p))
  else show('route', () => searchPopular('hotel', p))
}

async function search() {
  const query = word.value.trim()
  if (query === '' || loading.value) return
  // 駅や店など宿でない場所は、ほかのタブと同じく除く（2026-10-01 レビューで決定）
  show('search', async () => (await searchPlaces(query)).filter((place) => isLodgingCode(place.categoryCode)), '検索に失敗しました。もう一度押してください。')
}

const current = computed(() => lists[tab.value])
const shown = computed(() => (current.value && !showAll.value ? current.value.slice(0, FIRST_COUNT) : (current.value ?? [])))

const isSelected = (place: Place) => !!props.selected && props.selected.lat === place.lat && props.selected.lon === place.lon

function choose(place: Place) {
  // 距離は探した場所によって変わるので、宿泊先には持たせない
  const { distanceMeters: _, ...hotel } = place as NearbyPlace
  emit('select', hotel)
  emit('close')
}

// 候補のカードの距離（仕様書 §4.4）。会場周辺は会場から、通る都道府県はルートから、市区町村はその中心から。
// 名前の検索と、通らない都道府県の全体の一覧は、距離の代わりに住所
function detailText(place: NearbyPlace): string {
  if (place.distanceMeters === undefined || tab.value === 'search') return place.address ?? ''
  if (tab.value === 'nearby') return `${props.venue.name}から ${formatDistance(place.distanceMeters)}`
  if (city.value) return `${city.value.name}の中心から ${formatDistance(place.distanceMeters)}`
  return `ルートから ${formatDistance(place.distanceMeters)}`
}

const routeDescription = computed(() => {
  if (!pref.value) return ''
  if (city.value) return `${city.value.name}の中心から約10km以内で、住所が${city.value.name}のホテル・旅館などを、近い順に出します。`
  if (onRoute.value) return `${pref.value.name}の中の、ルートから約10km以内のホテル・旅館などを、ルートから近い順に出します。`
  return `${pref.value.name}全体の人気の宿泊先を出します。市区町村を選ぶと、その中から探します。`
})

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`

onMounted(() => load('nearby'))
</script>

<template>
  <BottomSheet :title="props.title" @close="emit('close')">
    <div class="tabs" role="tablist">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" class="tab" :aria-selected="tab === t.id" @click="load(t.id)">
        {{ t.label }}
      </button>
    </div>

    <form v-if="tab === 'search'" class="search-row" @submit.prevent="search">
      <input v-model="word" class="input" type="search" placeholder="宿の名前や地名（例: 高松 ホテル）" aria-label="宿泊先の名前や地名" maxlength="50" />
      <button type="submit" class="btn" :disabled="loading || word.trim() === ''">{{ loading ? '検索中…' : '検索' }}</button>
    </form>
    <p v-if="tab === 'search'" class="muted">全国のホテル・旅館などから探します（宿でない場所は出しません）。会場と離れた場所に泊まるときに使ってください。</p>
    <p v-else-if="tab === 'nearby'" class="muted">{{ props.venue.name }}から約5km以内のホテル・旅館などを、近い順に出します。</p>

    <template v-if="tab === 'route'">
      <p v-if="areas.loading.value" class="muted">ルートが通る都道府県を調べています…</p>
      <p v-else-if="areas.error.value" class="notice notice-error" role="alert">{{ areas.error.value }}</p>
      <template v-else-if="areas.samples.value">
        <p v-if="areas.prefectures.value.length === 0" class="notice notice-warn">通る都道府県が分かりませんでした。下の「そのほかの都道府県」から選んでください。</p>
        <PrefectureSelect :prefectures="areas.prefectures.value" :selected="pref" others @select="selectPref" />
        <label v-if="pref" class="field">
          <span class="field-label">市区町村</span>
          <select v-model="cityCode" class="input" :disabled="!cities" @change="showArea">
            <option value="">{{ onRoute ? `${pref.name}のルート沿い` : `${pref.name}全体（人気の宿泊先）` }}</option>
            <template v-if="onRoute">
              <optgroup v-if="routeCities.length > 0" label="ルートが通る市区町村">
                <option v-for="c in routeCities" :key="c.code" :value="c.code">{{ c.name }}</option>
              </optgroup>
              <optgroup v-if="otherCities.length > 0" label="そのほかの市区町村">
                <option v-for="c in otherCities" :key="c.code" :value="c.code">{{ c.name }}</option>
              </optgroup>
            </template>
            <template v-else>
              <option v-for="c in cities ?? []" :key="c.code" :value="c.code">{{ c.name }}</option>
            </template>
          </select>
        </label>
        <p v-if="pref" class="muted">{{ routeDescription }}</p>
        <p v-else class="muted">都道府県を選ぶと、その中のルート沿いのホテル・旅館などを出します。</p>
      </template>
    </template>

    <p v-if="loading && tab !== 'search'" class="muted">探しています…</p>
    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p v-else-if="current && current.length === 0" class="notice notice-warn">見つかりませんでした。</p>

    <ul v-if="shown.length > 0" class="results">
      <li v-for="place in shown" :key="place.spotCode ?? `${place.lat},${place.lon}`" class="result">
        <div class="result-body">
          <p class="result-name">{{ place.name }}</p>
          <p class="muted">{{ [place.category, detailText(place)].filter(Boolean).join('・') }}</p>
          <a v-if="place.spotCode" class="result-link" :href="spotUrl(place.spotCode)" target="_blank" rel="noopener">NAVITIMEで詳しく見る↗</a>
        </div>
        <button v-if="isSelected(place)" type="button" class="btn btn-small" disabled>✓ 宿泊先に設定済み</button>
        <button v-else type="button" class="btn btn-small btn-primary" @click="choose(place)">ここに泊まる</button>
      </li>
    </ul>
    <button v-if="current && current.length > FIRST_COUNT && !showAll" type="button" class="btn btn-block" @click="showAll = true">
      もっと見る（あと{{ current.length - FIRST_COUNT }}件）
    </button>
  </BottomSheet>
</template>
