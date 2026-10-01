<script setup lang="ts">
// プランの作成・編集の画面（仕様書 §4.2）。initial を渡すと編集になる。
// 段階0「おおまかなプラン」→ 段階1「行きを決める」→ 段階2「帰りを決める」→ 遠征のまとめと保存。
// 後泊すると、帰りは「試合後の移動」→「翌日の帰り」の順に1区間ずつ決める。編集は最後の区間から始める
import { searchOptimalOrder, searchRoute } from '~/services/route'
import type { MapPoint, MapRoute } from '~/types/map'
import type { Leg, LegResult, Place, Plan, PlanForm, Stop } from '~/types/plan'
import { formatDuration, formatYen, nextSaturday, timeFromDate, timePart, todayLocal } from '~/utils/datetime'
import {
  buildLegs,
  conditionErrors,
  DEFAULT_HOTEL_ARRIVE_BY,
  DEFAULT_HOTEL_DEPART_AT,
  DEFAULT_STAY_MINUTES,
  defaultMatchEnd,
  defaultPlanName,
  hotelAfterOf,
  legIdsOf,
  legInputHash,
  legLabelOf,
  legStatus,
  optimizeBlocker,
  orderErrors,
  REST_INTERVAL_OPTIONS,
  shapeBetween,
  sideOf,
  STOP_KIND_ICONS,
  stopErrors,
  stopSearchOf,
  stopsAfterDroppingStay,
  stayRouteLeg,
  validateForm,
  type LegId,
} from '~/utils/legs'
import { formFromPlan, planFromForm } from '~/utils/planForm'
import { savePlan } from '~/utils/planStore'
import { suggestRests, type RestAdvice } from '~/utils/rest'

const props = defineProps<{ initial?: Plan }>()
const isEdit = computed(() => !!props.initial)

const form = reactive<PlanForm>(
  props.initial
    ? formFromPlan(props.initial)
    : {
        name: '',
        home: null,
        venue: null,
        matchDate: nextSaturday(todayLocal()),
        arriveBy: '12:00',
        matchEnd: '17:00',
        exitMinutes: 45,
        stops: { before: [], outbound: [], return: [], after: [] },
        restIntervalMinutes: 120,
        stayBefore: false,
        hotelBefore: null,
        hotelBeforeArriveBy: DEFAULT_HOTEL_ARRIVE_BY,
        stayAfter: false,
        sameHotel: true,
        hotelAfter: null,
        hotelAfterDepartAt: DEFAULT_HOTEL_DEPART_AT,
      },
)
for (const id of ['before', 'outbound', 'return', 'after']) form.stops[id] ??= []

// rough: おおまかなプラン / outbound: 行きを決める / return: 帰り（試合後に会場を出る区間）を決める / after: 翌日の帰りを決める
type Step = 'rough' | 'outbound' | 'return' | 'after'
const step = ref<Step>(props.initial ? (form.stayAfter ? 'after' : 'return') : 'rough')
const showMoreConditions = ref(false)

// 区間ごとの、いちばん新しい計算結果。今の条件のものとは限らない（legStatus で見分ける）
const results = ref<Record<string, LegResult>>({})
for (const leg of props.initial?.legs ?? []) {
  if (leg.result) results.value[leg.id] = leg.result
}
// 区間ごとの、計算の失敗。どの条件で失敗したかも持ち、条件を変えたら表示しない
const failures = ref<Record<string, { hash: string; message: string }>>({})
const calculatingLegs = ref<Record<string, boolean>>({})
const calculating = computed(() => Object.values(calculatingLegs.value).some(Boolean))
const attempted = ref(false)

// 行き・帰りは別々に確かめる（仕様書 §4.7）。条件がそろっている側の区間だけができる
const legs = computed(() => buildLegs(form))
const legOf = (id: string) => legs.value.find((leg) => leg.id === id)
const statuses = computed(() => Object.fromEntries(legs.value.map((leg) => [leg.id, legStatus(leg, results.value[leg.id])])))
const isCalculated = (id: string) => statuses.value[id] === 'calculated'
const isPastDate = computed(() => form.matchDate !== '' && form.matchDate < todayLocal())
const allIds = computed(() => legIdsOf(form))
const outboundIds = computed(() => allIds.value.filter((id) => sideOf(id) === 'outbound'))
const returnIds = computed(() => allIds.value.filter((id) => sideOf(id) === 'return'))
const legNumber = (id: LegId) => allIds.value.indexOf(id) + 1

const stopErrorsOf = (legId: string) => stopErrors(form, legId as LegId)

