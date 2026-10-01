<script setup lang="ts">
// プランの作成・編集の画面。initial を渡すと編集になる
import { searchRoute } from '~/services/route'
import type { MapPoint, MapRoute } from '~/types/map'
import type { LegResult, Plan, PlanForm } from '~/types/plan'
import { formatDuration, formatYen, nextSaturday, todayLocal } from '~/utils/datetime'
import { buildLegs, defaultPlanName, legInputHash, legStatus, MAX_EXIT_MINUTES, validateForm } from '~/utils/legs'
import { savePlan } from '~/utils/planStore'

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
      }
    : {
        name: '',
        home: null,
        venue: null,
        matchDate: nextSaturday(todayLocal()),
        arriveBy: '12:00',
        matchEnd: '17:00',
        exitMinutes: 45,
      },
)

// 区間ごとの、いちばん新しい計算結果。今の条件のものとは限らない（legStatus で見分ける）
const results = ref<Record<string, LegResult>>({})
for (const leg of props.initial?.legs ?? []) {
  if (leg.result) results.value[leg.id] = leg.result
}
// 区間ごとの、計算の失敗。どの条件で失敗したかも持ち、条件を変えたら表示しない
const failures = ref<Record<string, { hash: string; message: string }>>({})
const calculating = ref(false)
const attempted = ref(false)

const errors = computed(() => validateForm(form))
const legs = computed(() => (errors.value.length === 0 ? buildLegs(form) : []))
const statuses = computed(() => Object.fromEntries(legs.value.map((leg) => [leg.id, legStatus(leg, results.value[leg.id])])))
const uncalculated = computed(() => legs.value.filter((leg) => statuses.value[leg.id] !== 'calculated'))
const allCalculated = computed(() => legs.value.length > 0 && uncalculated.value.length === 0)
const isPastDate = computed(() => form.matchDate !== '' && form.matchDate < todayLocal())

function failureOf(legId: string): string {
  const leg = legs.value.find((l) => l.id === legId)
  const failure = failures.value[legId]
  return leg && failure?.hash === legInputHash(leg) ? failure.message : ''
}

// 「計算する」を押した時だけルートを検索する。今の条件で計算済みの区間は呼ばない
async function calculate() {
  attempted.value = true
  if (calculating.value || errors.value.length > 0) return
  calculating.value = true
  try {
    for (const leg of uncalculated.value) {
      try {
        results.value[leg.id] = await searchRoute(leg)
        delete failures.value[leg.id]
      } catch (e) {
        failures.value[leg.id] = {
          hash: legInputHash(leg),
          message: e instanceof Error ? e.message : 'ルートを計算できませんでした。もう一度押してください。',
        }
      }
    }
  } finally {
    calculating.value = false
  }
}

const calculateLabel = computed(() => {
  if (calculating.value) return '計算中…'
  if (allCalculated.value) return '✓ 今の条件で計算済み'
  return Object.keys(results.value).length > 0 ? '計算し直す' : '計算する'
})

const totals = computed(() => {
  if (!allCalculated.value) return null
  const list = legs.value.map((leg) => results.value[leg.id]!)
  return {
    driveMinutes: list.reduce((sum, r) => sum + r.driveMinutes, 0),
    tollYen: list.reduce((sum, r) => sum + r.tollYen, 0),
  }
})

const placeholderName = computed(() => (form.venue ? defaultPlanName(form.venue.name, form.matchDate) : ''))

// 保存できない理由。保存できるときは空
const saveBlocker = computed(() => {
  if (calculating.value) return '計算しています。終わると保存できます。'
  if (errors.value.length > 0) return '入力に足りないところがあります。上の「条件を入れる」を確かめてください。'
  if (!allCalculated.value) {
    const labels = uncalculated.value.map((leg) => `「${leg.label}」`).join('と')
    return `${labels}が、今の条件でまだ計算されていません。「${calculateLabel.value}」を押してください。`
  }
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
    restIntervalMinutes: props.initial?.restIntervalMinutes ?? 120,
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

// 保存せずに離れるときは、離れる前に確かめる
const initialSnapshot = JSON.stringify(form)
const dirty = computed(() => !saved.value && JSON.stringify(form) !== initialSnapshot)
const LEAVE_MESSAGE = 'まだ保存していません。このままページを離れると、入力した内容は消えます。離れてもよいですか？'

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm(LEAVE_MESSAGE)) return false
})

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const mapRoutes = computed<MapRoute[]>(() =>
  legs.value
    .filter((leg) => statuses.value[leg.id] === 'calculated')
    .map((leg) => ({
      id: leg.id,
      direction: leg.timeRule === 'arriveBy' ? 'outbound' : 'return',
      shape: results.value[leg.id]!.shape,
    })),
)
const mapPoints = computed<MapPoint[]>(() => [
  ...(form.home ? [{ kind: 'home' as const, place: form.home }] : []),
  ...(form.venue ? [{ kind: 'venue' as const, place: form.venue }] : []),
])
</script>

