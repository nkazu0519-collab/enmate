<script setup lang="ts">
// プランの作成・編集の画面（仕様書 §4.2）。initial を渡すと編集になる。
// 段階0「おおまかなプラン」→ 段階1「行きを決める」→ 段階2「帰りを決める」→ 遠征のまとめと保存。編集は段階2から始める
import { searchOptimalOrder, searchRoute } from '~/services/route'
import type { MapPoint, MapRoute } from '~/types/map'
import type { Leg, LegResult, Plan, PlanForm, Stop } from '~/types/plan'
import { formatDuration, formatYen, nextSaturday, timeFromDate, timePart, todayLocal } from '~/utils/datetime'
import {
  buildLegs,
  DEFAULT_STAY_MINUTES,
  defaultMatchEnd,
  defaultPlanName,
  legInputHash,
  legStatus,
  MAX_EXIT_MINUTES,
  optimizeBlocker,
  REST_INTERVAL_OPTIONS,
  STOP_KIND_ICONS,
  validateForm,
} from '~/utils/legs'
import { savePlan } from '~/utils/planStore'
import { suggestRests, type RestAdvice } from '~/utils/rest'

const props = defineProps<{ initial?: Plan }>()
const isEdit = computed(() => !!props.initial)

const form = reactive<PlanForm>(
  props.initial
    ? {
        name: props.initial.name,
        home: props.initial.home,
        venue: props.initial.venue,
        matchDate: props.initial.matchDate,
        arriveBy: props.initial.arriveBy,
        matchEnd: props.initial.matchEnd,
        exitMinutes: props.initial.exitMinutes,
        stops: Object.fromEntries(props.initial.legs.map((leg) => [leg.id, leg.stops])),
        restIntervalMinutes: props.initial.restIntervalMinutes,
      }
    : {
        name: '',
        home: null,
        venue: null,
        matchDate: nextSaturday(todayLocal()),
        arriveBy: '12:00',
        matchEnd: '17:00',
        exitMinutes: 45,
        stops: { outbound: [], return: [] },
        restIntervalMinutes: 120,
      },
)

type Step = 'rough' | 'outbound' | 'return'
const step = ref<Step>(props.initial ? 'return' : 'rough')
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

// 立ち寄り先を除いた条件の誤り。立ち寄り先は区間ごとに確かめる
const baseErrors = computed(() => validateForm({ ...form, stops: {} }))
const legs = computed(() => (baseErrors.value.length === 0 ? buildLegs(form) : []))
const legOf = (id: string) => legs.value.find((leg) => leg.id === id)
const statuses = computed(() => Object.fromEntries(legs.value.map((leg) => [leg.id, legStatus(leg, results.value[leg.id])])))
const isCalculated = (id: string) => statuses.value[id] === 'calculated'
const isPastDate = computed(() => form.matchDate !== '' && form.matchDate < todayLocal())

function stopErrorsOf(legId: string): string[] {
  return validateForm({ ...form, stops: { [legId]: form.stops[legId] ?? [] } }).filter((e) => !baseErrors.value.includes(e))
}

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
  await calculate('outbound')
  await calculate('return')
}

async function confirmOutbound() {
  if (!isCalculated('outbound')) return
  step.value = 'return'
  await calculate('return')
}