function failureOf(legId: string): string {
  const leg = legOf(legId)
  const failure = failures.value[legId]
  return leg && failure?.hash === legInputHash(leg) ? failure.message : ''
}

// 区間を、今の条件で計算し終わるまで検索する。計算中に条件が変わったら、最後の条件でもう一度だけ検索する
async function calculate(legId: string) {
  if (calculatingLegs.value[legId]) return
  calculatingLegs.value[legId] = true
  try {
    for (let i = 0; i < 2; i++) {
      const leg = legOf(legId)
      if (!leg || isCalculated(legId) || stopErrorsOf(legId).length > 0) return
      try {
        results.value[legId] = await searchRoute(leg)
        delete failures.value[legId]
      } catch (e) {
        failures.value[legId] = {
          hash: legInputHash(leg),
          message: e instanceof Error ? e.message : 'ルート検索に失敗しました。条件を変えてお試しください。',
        }
        return
      }
    }
  } finally {
    calculatingLegs.value[legId] = false
  }
}

// 段階0: おおまかなプラン。ほかの条件は初期値のまま、往復とも計算して行きへ進む
const roughErrors = computed(() => validateForm({ ...form, matchEnd: defaultMatchEnd(form.arriveBy, form.matchEnd), stops: {} }))

async function createRough() {
  attempted.value = true
  if (roughErrors.value.length > 0) return
  form.matchEnd = defaultMatchEnd(form.arriveBy, form.matchEnd)
  step.value = 'outbound'
  await Promise.all(legs.value.map((leg) => calculate(leg.id)))
}

const outboundReady = computed(() => outboundIds.value.every((id) => isCalculated(id)))

async function confirmOutbound() {
  if (!outboundReady.value) return
  step.value = 'return'
  await calculate('return')
}

// 後泊するとき、試合後の移動を確定して翌日の帰りへ進む
async function confirmReturn() {
  if (!isCalculated('return')) return
  step.value = 'after'
  await calculate('after')
}

// 立ち寄り先を変えたら、その区間だけを計算し直す（変更が止まってから 0.6 秒後。仕様書 §4.5・§4.7）
const stopTimers: Record<string, ReturnType<typeof setTimeout>> = {}
for (const legId of ['before', 'outbound', 'return', 'after']) {
  watch(
    () => JSON.stringify(form.stops[legId] ?? []),
    () => {
      if (step.value === 'rough') return
      clearTimeout(stopTimers[legId])
      stopTimers[legId] = setTimeout(() => calculate(legId), 600)
    },
  )
}
onBeforeUnmount(() => Object.values(stopTimers).forEach(clearTimeout))

// 宿泊の変更（泊まる・やめる・宿泊先を選ぶ・同じ宿泊先にする）は、立ち寄り先と同じく押した操作1回なので、
// 出発地か到着地が変わった区間だけをすぐに計算し直す。時刻の変更は「計算し直す」を押したときだけ（設計書 §5.3）
const endpointOf = (leg: Leg) => `${leg.from.lat},${leg.from.lon}>${leg.to.lat},${leg.to.lon}`

function changeStay(change: () => void) {
  const before = Object.fromEntries(legs.value.map((leg) => [leg.id, endpointOf(leg)]))
  change()
  for (const leg of legs.value) {
    if (before[leg.id] !== endpointOf(leg)) calculate(leg.id)
  }
}

function startStayBefore() {
  changeStay(() => (form.stayBefore = true))
}

// 前泊をやめると、前日の区間の立ち寄り先は当日の行きの先頭へ移す（仕様書 §4.4）
function dropStayBefore() {
  changeStay(() => {
    form.stops = stopsAfterDroppingStay(form.stops, 'before')
    form.stayBefore = false
  })
}

function setStayAfter(stay: boolean) {
  if (stay === form.stayAfter) return
  changeStay(() => {
    if (!stay) form.stops = stopsAfterDroppingStay(form.stops, 'after')
    form.stayAfter = stay
  })
  if (!stay && step.value === 'after') step.value = 'return'
}

function setSameHotel(same: boolean) {
  changeStay(() => (form.sameHotel = same))
}

// 宿泊先を選ぶ画面
const hotelPicker = ref<'before' | 'after' | null>(null)

function onHotelSelect(place: Place) {
  changeStay(() => {
    if (hotelPicker.value === 'before') {
      form.hotelBefore = place
    } else {
      form.hotelAfter = place
      form.sameHotel = false // 試合後の宿泊先を別に選んだら、前日と同じ宿泊先にはしない（仕様書 §4.4）
    }
  })
}

