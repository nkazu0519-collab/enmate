<script setup lang="ts">
// プランの閲覧（仕様書 §5）。保存したときの計算結果だけを表示し、NAVITIME は呼ばない
import type { MapPoint, MapRoute } from '~/types/map'
import type { Leg, Place } from '~/types/plan'
import { datePart, formatDateJa, formatDistance, formatDuration, formatTimestamp, formatYen, timePart } from '~/utils/datetime'
import { sideOf, STOP_KIND_ICONS } from '~/utils/legs'
import { stayLabel, timelineItems, type TimelineItem } from '~/utils/planSummary'
import { deletePlan, findPlan } from '~/utils/planStore'

const route = useRoute()
const plan = findPlan(String(route.params.id))
useHead({ title: plan ? `${plan.name} | えんメイト` : 'プランが見つかりませんでした | えんメイト' })

const computedLegs = (plan?.legs ?? []).filter((leg) => leg.result)
const sum = (legs: Leg[]) => ({
  driveMinutes: legs.reduce((total, leg) => total + leg.result!.driveMinutes, 0),
  distanceMeters: legs.reduce((total, leg) => total + leg.result!.distanceMeters, 0),
  tollYen: legs.reduce((total, leg) => total + leg.result!.tollYen, 0),
})
const totals = sum(computedLegs)

// 「行き」「帰り」の2枚のカード（仕様書 §5.2）。前泊・後泊で区間が増えても方向ごとに1枚にまとめ、
// 最初の出発と最後の到着を出す。押すとその方向のルートを地図に出す（開いたときは行き）
type Side = 'outbound' | 'return'
const directions = (['outbound', 'return'] as Side[]).flatMap((side) => {
  const legs = computedLegs.filter((leg) => sideOf(leg.id) === side)
  const first = legs[0]
  const last = legs[legs.length - 1]
  return first && last ? [{ side, label: side === 'outbound' ? '行き' : '帰り', first, last, ...sum(legs) }] : []
})
const selected = ref<Side | null>(directions[0]?.side ?? null)
const openTimeline = ref<Record<string, boolean>>({})
const shownLegs = computed(() => computedLegs.filter((leg) => selected.value === null || sideOf(leg.id) === selected.value))

// 宿泊先（仕様書 §5.4）。泊まる順に出し、前日と同じ宿に2泊するときは1つにまとめる
const hotels: { place: Place; nights: string }[] = []
for (const [place, night] of [
  ...(plan?.hotelsBefore ?? []).map((h) => [h, '前日'] as const),
  ...(plan?.hotelsAfter ?? []).map((h) => [h, '試合の夜'] as const),
]) {
  const same = hotels.find((h) => h.place.lat === place.lat && h.place.lon === place.lon)
  if (same) same.nights += `・${night}`
  else hotels.push({ place, nights: night })
}

const mapRoutes = computed<MapRoute[]>(() => shownLegs.value.map((leg) => ({ id: leg.id, direction: sideOf(leg.id), shape: leg.result!.shape })))
// 休憩候補のピンは描かない（仕様書 §5.5）
const mapPoints = computed<MapPoint[]>(() =>
  plan
    ? [
        { kind: 'home', place: plan.home },
        { kind: 'venue', place: plan.venue },
        ...hotels.map((h) => ({ kind: 'hotel' as const, place: h.place })),
        ...shownLegs.value.flatMap((leg) =>
          leg.stops.map((stop, i) => ({ kind: 'stop' as const, place: stop.place, icon: STOP_KIND_ICONS[stop.kind], label: String(i + 1) })),
        ),
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
        <p class="muted">{{ formatDateJa(plan.matchDate) }}・{{ stayLabel(plan) }}</p>
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
      <section v-for="d in directions" :key="d.side" class="direction card" :class="[`direction-${d.side}`, { active: selected === d.side }]">
        <button type="button" class="direction-main" :aria-pressed="selected === d.side" @click="selected = d.side">
          <span class="direction-head">
            <span class="direction-label">{{ d.label }}</span>
            <span class="map-label">{{ selected === d.side ? '🗺 地図に表示中' : '🗺 押すと地図に表示' }}</span>
          </span>
          <span class="direction-times">
            <span>
              <span class="muted">{{ formatDateJa(datePart(d.first.result!.departAt)) }} {{ d.first.from.name }} を出発</span>
              <strong>{{ timePart(d.first.result!.departAt) }}</strong>
            </span>
            <span class="arrow" aria-hidden="true">→</span>
            <span>
              <span class="muted">{{ formatDateJa(datePart(d.last.result!.arriveAt)) }} {{ d.last.to.name }} に到着</span>
              <strong>{{ timePart(d.last.result!.arriveAt) }}</strong>
            </span>
          </span>
          <span class="muted">
            運転 {{ formatDuration(d.driveMinutes) }}・{{ formatDistance(d.distanceMeters) }}
            <template v-if="d.tollYen > 0">・高速 {{ formatYen(d.tollYen) }}</template>
          </span>
        </button>

        <button type="button" class="btn btn-small timeline-toggle" @click="openTimeline[d.side] = !openTimeline[d.side]">
          {{ openTimeline[d.side] ? '▲ タイムラインを閉じる' : '▼ 詳しいタイムラインを見る' }}
        </button>
        <div v-if="openTimeline[d.side]" class="timeline">
          <div v-for="group in byDate(timelineItems(plan, d.side))" :key="group.date">
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
                <span v-else>
                  📍 {{ item.name }} に到着<template v-if="item.hotel">（宿泊）</template>
                  <a v-if="item.hotel && item.spotCode" :href="spotUrl(item.spotCode)" target="_blank" rel="noopener">詳細↗</a>
                </span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <!-- 宿泊先（仕様書 §5.4）。予約リンクはあとで作る -->
      <section v-if="hotels.length > 0" class="card stack">
        <h2 class="sub-title">宿泊先</h2>
        <ul class="hotels">
          <li v-for="h in hotels" :key="`${h.place.lat},${h.place.lon}`">
            <span class="hotel-nights">{{ h.nights }}</span>
            <strong>{{ h.place.name }}</strong>
            <a v-if="h.place.spotCode" :href="spotUrl(h.place.spotCode)" target="_blank" rel="noopener">NAVITIMEで詳しく見る↗</a>
          </li>
        </ul>
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

.sub-title {
  font-size: 1.05rem;
}

.hotels {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hotels li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 4px 0;
}

.hotel-nights {
  font-size: 0.875rem;
  color: var(--color-muted);
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
