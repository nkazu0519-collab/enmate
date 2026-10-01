<script setup lang="ts">
// プランの閲覧（仕様書 §5）。保存したときの計算結果だけを表示し、NAVITIME は呼ばない
import type { MapPoint, MapRoute } from '~/types/map'
import { datePart, formatDateJa, formatDistance, formatDuration, formatTimestamp, formatYen, timePart } from '~/utils/datetime'
import { STOP_KIND_ICONS } from '~/utils/legs'
import { legTimelineItems, type TimelineItem } from '~/utils/planSummary'
import { deletePlan, findPlan } from '~/utils/planStore'

const route = useRoute()
const plan = findPlan(String(route.params.id))
useHead({ title: plan ? `${plan.name} | えんメイト` : 'プランが見つかりませんでした | えんメイト' })

const results = (plan?.legs ?? []).flatMap((leg) => (leg.result ? [leg.result] : []))
const totals = {
  driveMinutes: results.reduce((sum, r) => sum + r.driveMinutes, 0),
  distanceMeters: results.reduce((sum, r) => sum + r.distanceMeters, 0),
  tollYen: results.reduce((sum, r) => sum + r.tollYen, 0),
}

// 行き・帰りのカード。押すとその方向のルートを地図に出す（開いたときは行き）
const directions = (plan?.legs ?? []).filter((leg) => leg.result)
const selected = ref<string | null>(directions[0]?.id ?? null)
const openTimeline = ref<Record<string, boolean>>({})

const mapRoutes = computed<MapRoute[]>(() =>
  directions
    .filter((leg) => selected.value === null || leg.id === selected.value)
    .map((leg) => ({ id: leg.id, direction: leg.timeRule === 'arriveBy' ? 'outbound' : 'return', shape: leg.result!.shape })),
)
// 休憩候補のピンは描かない（仕様書 §5.5）
const mapPoints = computed<MapPoint[]>(() =>
  plan
    ? [
        { kind: 'home', place: plan.home },
        { kind: 'venue', place: plan.venue },
        ...directions
          .filter((leg) => selected.value === null || leg.id === selected.value)
          .flatMap((leg) => leg.stops.map((stop, i) => ({ kind: 'stop' as const, place: stop.place, icon: STOP_KIND_ICONS[stop.kind], label: String(i + 1) }))),
      ]
    : [],
)