// 休憩の提案（仕様書 §4.8）
const advice = computed<Record<string, RestAdvice>>(() =>
  Object.fromEntries(
    legs.value.map((leg) => {
      const result = results.value[leg.id]
      return [leg.id, result && isCalculated(leg.id) ? suggestRests(result, form.restIntervalMinutes) : { suggestions: [], longStretches: [] }]
    }),
  ),
)

// 「ここで30分休憩する」: その SA/PA を、有料道路上の「休憩」の立ち寄り先として、ルート上の順番の位置に入れる
function addRest(legId: string, index: number) {
  const area = advice.value[legId]?.suggestions[index]
  const stops = form.stops[legId] ?? []
  if (!area || calculatingLegs.value[legId] || stops.some((s) => s.place.lat === area.lat && s.place.lon === area.lon)) return
  const visits = results.value[legId]?.stopVisits ?? []
  const position = visits.filter((visit) => visit.arriveAt < area.passAt).length
  const rest: Stop = {
    place: { name: area.name, lat: area.lat, lon: area.lon },
    kind: 'rest',
    stayMinutes: DEFAULT_STAY_MINUTES.rest,
    tollRoad: true,
  }
  form.stops[legId] = [...stops.slice(0, position), rest, ...stops.slice(position)]
}

// 寄る順番を最適にする（仕様書にない追加。設計書 §5.3）。1回だけ検索し、並べ替えた順番での結果として使う。
// 並べ替える前の順番と計算結果を覚えておき、並べ替えたままの間だけ「元の順に戻す」を出す
const reorders = ref<Record<string, { before: Stop[]; after: Stop[]; beforeResult?: LegResult }>>({})
const optimizeNotes = ref<Record<string, string>>({})
const sameStops = (a: Stop[], b: Stop[]) => JSON.stringify(a) === JSON.stringify(b)

function blockerOf(legId: string): string {
  const stops = form.stops[legId] ?? []
  return stopErrorsOf(legId)[0] ?? optimizeBlocker(stops)
}

function canRevert(legId: string): boolean {
  const reorder = reorders.value[legId]
  return !!reorder && sameStops(form.stops[legId] ?? [], reorder.after)
}

async function optimize(legId: string) {
  const leg = legOf(legId)
  if (!leg || calculatingLegs.value[legId] || blockerOf(legId) !== '') return
  clearTimeout(stopTimers[legId])
  calculatingLegs.value[legId] = true
  delete optimizeNotes.value[legId]
  const before = leg.stops
  const beforeResult = results.value[legId]
  try {
    const { stops, result } = await searchOptimalOrder(leg)
    // 検索している間に立ち寄り先を変えていたら、その変更を残す（並べ替えない）
    if (!sameStops(form.stops[legId] ?? [], before)) return
    results.value[legId] = result
    if (sameStops(stops, before)) {
      optimizeNotes.value[legId] = '今の順番が最適でした。'
      return
    }
    reorders.value[legId] = { before, after: stops, beforeResult }
    optimizeNotes.value[legId] = '移動が短くなる順番に並べ替えました。'
    form.stops[legId] = stops
  } catch (e) {
    optimizeNotes.value[legId] = e instanceof Error ? e.message : '寄る順番を最適にできませんでした。'
  } finally {
    calculatingLegs.value[legId] = false
  }
}

// 元の順に戻す。並べ替える前の結果を戻すので、計算し直しでも呼ばない（前の結果が今の条件のものなら）
function revertOrder(legId: string) {
  const reorder = reorders.value[legId]
  if (!reorder || !canRevert(legId)) return
  if (reorder.beforeResult) results.value[legId] = reorder.beforeResult
  form.stops[legId] = reorder.before
  delete reorders.value[legId]
  delete optimizeNotes.value[legId]
}

// 立ち寄り先を追加する画面。おすすめは区間ごとに「その日に向かう場所」の周辺で探す（仕様書 §4.5）
const pickerLeg = ref<LegId | null>(null)
const pickerSearch = computed(() => (pickerLeg.value ? stopSearchOf(form, pickerLeg.value) : null))

// 通る都道府県を調べるルートの形（仕様書 §4.4・§4.5）。計算済みの結果があれば使い、なければルート検索する（同じ条件なら保存した結果を使う）
async function routeShapeOf(leg: Leg | null): Promise<[number, number][]> {
  if (!leg) throw new Error('出発地・会場・時刻を入れると、通る都道府県を調べられます。')
  return shapeBetween(Object.values(results.value), leg.from, leg.to) ?? (await searchRoute(leg)).shape
}
const loadStopRoute = () => routeShapeOf(pickerLeg.value ? (legOf(pickerLeg.value) ?? null) : null)
const loadHotelRoute = () => routeShapeOf(hotelPicker.value ? stayRouteLeg(form, hotelPicker.value) : null)

