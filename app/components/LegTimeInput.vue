<script setup lang="ts">
// 区間のカードのいちばん上に出す、その区間の時刻の入力欄（仕様書 §4.2 の表）。
// 行きの区間は着く時刻、帰りの区間は出る時刻を入れる。form は作成ページの入力で、ここで直接書き換える
import type { PlanForm } from '~/types/plan'
import { MAX_EXIT_MINUTES, type LegId } from '~/utils/legs'

const props = defineProps<{ legId: LegId; form: PlanForm }>()
</script>

<template>
  <label v-if="props.legId === 'before'" class="field">
    <span class="field-label">前日に宿泊先へ着く時刻</span>
    <input v-model="props.form.hotelBeforeArriveBy" class="input input-time" type="time" />
  </label>
  <label v-else-if="props.legId === 'outbound'" class="field">
    <span class="field-label">到着予定時刻（会場に着く時刻）</span>
    <input v-model="props.form.arriveBy" class="input input-time" type="time" />
  </label>
  <template v-else-if="props.legId === 'return'">
    <div class="row">
      <label class="field">
        <span class="field-label">試合の終了時刻</span>
        <input v-model="props.form.matchEnd" class="input" type="time" />
      </label>
      <label class="field">
        <span class="field-label">退場・出庫にかかる時間（分）</span>
        <input v-model.number="props.form.exitMinutes" class="input" type="number" min="0" :max="MAX_EXIT_MINUTES" step="5" />
      </label>
    </div>
    <p class="muted">試合後の会場周辺の混雑（イベント渋滞）は、時刻に入っていません。</p>
  </template>
  <label v-else class="field">
    <span class="field-label">翌日に宿泊先を出る時刻（チェックアウト後）</span>
    <input v-model="props.form.hotelAfterDepartAt" class="input input-time" type="time" />
  </label>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.input-time {
  width: auto;
}
</style>