// 立ち寄り先を変えたら、その区間だけを計算し直す（変更が止まってから 0.6 秒後。仕様書 §4.5・§4.7）
const stopTimers: Record<string, ReturnType<typeof setTimeout>> = {}
for (const legId of ['outbound', 'return']) {
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

// 立ち寄り先を追加する画面
const pickerLeg = ref<string | null>(null)

// 要約
const outboundSummary = computed(() => {
  if (!form.home || !form.venue) return ''
  const [, mo = '', d = ''] = form.matchDate.split('-')
  return `${form.home.name} → ${form.venue.name} / ${Number(mo)}月${Number(d)}日・${form.arriveBy} 着・当日に出発`
})

function legLine(legId: string): string {
  const leg = legOf(legId)
  const result = results.value[legId]
  if (!leg || !result) return '—'
  return `${timeFromDate(result.departAt, form.matchDate)} ${leg.from.name} を出発 → ${timeFromDate(result.arriveAt, form.matchDate)} ${leg.to.name} に到着`
}

// 行きの下に出す「帰り（仮）」
const returnPreview = computed(() => {
  if (!legOf('return')) return { text: '—', reason: '試合の終了時刻が、到着予定時刻より後になっていません。' }
  if (!isCalculated('return')) return { text: '—', reason: calculatingLegs.value.return ? '計算しています…' : '今の条件でまだ計算していません。' }
  return { text: legLine('return'), reason: '' }
})

const allCalculated = computed(() => legs.value.length > 0 && legs.value.every((leg) => isCalculated(leg.id)))

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
  if (legs.value.some((leg) => failureOf(leg.id))) return 'ルートを計算できなかった区間があります。条件を変えてお試しください。'
  if (!allCalculated.value) return '今の条件で計算し終わると保存できます。'
  return ''
})

const saveError = ref('')
const saved = ref(false)