// 段階のタブ。後泊すると ① 行き ② 試合後の移動 ③ 翌日の帰り（仕様書 §4.2）
const tabs = computed<{ step: Step; label: string }[]>(() => [
  { step: 'outbound', label: '行き' },
  ...(form.stayAfter
    ? [
        { step: 'return' as const, label: '試合後の移動' },
        { step: 'after' as const, label: '翌日の帰り' },
      ]
    : [{ step: 'return' as const, label: '帰り' }]),
])
const stepIndex = (s: Step) => tabs.value.findIndex((t) => t.step === s)
const lastStep = computed(() => tabs.value[tabs.value.length - 1]!.step)
const NUMBERS = ['①', '②', '③']

// 要約
const outboundSummary = computed(() => {
  if (!form.home || !form.venue) return ''
  const [, mo = '', d = ''] = form.matchDate.split('-')
  return `${form.home.name} → ${form.venue.name} / ${Number(mo)}月${Number(d)}日・${form.arriveBy} 着・${form.stayBefore ? '前日に出発（前泊）' : '当日に出発'}`
})

const returnSummary = computed(() => {
  const stay = form.stayAfter ? `後泊（${hotelAfterOf(form)?.name ?? '宿泊先 未設定'}）` : 'その日に帰る'
  return `試合終了 ${form.matchEnd}・退場 ${form.exitMinutes}分・${stay}`
})

// 宿泊先が未設定のときの表示（仕様書 §4.6）
const UNSET_HOTEL = '宿泊先（未設定）'

// 区間の出発地と到着地の名前。区間ができていない（宿泊先が未設定など）ときにも出せるよう、入力から決める
function legEnds(id: LegId): [string, string] {
  const home = form.home?.name ?? '出発地'
  const venue = form.venue?.name ?? '会場'
  const before = form.hotelBefore?.name ?? UNSET_HOTEL
  const after = hotelAfterOf(form)?.name ?? UNSET_HOTEL
  if (id === 'before') return [home, before]
  if (id === 'outbound') return [form.stayBefore ? before : home, venue]
  if (id === 'return') return [venue, form.stayAfter ? after : home]
  return [after, home]
}

function legLine(legId: string): string {
  const leg = legOf(legId)
  const result = results.value[legId]
  if (!leg || !result) return '—'
  return `${timeFromDate(result.departAt, form.matchDate)} ${leg.from.name} を出発 → ${timeFromDate(result.arriveAt, form.matchDate)} ${leg.to.name} に到着`
}

// 確定した行きを1行にたたむ（最初の出発時刻 → 会場の到着時刻）
const outboundLine = computed(() => {
  const first = results.value[outboundIds.value[0] ?? '']
  const last = results.value.outbound
  if (!first || !last) return '—'
  return `${timeFromDate(first.departAt, form.matchDate)} ${legEnds(outboundIds.value[0]!)[0]} を出発 → ${timeFromDate(last.arriveAt, form.matchDate)} ${form.venue?.name} に到着`
})

// 区間の時刻（仮）と、出せないときの理由
function previewOf(id: LegId): { text: string; reason: string } {
  if (!legOf(id)) return { text: '—', reason: conditionErrors(form, sideOf(id))[0] ?? '' }
  if (!isCalculated(id)) return { text: '—', reason: calculatingLegs.value[id] ? '計算しています…' : '今の条件でまだ計算していません。' }
  return { text: legLine(id), reason: '' }
}

// 区間ができていないときに、カードの代わりに出す理由
const missingReason = (id: LegId) => conditionErrors(form, sideOf(id))[0] ?? ''

// いまの段階で出す区間のカード
const stepIds = computed<LegId[]>(() => (step.value === 'outbound' ? outboundIds.value : step.value === 'after' ? ['after'] : ['return']))

const allCalculated = computed(() => allIds.value.every((id) => isCalculated(id)))
// 続けて走る区間の時刻の前後（宿に着く前に宿を出る、など）。誤りがあると保存できない
const orderErrorList = computed(() => orderErrors(legs.value, results.value))

const totals = computed(() => {
  if (!allCalculated.value) return null
  const list = legs.value.map((leg) => results.value[leg.id]!)
  return {
    driveMinutes: list.reduce((sum, r) => sum + r.driveMinutes, 0),
    tollYen: list.reduce((sum, r) => sum + r.tollYen, 0),
  }
})

