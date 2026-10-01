<script setup lang="ts">
// 区間（行き・帰り）1つ分の計算結果のカード
import type { Leg, LegResult } from '~/types/plan'
import { datePart, formatDateJa, formatDistance, formatDuration, formatYen, timePart } from '~/utils/datetime'
import type { LegStatus } from '~/utils/legs'

const props = defineProps<{
  leg: Leg
  result?: LegResult
  status: LegStatus
  loading?: boolean
  error?: string
}>()

const STATUS_LABELS: Record<LegStatus, string> = { calculated: '計算済み', stale: '未計算（条件が変わりました）', none: '未計算' }
</script>

<template>
  <section class="card leg" :class="[`leg-${props.leg.id}`, { 'leg-stale': props.status === 'stale' }]">
    <header class="leg-header">
      <h3 class="leg-title">
        <span class="leg-label">{{ props.leg.label }}</span>
        {{ props.leg.from.name }} → {{ props.leg.to.name }}
      </h3>
      <span class="status" :class="`status-${props.status}`">{{ props.loading ? '計算中…' : STATUS_LABELS[props.status] }}</span>
    </header>

    <p v-if="props.error" class="notice notice-error" role="alert">{{ props.error }}</p>

    <template v-if="props.result">
      <p v-if="props.status === 'stale'" class="notice notice-warn">
        下の時刻は、前の条件で計算した結果です。「計算し直す」を押すと、今の条件で計算します。
      </p>
      <div class="times">
        <div class="time" :class="{ 'time-computed': props.leg.timeRule === 'arriveBy' }">
          <span class="time-caption">{{ props.leg.from.name }} を出発</span>
          <span class="time-date">{{ formatDateJa(datePart(props.result.departAt)) }}</span>
          <span class="time-value">{{ timePart(props.result.departAt) }}</span>
        </div>
        <div class="time" :class="{ 'time-computed': props.leg.timeRule === 'departAt' }">
          <span class="time-caption">{{ props.leg.to.name }} に到着</span>
          <span class="time-date">{{ formatDateJa(datePart(props.result.arriveAt)) }}</span>
          <span class="time-value">{{ timePart(props.result.arriveAt) }}</span>
        </div>
      </div>
      <p class="summary">
        運転 {{ formatDuration(props.result.driveMinutes) }}・{{ formatDistance(props.result.distanceMeters) }}
        <template v-if="props.result.tollYen > 0">・高速 {{ formatYen(props.result.tollYen) }}</template>
      </p>
    </template>
    <p v-else-if="!props.error" class="muted">まだ計算していません。</p>
  </section>
</template>

<style scoped>
.leg {
  border-left-width: 6px;
}

.leg-outbound {
  border-left-color: var(--color-outbound);
}

.leg-return {
  border-left-color: var(--color-return);
}

.leg > * + * {
  margin-top: 10px;
}

.leg-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.leg-title {
  font-size: 1rem;
}

.leg-label {
  display: inline-block;
  margin-right: 6px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--color-text);
  color: #fff;
  font-size: 0.9rem;
}

.status {
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  background: var(--color-warn-soft);
  color: var(--color-warn);
}

.status-calculated {
  background: #e6f4e7;
  color: var(--color-ok);
}

.times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.time {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-bg);
}

/* 計算で決まった側（行きは出発、帰りは到着）を目立たせる */
.time-computed {
  background: var(--color-primary-soft);
}

.time-caption,
.time-date {
  font-size: 0.9rem;
  color: var(--color-muted);
}

.time-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
}

.leg-stale .times,
.leg-stale .summary {
  opacity: 0.5;
}
</style>
