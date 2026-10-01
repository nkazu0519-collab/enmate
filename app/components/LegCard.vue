<script setup lang="ts">
// 作成・編集ページの区間のカード（仕様書 §4.6）。いちばん上に区間の時刻の入力欄（スロット）、
// 出発・到着の時刻、概要、立ち寄り先の一覧（§4.5）、おすすめ休憩地（§4.8）を出す
import type { Leg, LegResult, Stop, StopKind } from '~/types/plan'
import { datePart, formatDateJa, formatDistance, formatDuration, formatYen, timePart } from '~/utils/datetime'
import { MAX_STAY_MINUTES, STAY_STEP_MINUTES, STOP_KIND_ICONS, STOP_KIND_LABELS, type LegStatus } from '~/utils/legs'
import type { LongStretch, RestSuggestion } from '~/utils/rest'

const props = defineProps<{
  number: number // 往復を通しての区間の番号
  leg: Leg
  result?: LegResult
  status: LegStatus
  loading?: boolean
  error?: string
  suggestions: RestSuggestion[]
  longStretches: LongStretch[]
}>()
const stops = defineModel<Stop[]>('stops', { required: true })
const emit = defineEmits<{ 'open-add': []; 'add-rest': [index: number]; recalculate: [] }>()

const KINDS = Object.keys(STOP_KIND_LABELS) as StopKind[]
const calculated = computed(() => props.status === 'calculated')
const visits = computed(() => (calculated.value ? (props.result?.stopVisits ?? []) : []))

function update(index: number, patch: Partial<Stop>) {
  stops.value = stops.value.map((stop, i) => (i === index ? { ...stop, ...patch } : stop))
}

function move(index: number, by: -1 | 1) {
  const next = [...stops.value]
  const [stop] = next.splice(index, 1)
  next.splice(index + by, 0, stop!)
  stops.value = next
}