<template>
  <SplitLayout>
    <h1 class="page-title">{{ isEdit ? 'プランを編集する' : '日帰りのプランを作る' }}</h1>

    <div class="stack">
      <section class="card stack">
        <h2 class="step-title"><span class="step-number">1</span>条件を入れる</h2>

        <PlaceField v-model="form.home" label="出発地（自宅など）" placeholder="例: 新潟駅" />
        <PlaceField v-model="form.venue" label="会場" placeholder="例: デンカビッグスワンスタジアム" />

        <label class="field">
          <span class="field-label">試合日</span>
          <input v-model="form.matchDate" class="input" type="date" />
        </label>
        <p v-if="isPastDate" class="notice notice-warn">試合日が過去の日付になっています。</p>

        <div class="row">
          <label class="field">
            <span class="field-label">会場に着きたい時刻</span>
            <input v-model="form.arriveBy" class="input" type="time" />
          </label>
          <label class="field">
            <span class="field-label">試合の終了時刻</span>
            <input v-model="form.matchEnd" class="input" type="time" />
          </label>
        </div>

        <label class="field">
          <span class="field-label">試合が終わってから、会場を出るまでの時間（分）</span>
          <input v-model.number="form.exitMinutes" class="input input-short" type="number" min="0" :max="MAX_EXIT_MINUTES" step="5" />
          <span class="muted">退場して車を出すまでにかかる時間です。帰りは「試合の終了時刻＋この時間」に出発します。</span>
        </label>

        <div v-if="attempted && errors.length > 0" class="notice notice-error" role="alert">
          <ul>
            <li v-for="message in errors" :key="message">{{ message }}</li>
          </ul>
        </div>

        <button type="button" class="btn btn-primary btn-block" :disabled="calculating || allCalculated" @click="calculate">
          {{ calculateLabel }}
        </button>
        <p class="muted">
          ルートを検索するのは、このボタンを押した時だけです。今の条件でまだ計算していない区間の数だけ、NAVITIME
          の無料枠を使います（行きと帰りで最大2回）。
        </p>
      </section>

      <section class="stack">
        <h2 class="step-title"><span class="step-number">2</span>計算結果を確かめる</h2>
        <p v-if="legs.length === 0" class="muted">条件をすべて入れて「計算する」を押すと、ここに行きと帰りの時刻が出ます。</p>
        <template v-else>
          <p class="notice notice-info">
            渋滞を考慮していない時刻です。混みそうな日は、余裕を持って出発してください。高速料金は ETC・普通車の料金で、休日や深夜の割引は反映されないことがあります。
          </p>
          <LegCard
            v-for="leg in legs"
            :key="leg.id"
            :leg="leg"
            :result="results[leg.id]"
            :status="statuses[leg.id]!"
            :loading="calculating && statuses[leg.id] !== 'calculated'"
            :error="failureOf(leg.id)"
          />
        </template>
      </section>

      <section v-if="legs.length > 0" class="card stack save">
        <h2 class="step-title"><span class="step-number">3</span>名前を付けて保存する</h2>
        <p v-if="totals" class="totals">
          往復の運転時間 <strong>{{ formatDuration(totals.driveMinutes) }}</strong>
          <template v-if="totals.tollYen > 0">・高速料金 <strong>{{ formatYen(totals.tollYen) }}</strong></template>
        </p>
        <label class="field">
          <span class="field-label">プラン名</span>
          <input v-model="form.name" class="input" type="text" maxlength="60" :placeholder="placeholderName" />
          <span class="muted">空のままなら「{{ placeholderName }}」になります。</span>
        </label>
        <button type="button" class="btn btn-primary btn-block" :disabled="saveBlocker !== ''" @click="save">
          {{ isEdit ? '上書き保存する' : 'プランを保存する' }}
        </button>
        <p v-if="saveBlocker" class="muted">{{ saveBlocker }}</p>
        <p v-if="saveError" class="notice notice-error" role="alert">{{ saveError }}</p>
      </section>

      <UsageNote />
    </div>

    <template #map>
      <RouteMap :routes="mapRoutes" :points="mapPoints" />
    </template>
  </SplitLayout>
</template>

<style scoped>
.step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.15rem;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.95rem;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input-short {
  max-width: 140px;
  margin-right: 8px;
}

.field .muted {
  display: block;
  margin-top: 4px;
}

.save {
  border-color: var(--color-primary);
  border-width: 2px;
}

.totals {
  font-size: 1.05rem;
}
</style>