// タイムラインを日付ごとに分ける
function byDate(items: TimelineItem[]): { date: string; items: TimelineItem[] }[] {
  const groups: { date: string; items: TimelineItem[] }[] = []
  for (const item of items) {
    const date = datePart(item.at)
    const last = groups[groups.length - 1]
    if (last?.date === date) last.items.push(item)
    else groups.push({ date, items: [item] })
  }
  return groups
}

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`

const deleteError = ref('')

async function remove() {
  if (!plan || !window.confirm(`「${plan.name}」を削除します。元に戻せません。よろしいですか？`)) return
  if (!deletePlan(plan.id)) {
    deleteError.value = '削除できませんでした。ブラウザの保存領域が使えない設定になっています。'
    return
  }
  await navigateTo('/')
}
</script>

<template>
  <PlanNotFound v-if="!plan" />
  <SplitLayout v-else>
    <div class="stack">
      <header>
        <p class="muted">{{ formatDateJa(plan.matchDate) }}・日帰り</p>
        <h1 class="page-title">{{ plan.name }}</h1>
        <p>{{ plan.home.name }} → {{ plan.venue.name }}</p>
      </header>

      <div class="actions">
        <NuxtLink :to="`/plans/${plan.id}/edit`" class="btn">編集</NuxtLink>
        <button type="button" class="btn btn-danger" @click="remove">削除</button>
      </div>
      <p v-if="deleteError" class="notice notice-error" role="alert">{{ deleteError }}</p>

      <dl class="totals card">
        <div>
          <dt>運転時間</dt>
          <dd>{{ formatDuration(totals.driveMinutes) }}</dd>
        </div>
        <div>
          <dt>距離</dt>
          <dd>{{ formatDistance(totals.distanceMeters) }}</dd>
        </div>
        <div>
          <dt>高速 ETC 料金</dt>
          <dd>{{ formatYen(totals.tollYen) }}</dd>
        </div>
      </dl>

      <p class="notice notice-info">
        保存した時点（{{ formatTimestamp(plan.updatedAt) }}）に計算した、渋滞を考慮していない時刻です。高速料金は ETC・普通車の料金で、休日や深夜の割引は反映されないことがあります。
      </p>

      <!-- 行き・帰りのカード（仕様書 §5.2） -->
      <section v-for="leg in directions" :key="leg.id" class="direction card" :class="[`direction-${leg.id}`, { active: selected === leg.id }]">
        <button type="button" class="direction-main" :aria-pressed="selected === leg.id" @click="selected = leg.id">
          <span class="direction-head">
            <span class="direction-label">{{ leg.label }}</span>
            <span class="map-label">{{ selected === leg.id ? '🗺 地図に表示中' : '🗺 押すと地図に表示' }}</span>
          </span>
          <span class="direction-times">
            <span>
              <span class="muted">{{ formatDateJa(datePart(leg.result!.departAt)) }} {{ leg.from.name }} を出発</span>
              <strong>{{ timePart(leg.result!.departAt) }}</strong>
            </span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>
              <span class="muted">{{ formatDateJa(datePart(leg.result!.arriveAt)) }} {{ leg.to.name }} に到着</span>
              <strong>{{ timePart(leg.result!.arriveAt) }}</strong>
            </span>
          </span>
          <span class="muted">
            運転 {{ formatDuration(leg.result!.driveMinutes) }}・{{ formatDistance(leg.result!.distanceMeters) }}
            <template v-if="leg.result!.tollYen > 0">・高速 {{ formatYen(leg.result!.tollYen) }}</template>
          </span>
        </button>

        <button type="button" class="btn btn-small timeline-toggle" @click="openTimeline[leg.id] = !openTimeline[leg.id]">
          {{ openTimeline[leg.id] ? '▲ タイムラインを閉じる' : '▼ 詳しいタイムラインを見る' }}
        </button>
        <div v-if="openTimeline[leg.id]" class="timeline">
          <div v-for="group in byDate(legTimelineItems(plan, leg.id))" :key="group.date">
            <p class="timeline-date">{{ formatDateJa(group.date) }}</p>
            <ol class="timeline-list">
              <li v-for="(item, i) in group.items" :key="i" class="timeline-item">
                <span class="timeline-time">{{ timePart(item.at) }}</span>
                <span v-if="item.type === 'matchEnd'">🏟 試合終了</span>
                <span v-else-if="item.type === 'depart'">🚗 {{ item.name }} を出発（{{ item.legLabel }}）</span>
                <span v-else-if="item.type === 'stop'">
                  ⭐ {{ item.name }} に立ち寄り（〜{{ timePart(item.until!) }}）
                  <a v-if="item.spotCode" :href="spotUrl(item.spotCode)" target="_blank" rel="noopener">詳細↗</a>
                </span>
                <span v-else>📍 {{ item.name }} に到着</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <NuxtLink to="/" class="btn">← 保存したプランの一覧へ戻る</NuxtLink>
    </div>

    <template #map>
      <div class="map-box">
        <button type="button" class="btn btn-small map-all" :disabled="selected === null" @click="selected = null">全体を表示</button>
        <RouteMap :routes="mapRoutes" :points="mapPoints" />
      </div>
    </template>
  </SplitLayout>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 8px;
}

.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 16px 0 0;
  text-align: center;
}

.totals dt {
  font-size: 0.9rem;
  color: var(--color-muted);
}

.totals dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.direction {
  border-left-width: 6px;
}

.direction-outbound {
  border-left-color: var(--color-outbound);
}

.direction-return {
  border-left-color: var(--color-return);
}

.direction.active {
  background: var(--color-primary-soft);
  border-left-width: 10px;
}

.direction-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.direction-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.direction-label {
  padding: 0 12px;
  border-radius: 999px;
  background: var(--color-text);
  color: #fff;
  font-weight: 700;
}

.map-label {
  font-size: 0.875rem;
  color: var(--color-primary-dark);
}

.direction-times {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.direction-times > span:not(.arrow) {
  display: flex;
  flex-direction: column;
}

.direction-times strong {
  font-size: 1.5rem;
  line-height: 1.2;
}

.arrow {
  padding-bottom: 4px;
  color: var(--color-muted);
}

.timeline-toggle {
  margin-top: 10px;
}

.timeline {
  margin-top: 8px;
}

.timeline-date {
  margin-top: 6px;
  font-weight: 700;
}

.timeline-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.timeline-item {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  border-left: 2px solid var(--color-border);
  padding-left: 10px;
}

.timeline-time {
  flex: none;
  width: 3.2em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.map-box {
  position: relative;
  height: 100%;
}

/* 地図の右上に重ねる（Leaflet の部品より手前） */
.map-all {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1001;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
</style>