const placeholderName = computed(() => (form.venue ? defaultPlanName(form.venue.name, form.matchDate) : ''))

// 保存できない理由（仕様書 §4.10）。保存できるときは空
const saveBlocker = computed(() => {
  if (calculating.value) return '計算し直しています。終わると保存できます。'
  const errors = validateForm(form)
  if (errors.length > 0) return errors[0]!
  if (legs.value.some((leg) => failureOf(leg.id))) return 'ルートを計算できなかった区間があります。区間のカードの案内に従って、もう一度計算してください。'
  if (!allCalculated.value) return '今の条件で計算し終わると保存できます。'
  if (orderErrorList.value.length > 0) return orderErrorList.value[0]!
  return ''
})

const saveError = ref('')
const saved = ref(false)

async function save() {
  if (saveBlocker.value !== '' || !form.home || !form.venue) return
  const plan = planFromForm(
    form,
    legs.value.map((leg) => ({ ...leg, result: results.value[leg.id] })),
    {
      id: props.initial?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      now: new Date().toISOString(),
      createdAt: props.initial?.createdAt,
    },
  )
  if (!savePlan(plan)) {
    saveError.value = '保存できませんでした。ブラウザの保存領域がいっぱいか、使えない設定になっています。'
    return
  }
  saved.value = true
  await navigateTo(`/plans/${plan.id}`)
}

