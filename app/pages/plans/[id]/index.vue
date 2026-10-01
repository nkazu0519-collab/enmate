<script setup lang="ts">
// プランの閲覧。保存したときの計算結果だけを表示し、NAVITIME は呼ばない
import type { MapPoint, MapRoute } from '~/types/map'
import { formatDateJa, formatDistance, formatDuration, formatTimestamp, formatYen } from '~/utils/datetime'
import { STOP_KIND_ICONS } from '~/utils/legs'
import { deletePlan, findPlan } from '~/utils/planStore'
import { suggestRests } from '~/utils/rest'

const route = useRoute()
const plan = findPlan(String(route.params.id))
useHead({ title: plan ? `${plan.name} | えんメイト` : 'プランが見つかりませんでした | えんメイト' })

const results = (plan?.legs ?? []).flatMap((leg) => (leg.result ? [leg.result] : []))
const totals = {
  driveMinutes: results.reduce((sum, r) => sum + r.driveMinutes, 0),
  distanceMeters: results.reduce((sum, r) => sum + r.distanceMeters, 0),
  tollYen: results.reduce((sum, r) => sum + r.tollYen, 0),
}

const mapRoutes: MapRoute[] = (plan?.legs ?? []).flatMap((leg) =>
  leg.result ? [{ id: leg.id, direction: leg.timeRule === 'arriveBy' ? ('outbound' as const) : ('return' as const), shape: leg.result.shape }] : [],
)
const mapPoints: MapPoint[] = plan
  ? [
      { kind: 'home', place: plan.home },
      { kind: 'venue', place: plan.venue },
      ...plan.legs.flatMap((leg) => leg.stops.map((stop) => ({ kind: 'stop' as const, place: stop.place, icon: STOP_KIND_ICONS[stop.kind] }))),
      ...plan.legs.flatMap((leg) =>
        leg.result
          ? suggestRests(leg.result, plan.restIntervalMinutes).suggestions.map((area) => ({
              kind: 'rest' as const,
              place: { name: area.name, lat: area.lat, lon: area.lon },
            }))
          : [],
      ),
    ]
  : []

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
          <dt>往復の運転時間</dt>
          <dd>{{ formatDuration(totals.driveMinutes) }}</dd>
        </div>
        <div>
          <dt>往復の距離</dt>
          <dd>{{ formatDistance(totals.distanceMeters) }}</dd>
        </div>
        <div>
          <dt>高速料金</dt>
          <dd>{{ formatYen(totals.tollYen) }}</dd>
        </div>
      </dl>

      <p class="notice notice-info">
        保存した時点（{{ formatTimestamp(plan.updatedAt) }}）に計算した、渋滞を考慮していない時刻です。高速料金は ETC・普通車の料金で、休日や深夜の割引は反映されないことがあります。
      </p>

      <LegCard
        v-for="leg in plan.legs"
        :key="leg.id"
        :leg="leg"
        :result="leg.result"
        status="calculated"
        :rest-interval-minutes="plan.restIntervalMinutes"
      />

      <NuxtLink to="/" class="btn">← 保存したプランの一覧へ戻る</NuxtLink>
    </div>

    <template #map>
      <RouteMap :routes="mapRoutes" :points="mapPoints" />
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
</style>