async function save() {
  if (saveBlocker.value !== '' || !form.home || !form.venue) return
  const now = new Date().toISOString()
  const plan: Plan = {
    id: props.initial?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: form.name.trim() || defaultPlanName(form.venue.name, form.matchDate),
    home: form.home,
    venue: form.venue,
    matchDate: form.matchDate,
    arriveBy: form.arriveBy,
    matchEnd: form.matchEnd,
    exitMinutes: form.exitMinutes,
    restIntervalMinutes: form.restIntervalMinutes,
    hotelsBefore: props.initial?.hotelsBefore ?? [],
    hotelsAfter: props.initial?.hotelsAfter ?? [],
    legs: legs.value.map((leg) => ({ ...leg, result: results.value[leg.id] })),
    createdAt: props.initial?.createdAt ?? now,
    updatedAt: now,
    schemaVersion: 1,
  }
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

// 地図（仕様書 §4.11）: 段階0はプラン全体、段階1は行き、段階2は帰りを描く
const shownLegs = computed(() =>
  legs.value.filter((leg) => (step.value === 'rough' || leg.id === step.value) && results.value[leg.id] && isCalculated(leg.id)),
)
const mapRoutes = computed<MapRoute[]>(() =>
  shownLegs.value.map((leg) => ({
    id: leg.id,
    direction: leg.timeRule === 'arriveBy' ? 'outbound' : 'return',
    shape: results.value[leg.id]!.shape,
  })),
)
const mapPoints = computed<MapPoint[]>(() => [
  ...(form.home ? [{ kind: 'home' as const, place: form.home }] : []),
  ...(form.venue ? [{ kind: 'venue' as const, place: form.venue }] : []),
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
    <h1 class="page-title">{{ isEdit ? 'プランを編集する' : '日帰りのプランを作る' }}</h1>

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
        <p class="muted">行きと帰りのルートを1回ずつ検索します（NAVITIME の無料枠を使います）。試合の終了時刻などは、このあと帰りのカードで変えられます。</p>
      </section>

      <template v-else>
        <!-- 段階のタブ -->
        <ol class="step-tabs" aria-label="段階">
          <li :class="{ current: step === 'outbound', done: step === 'return' }">{{ step === 'return' ? '✓' : '①' }} 行き</li>
          <li :class="{ current: step === 'return' }">② 帰り</li>
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
              <div v-if="baseErrors.length > 0" class="notice notice-error" role="alert">
                <ul>
                  <li v-for="message in baseErrors" :key="message">{{ message }}</li>
                </ul>
              </div>
            </div>
          </div>

          <LegCard
            v-if="legOf('outbound')"
            v-model:stops="form.stops.outbound!"
            :number="1"
            :leg="legOf('outbound')!"
            :result="results.outbound"
            :status="statuses.outbound!"
            :loading="calculatingLegs.outbound"
            :error="failureOf('outbound')"
            :suggestions="advice.outbound?.suggestions ?? []"
            :long-stretches="advice.outbound?.longStretches ?? []"
            @open-add="pickerLeg = 'outbound'"
            @add-rest="addRest('outbound', $event)"
            @recalculate="calculate('outbound')"
            :optimize-blocker="blockerOf('outbound')"
            :optimize-note="optimizeNotes.outbound"
            :can-revert-order="canRevert('outbound')"
            @optimize="optimize('outbound')"
            @revert-order="revertOrder('outbound')"
          >
            <template #time-input>
              <label class="field">
                <span class="field-label">到着予定時刻（会場に着く時刻）</span>
                <input v-model="form.arriveBy" class="input input-time" type="time" />
              </label>
            </template>
          </LegCard>
          <div v-if="stopErrorsOf('outbound').length > 0" class="notice notice-error" role="alert">
            <ul>
              <li v-for="message in stopErrorsOf('outbound')" :key="message">{{ message }}</li>
            </ul>
          </div>

          <button type="button" class="btn btn-primary btn-block" :disabled="!isCalculated('outbound') || calculating" @click="confirmOutbound">
            行きを確定して、帰りを決める
          </button>
          <p v-if="!isCalculated('outbound')" class="muted">行きを今の条件で計算し終わると押せます。</p>

          <div class="preview">
            <p class="preview-title">帰り（仮）</p>
            <p>{{ returnPreview.text }}</p>
            <p v-if="returnPreview.reason" class="muted">{{ returnPreview.reason }}</p>
          </div>
        </section>

        <!-- 段階2: 帰りを決める -->
        <section v-else class="stack">
          <div class="card folded">
            <p class="folded-text"><strong>行き</strong> {{ legLine('outbound') }}</p>
            <button type="button" class="btn btn-small" @click="step = 'outbound'">行きを変える</button>
          </div>
          <p class="return-summary">試合終了 {{ form.matchEnd }}・退場 {{ form.exitMinutes }}分・日帰り</p>

          <LegCard
            v-if="legOf('return')"
            v-model:stops="form.stops.return!"
            :number="2"
            :leg="legOf('return')!"
            :result="results.return"
            :status="statuses.return!"
            :loading="calculatingLegs.return"
            :error="failureOf('return')"
            :suggestions="advice.return?.suggestions ?? []"
            :long-stretches="advice.return?.longStretches ?? []"
            @open-add="pickerLeg = 'return'"
            @add-rest="addRest('return', $event)"
            @recalculate="calculate('return')"
            :optimize-blocker="blockerOf('return')"
            :optimize-note="optimizeNotes.return"
            :can-revert-order="canRevert('return')"
            @optimize="optimize('return')"
            @revert-order="revertOrder('return')"
          >
            <template #time-input>
              <div class="row">
                <label class="field">
                  <span class="field-label">試合の終了時刻</span>
                  <input v-model="form.matchEnd" class="input" type="time" />
                </label>
                <label class="field">
                  <span class="field-label">退場・出庫にかかる時間（分）</span>
                  <input v-model.number="form.exitMinutes" class="input" type="number" min="0" :max="MAX_EXIT_MINUTES" step="5" />
                </label>
              </div>
              <p class="muted">試合後の会場周辺の混雑（イベント渋滞）は、時刻に入っていません。</p>
            </template>
          </LegCard>
          <div v-if="baseErrors.length > 0 || stopErrorsOf('return').length > 0" class="notice notice-error" role="alert">
            <ul>
              <li v-for="message in [...baseErrors, ...stopErrorsOf('return')]" :key="message">{{ message }}</li>
            </ul>
          </div>

          <!-- 遠征のまとめと保存（仕様書 §4.10） -->
          <section class="card stack save">
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
        </section>
      </template>

      <UsageNote />
    </div>

    <StopPicker
      v-if="pickerLeg && form.venue && legOf(pickerLeg)"
      v-model:stops="form.stops[pickerLeg]!"
      :leg-label="legOf(pickerLeg)!.label"
      :center="form.venue"
      :default-position="pickerLeg === 'return' ? 'first' : 'last'"
      @close="pickerLeg = null"
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
  grid-template-columns: 1fr 1fr;
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

.input-auto,
.input-time {
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