// 保存せずに離れるときは、離れる前に確かめる（仕様書 §4.10）
const initialSnapshot = JSON.stringify(form)
const dirty = computed(() => !saved.value && JSON.stringify(form) !== initialSnapshot)
const leaveMessage = computed(() =>
  isEdit.value
    ? '変更はまだ保存していません。変更を捨ててページを移りますか？'
    : 'プランはまだ保存していません。入力した内容を捨ててページを移りますか？',
)

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm(leaveMessage.value)) return false
})

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`

// 地図（仕様書 §4.11）: 段階0はプラン全体、段階1は行き、段階2はいま決めている区間を描く
const shownLegs = computed(() =>
  legs.value.filter((leg) => (step.value === 'rough' || stepIds.value.includes(leg.id as LegId)) && results.value[leg.id] && isCalculated(leg.id)),
)
const hotels = computed(() => {
  const list: Place[] = []
  if (form.stayBefore && form.hotelBefore) list.push(form.hotelBefore)
  const after = hotelAfterOf(form)
  if (after && !list.some((h) => h.lat === after.lat && h.lon === after.lon)) list.push(after)
  return list
})
// ルートの線は、計算し直している間や、宿泊先を選んでいる間（区間をまだ組み立てられない）も消さず、
// その区間のいちばん新しい計算結果（例: 前泊にする前の自宅 → 会場）を描いたままにする（本人の修正、2026-10-01）
const mapRoutes = computed<MapRoute[]>(() =>
  allIds.value
    .filter((id) => (step.value === 'rough' || stepIds.value.includes(id)) && results.value[id])
    .map((id) => ({ id, direction: sideOf(id), shape: results.value[id]!.shape })),
)
const mapPoints = computed<MapPoint[]>(() => [
  ...(form.home ? [{ kind: 'home' as const, place: form.home }] : []),
  ...(form.venue ? [{ kind: 'venue' as const, place: form.venue }] : []),
  ...hotels.value.map((place) => ({ kind: 'hotel' as const, place })),
  ...shownLegs.value.flatMap((leg) =>
    leg.stops.map((stop, i) => ({ kind: 'stop' as const, place: stop.place, icon: STOP_KIND_ICONS[stop.kind], label: String(i + 1) })),
  ),
  ...(step.value === 'rough'
    ? []
    : shownLegs.value.flatMap((leg) =>
        (advice.value[leg.id]?.suggestions ?? []).map((area, i) => ({
          kind: 'rest' as const,
          id: `${leg.id}:${i}`,
          place: { name: area.name, lat: area.lat, lon: area.lon },
          label: `休${i + 1}`,
          note: `休憩候補（${area.kind}）・${timePart(area.passAt)}頃`,
        })),
      )),
])

function onRestClick(id: string) {
  const [legId = '', index = ''] = id.split(':')
  addRest(legId, Number(index))
}
</script>

<template>
  <SplitLayout>
    <h1 class="page-title">{{ isEdit ? 'プランを編集する' : 'プランを作る' }}</h1>

    <div class="stack">
      <!-- 段階0: おおまかなプラン -->
      <section v-if="step === 'rough'" class="card stack">
        <h2 class="step-title">おおまかなプラン</h2>
        <PlaceField v-model="form.home" label="出発地（自宅など）" placeholder="例: 新潟駅" />
        <PlaceField v-model="form.venue" label="到着地（会場）" placeholder="例: デンカビッグスワンスタジアム" venue-only />
        <div class="row">
          <label class="field">
            <span class="field-label">行く日（試合日）</span>
            <input v-model="form.matchDate" class="input" type="date" />
          </label>
          <label class="field">
            <span class="field-label">到着予定時刻</span>
            <input v-model="form.arriveBy" class="input" type="time" />
          </label>
        </div>
        <p v-if="isPastDate" class="notice notice-warn">試合日が過去の日付になっています。過去の日時では、時刻の計算が実際と合わないことがあります。</p>

        <div v-if="attempted && roughErrors.length > 0" class="notice notice-error" role="alert">
          <ul>
            <li v-for="message in roughErrors" :key="message">{{ message }}</li>
          </ul>
        </div>
        <button type="button" class="btn btn-primary btn-block" :disabled="calculating" @click="createRough">おおまかなプランを作成</button>
        <p class="muted">行きと帰りのルートを1回ずつ検索します（NAVITIME の無料枠を使います）。試合の終了時刻や前泊・後泊は、このあと決められます。</p>
      </section>

      <template v-else>
        <!-- 段階のタブ -->
        <ol class="step-tabs" :style="{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }" aria-label="段階">
          <li v-for="(t, i) in tabs" :key="t.step" :class="{ current: step === t.step, done: stepIndex(step) > i }">
            {{ stepIndex(step) > i ? '✓' : NUMBERS[i] }} {{ t.label }}
          </li>
        </ol>

        <p class="notice notice-info">
          渋滞を考慮していない時刻です。混みそうな日は、余裕を持って出発してください。高速料金は ETC・普通車の料金で、休日や深夜の割引は反映されないことがあります。
        </p>

        <!-- 段階1: 行きを決める -->
        <section v-if="step === 'outbound'" class="stack">
          <div class="card summary-card">
            <p class="summary-text">{{ outboundSummary }}</p>
            <button type="button" class="btn btn-small" @click="showMoreConditions = !showMoreConditions">
              {{ showMoreConditions ? '閉じる' : 'ほかの条件を変える' }}
            </button>
            <div v-if="showMoreConditions" class="more stack">
              <PlaceField v-model="form.home" label="出発地（自宅など）" placeholder="例: 新潟駅" />
              <PlaceField v-model="form.venue" label="到着地（会場）" placeholder="例: デンカビッグスワンスタジアム" venue-only />
              <label class="field">
                <span class="field-label">行く日（試合日）</span>
                <input v-model="form.matchDate" class="input" type="date" />
              </label>
              <label class="field">
                <span class="field-label">休憩間隔</span>
                <select v-model.number="form.restIntervalMinutes" class="input input-auto">
                  <option v-for="m in REST_INTERVAL_OPTIONS" :key="m" :value="m">{{ formatDuration(m) }}</option>
                </select>
              </label>
            </div>
          </div>

          <!-- 前泊（仕様書 §4.4）。欄は常に出す -->
          <div class="card stay">
            <button v-if="!form.stayBefore" type="button" class="btn btn-block" @click="startStayBefore">＋前日に泊まる（前日の宿泊先を追加）</button>
            <template v-else>
              <p class="stay-title">前泊</p>
              <div class="hotel">
                <span class="field-label">前日の宿泊先</span>
                <span class="hotel-name" :class="{ unset: !form.hotelBefore }">
                  {{ form.hotelBefore?.name ?? UNSET_HOTEL }}
                  <a v-if="form.hotelBefore?.spotCode" :href="spotUrl(form.hotelBefore.spotCode)" target="_blank" rel="noopener">詳細↗</a>
                </span>
                <button type="button" class="btn btn-small btn-primary" @click="hotelPicker = 'before'">宿泊先を選ぶ</button>
              </div>
              <button type="button" class="btn btn-small btn-danger" @click="dropStayBefore">✕ 前泊をやめる</button>
            </template>
          </div>
        </section>

        <!-- 段階2: 帰りを決める -->
        <section v-else class="stack">
          <div class="card folded">
            <p class="folded-text"><strong>行き</strong> {{ outboundLine }}</p>
            <button type="button" class="btn btn-small" @click="step = 'outbound'">行きを変える</button>
          </div>
          <p class="return-summary">{{ returnSummary }}</p>

          <!-- 後泊（仕様書 §4.4）。欄は常に出す -->
          <div class="card stay">
            <div class="choices" role="radiogroup" aria-label="試合のあと">
              <label><input type="radio" :checked="!form.stayAfter" @change="setStayAfter(false)" /> その日に帰る</label>
              <label><input type="radio" :checked="form.stayAfter" @change="setStayAfter(true)" /> 試合後に泊まる（後泊）</label>
            </div>
            <template v-if="form.stayAfter">
              <label v-if="form.stayBefore" class="check">
                <input type="checkbox" :checked="form.sameHotel" @change="setSameHotel(($event.target as HTMLInputElement).checked)" />
                前日と同じ宿泊先に泊まる
              </label>
              <div v-if="!(form.stayBefore && form.sameHotel)" class="hotel">
                <span class="field-label">試合後の宿泊先</span>
                <span class="hotel-name" :class="{ unset: !form.hotelAfter }">
                  {{ form.hotelAfter?.name ?? UNSET_HOTEL }}
                  <a v-if="form.hotelAfter?.spotCode" :href="spotUrl(form.hotelAfter.spotCode)" target="_blank" rel="noopener">詳細↗</a>
                </span>
                <button type="button" class="btn btn-small btn-primary" @click="hotelPicker = 'after'">宿泊先を選ぶ</button>
              </div>
            </template>
          </div>

          <!-- 後泊で翌日の帰りを決めているときは、試合後の移動を1行にたたむ -->
          <div v-if="step === 'after'" class="card folded">
            <p class="folded-text"><strong>試合後の移動</strong> {{ legLine('return') }}</p>
            <button type="button" class="btn btn-small" @click="step = 'return'">変える</button>
          </div>
        </section>

        <!-- 区間のカード（仕様書 §4.6） -->
        <template v-for="id in stepIds" :key="id">
          <LegCard
            v-if="legOf(id)"
            v-model:stops="form.stops[id]!"
            :number="legNumber(id)"
            :leg="legOf(id)!"
            :result="results[id]"
            :status="statuses[id]!"
            :loading="calculatingLegs[id]"
            :error="failureOf(id)"
            :suggestions="advice[id]?.suggestions ?? []"
            :long-stretches="advice[id]?.longStretches ?? []"
            :optimize-blocker="blockerOf(id)"
            :optimize-note="optimizeNotes[id]"
            :can-revert-order="canRevert(id)"
            @open-add="pickerLeg = id"
            @add-rest="addRest(id, $event)"
            @recalculate="calculate(id)"
            @optimize="optimize(id)"
            @revert-order="revertOrder(id)"
          >
            <template #time-input><LegTimeInput :leg-id="id" :form="form" /></template>
          </LegCard>
          <!-- 宿泊先が未設定などで区間ができていないときも、時刻の欄は出して直せるようにする -->
          <section v-else class="card stack pending-leg">
            <h3 class="pending-title">
              <span class="leg-number">{{ legNumber(id) }}</span>
              <span class="leg-label">{{ legLabelOf(form, id) }}</span>
              {{ legEnds(id)[0] }} → {{ legEnds(id)[1] }}
            </h3>
            <LegTimeInput :leg-id="id" :form="form" />
            <p class="notice notice-warn">{{ missingReason(id) }}</p>
          </section>
          <div v-if="stopErrorsOf(id).length > 0" class="notice notice-error" role="alert">
            <ul>
              <li v-for="message in stopErrorsOf(id)" :key="message">{{ message }}</li>
            </ul>
          </div>
        </template>

        <div v-if="orderErrorList.length > 0" class="notice notice-error" role="alert">
          <ul>
            <li v-for="message in orderErrorList" :key="message">{{ message }}</li>
          </ul>
        </div>

        <!-- 行きの確定と「帰り（仮）」 -->
        <template v-if="step === 'outbound'">
          <button type="button" class="btn btn-primary btn-block" :disabled="!outboundReady || calculating" @click="confirmOutbound">
            行きを確定して、{{ tabs[1]!.label }}を決める
          </button>
          <p v-if="!outboundReady" class="muted">行きの区間をすべて今の条件で計算し終わると押せます。</p>

          <div class="preview">
            <p class="preview-title">帰り（仮）</p>
            <div v-for="id in returnIds" :key="id">
              <p><strong>{{ legLabelOf(form, id) }}</strong> {{ previewOf(id).text }}</p>
              <p v-if="previewOf(id).reason" class="muted">{{ previewOf(id).reason }}</p>
            </div>
          </div>
        </template>

        <!-- 後泊するとき: 試合後の移動を確定して、翌日の帰りへ -->
        <template v-else-if="step === 'return' && form.stayAfter">
          <button type="button" class="btn btn-primary btn-block" :disabled="!isCalculated('return') || calculating" @click="confirmReturn">
            試合後の移動を確定して、翌日の帰りを決める
          </button>
          <p v-if="!isCalculated('return')" class="muted">試合後の移動を今の条件で計算し終わると押せます。</p>
          <div class="preview">
            <p><strong>{{ legLabelOf(form, 'after') }}</strong> {{ previewOf('after').text }}</p>
            <p class="muted">前の段階を確定すると、立ち寄り先などを決められます。</p>
          </div>
        </template>

        <!-- 遠征のまとめと保存（仕様書 §4.10）。最後の区間まで進んだら出す -->
        <section v-if="step === lastStep" class="card stack save">
          <h2 class="step-title">遠征のまとめと保存</h2>
          <p v-if="totals" class="totals">
            運転時間 <strong>{{ formatDuration(totals.driveMinutes) }}</strong>
            <template v-if="totals.tollYen > 0">・高速料金（ETC） <strong>{{ formatYen(totals.tollYen) }}</strong></template>
          </p>
          <label class="field">
            <span class="field-label">プラン名（空欄なら「{{ placeholderName }}」）</span>
            <input v-model="form.name" class="input" type="text" maxlength="60" :placeholder="placeholderName" />
          </label>
          <button type="button" class="btn btn-primary btn-block" :disabled="saveBlocker !== ''" @click="save">
            {{ isEdit ? '変更を上書き保存する' : 'このプランを保存する' }}
          </button>
          <p v-if="saveBlocker" class="muted">{{ saveBlocker }}</p>
          <p v-if="saveError" class="notice notice-error" role="alert">{{ saveError }}</p>
        </section>
      </template>

      <UsageNote />
    </div>

    <StopPicker
      v-if="pickerLeg && legOf(pickerLeg) && pickerSearch?.center"
      v-model:stops="form.stops[pickerLeg]!"
      :leg-label="legLabelOf(form, pickerLeg)"
      :center="pickerSearch.center"
      :default-position="pickerSearch.position"
      :load-route="loadStopRoute"
      @close="pickerLeg = null"
    />

    <HotelPicker
      v-if="hotelPicker && form.venue"
      :title="hotelPicker === 'before' ? '前日の宿泊先を選ぶ' : '試合後の宿泊先を選ぶ'"
      :venue="form.venue"
      :selected="hotelPicker === 'before' ? form.hotelBefore : form.hotelAfter"
      :load-route="loadHotelRoute"
      @select="onHotelSelect"
      @close="hotelPicker = null"
    />

    <template #map>
      <RouteMap :routes="mapRoutes" :points="mapPoints" @rest-click="onRestClick" />
    </template>
  </SplitLayout>
</template>

<style scoped>
.step-title {
  font-size: 1.15rem;
}

.step-tabs {
  display: grid;
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
}

.step-tabs li {
  padding: 8px;
  text-align: center;
  font-weight: 700;
  color: var(--color-primary-dark);
  background: var(--color-surface);
}

.step-tabs li + li {
  border-left: 1px solid var(--color-primary);
}

.step-tabs .current {
  background: var(--color-primary);
  color: #fff;
}

.step-tabs .done {
  background: var(--color-primary-soft);
}

.summary-card > * + * {
  margin-top: 8px;
}

.summary-text {
  font-weight: 600;
}

.more {
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.stay > * + * {
  margin-top: 8px;
}

.stay-title {
  font-weight: 700;
}

.hotel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hotel .field-label {
  width: 100%;
}

.hotel-name {
  flex: 1;
  min-width: 140px;
  font-weight: 600;
}

.hotel-name a {
  margin-left: 4px;
  font-size: 0.875rem;
  font-weight: 400;
}

.hotel-name.unset {
  color: var(--color-muted);
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  font-weight: 600;
}

.choices label,
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.folded {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
}

.folded-text {
  font-size: 0.95rem;
  line-height: 1.5;
}

.return-summary {
  font-weight: 600;
}

.pending-leg {
  border-style: dashed;
}

.pending-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
}

.leg-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-text);
  border-radius: 50%;
  font-size: 0.85rem;
}

.leg-label {
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-text);
  color: #fff;
  font-size: 0.9rem;
}

.preview {
  padding: 10px 14px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  font-size: 0.9rem;
}

.preview-title {
  font-weight: 700;
  color: var(--color-return);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input-auto {
  width: auto;
}

.save {
  border-color: var(--color-primary);
  border-width: 2px;
}

.totals {
  font-size: 1.05rem;
}
</style>