function remove(index: number) {
  stops.value = stops.value.filter((_, i) => i !== index)
}

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`
</script>

<template>
  <section class="card leg" :class="[`leg-${props.leg.id}`, { 'leg-stale': props.status === 'stale' }]">
    <header class="leg-header">
      <h3 class="leg-title">
        <span class="leg-number">{{ props.number }}</span>
        <span class="leg-label">{{ props.leg.label }}</span>
        {{ props.leg.from.name }} → {{ props.leg.to.name }}
      </h3>
    </header>

    <!-- 区間の時刻の入力欄（行きは着く時刻、帰りは出る時刻） -->
    <div class="time-input"><slot name="time-input" /></div>

    <p v-if="props.loading" class="muted">検索中…</p>
    <p v-if="props.error" class="notice notice-error" role="alert">{{ props.error }}</p>

    <template v-if="props.result">
      <p v-if="props.status === 'stale' && !props.loading" class="notice notice-warn stale-note">
        <span>下の時刻は、前の条件で計算した結果です。</span>
        <button type="button" class="btn btn-small btn-primary" @click="emit('recalculate')">計算し直す</button>
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
    <p v-else-if="!props.error && !props.loading" class="muted">まだ計算していません。</p>

    <!-- 立ち寄り先（仕様書 §4.5） -->
    <section class="stops">
      <h4 class="sub-title">立ち寄り先</h4>
      <ol v-if="stops.length > 0" class="stop-list">
        <li v-for="(stop, i) in stops" :key="`${stop.place.lat},${stop.place.lon},${i}`" class="stop">
          <div class="stop-head">
            <span class="stop-number">{{ i + 1 }}</span>
            <span class="stop-icon" aria-hidden="true">{{ STOP_KIND_ICONS[stop.kind] }}</span>
            <span class="stop-name">
              {{ stop.place.name }}
              <a v-if="stop.place.spotCode" class="stop-link" :href="spotUrl(stop.place.spotCode)" target="_blank" rel="noopener">詳細↗</a>
            </span>
            <span v-if="visits[i]" class="stop-time">{{ timePart(visits[i]!.arriveAt) }} 着 → {{ timePart(visits[i]!.departAt) }} 発</span>
          </div>
          <div class="stop-controls">
            <label>
              <span class="sr-only">種類</span>
              <select class="input input-auto" :value="stop.kind" @change="update(i, { kind: ($event.target as HTMLSelectElement).value as StopKind })">
                <option v-for="kind in KINDS" :key="kind" :value="kind">{{ STOP_KIND_LABELS[kind] }}</option>
              </select>
            </label>
            <label class="stay">
              <span>滞在</span>
              <input
                class="input"
                type="number"
                min="0"
                :max="MAX_STAY_MINUTES"
                :step="STAY_STEP_MINUTES"
                :value="stop.stayMinutes"
                :aria-label="`${stop.place.name}の滞在時間（分）`"
                @input="update(i, { stayMinutes: ($event.target as HTMLInputElement).valueAsNumber })"
              />
              <span>分</span>
            </label>
            <span class="stop-moves">
              <button type="button" class="btn btn-small" :disabled="i === 0" :aria-label="`${stop.place.name}を前へ`" @click="move(i, -1)">↑</button>
              <button type="button" class="btn btn-small" :disabled="i === stops.length - 1" :aria-label="`${stop.place.name}を後ろへ`" @click="move(i, 1)">↓</button>
              <button type="button" class="btn btn-small btn-danger" :aria-label="`${stop.place.name}を削除`" @click="remove(i)">✕</button>
            </span>
          </div>
        </li>
      </ol>
      <button type="button" class="btn btn-block" @click="emit('open-add')">＋立ち寄り先を追加</button>
    </section>

    <!-- おすすめ休憩地（仕様書 §4.8） -->
    <details v-if="props.result && calculated" class="rests">
      <summary>おすすめ休憩地（{{ props.suggestions.length }}件）</summary>
      <p v-if="props.suggestions.length === 0 && props.longStretches.length === 0" class="muted">
        休憩間隔内に到着できるため、休憩の提案はありません。
      </p>
      <ul v-if="props.suggestions.length > 0" class="rest-list">
        <li v-for="(area, i) in props.suggestions" :key="`${area.name}${area.passAt}`" class="rest">
          <span class="rest-mark">休{{ i + 1 }}</span>
          <span class="rest-body">
            <span class="rest-name">{{ area.name }}<span class="muted">（{{ area.kind }}）</span></span>
            <span class="muted">{{ timePart(area.passAt) }}ごろ着・前の休憩から {{ formatDuration(area.drivenMinutes) }} 運転</span>
          </span>
          <button type="button" class="btn btn-small" :disabled="props.loading" @click="emit('add-rest', i)">ここで30分休憩する</button>
        </li>
      </ul>
      <p v-for="stretch in props.longStretches" :key="stretch.from" class="notice notice-warn">
        {{ timePart(stretch.from) }}〜{{ timePart(stretch.to) }} は、SA/PA で休めないまま {{ formatDuration(stretch.minutes) }} 運転が続きます。道の駅やコンビニで休憩を取ってください。
      </p>
      <details v-if="props.result.restAreas.length > 0" class="all-sapa">
        <summary>ルート上のSA/PA（{{ props.result.restAreas.length }}件）をすべて見る</summary>
        <ul class="sapa-list">
          <li v-for="area in props.result.restAreas" :key="`${area.name}${area.passAt}`">
            <span class="sapa-kind">{{ area.kind }}</span>{{ area.name }}<span class="muted">（{{ timePart(area.passAt) }}ごろ）</span>
          </li>
        </ul>
      </details>
    </details>
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
  margin-top: 12px;
}

.leg-title {
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

.time-input:empty {
  display: none;
}

.stale-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.sub-title {
  margin-bottom: 6px;
  font-size: 0.95rem;
}

.stop-list,
.rest-list,
.sapa-list {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.stop {
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.stop + .stop {
  margin-top: 6px;
}

.stop-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.stop-number {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-text);
  color: #fff;
  font-size: 0.85rem;
}

.stop-name {
  flex: 1;
  min-width: 120px;
  font-weight: 600;
  line-height: 1.4;
}

.stop-link {
  margin-left: 4px;
  font-size: 0.875rem;
  font-weight: 400;
}

.stop-time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stop-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.input-auto {
  width: auto;
}

.stay {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stay .input {
  width: 86px;
}

.stop-moves {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.stop-moves .btn {
  min-width: 36px;
  padding: 4px 8px;
}

.rests {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--color-bg);
}

.rests > summary,
.all-sapa > summary {
  font-weight: 600;
  cursor: pointer;
}

.rests[open] > * + * {
  margin-top: 8px;
}

.rest {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.rest + .rest {
  border-top: 1px dashed var(--color-border);
}

.rest-mark {
  flex: none;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-return);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
}

.rest-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 160px;
  line-height: 1.4;
}

.rest-name {
  font-weight: 600;
}

.sapa-list li {
  padding: 2px 0;
  font-size: 0.9rem;
}

.sapa-kind {
  display: inline-block;
  min-width: 2.2em;
  margin-right: 6px;
  font-weight: 700;
  color: var(--color-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
