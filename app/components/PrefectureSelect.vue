<script setup lang="ts">
// 通る都道府県のボタン（通る順）。「全国」のボタンと、通らない都道府県を地方ごとに選ぶ「そのほかの都道府県」も出せる（仕様書 §4.4・§4.5）
import { REGIONS, type Prefecture } from '~/utils/routeArea'

const props = defineProps<{
  prefectures: Prefecture[] // ルートが通る都道府県（通る順）
  selected: Prefecture | null // null は全国
  national?: boolean // 先頭に「全国」を出す
  others?: boolean // 「そのほかの都道府県」を出す
}>()
const emit = defineEmits<{ select: [pref: Prefecture | null] }>()

const otherRegions = computed(() =>
  REGIONS.map((r) => ({ ...r, prefectures: r.prefectures.filter((p) => !props.prefectures.some((q) => q.code === p.code)) })).filter(
    (r) => r.prefectures.length > 0,
  ),
)
const otherSelected = computed(() =>
  props.selected && !props.prefectures.some((p) => p.code === props.selected!.code) ? props.selected.code : '',
)

function onOther(event: Event) {
  const code = (event.target as HTMLSelectElement).value
  const pref = REGIONS.flatMap((r) => r.prefectures).find((p) => p.code === code)
  if (pref) emit('select', pref)
}
</script>

<template>
  <div class="stack">
    <div class="chips" role="group" aria-label="通る都道府県">
      <button v-if="props.national" type="button" class="chip" :aria-pressed="props.selected === null" @click="emit('select', null)">全国</button>
      <button
        v-for="pref in props.prefectures"
        :key="pref.code"
        type="button"
        class="chip"
        :aria-pressed="props.selected?.code === pref.code"
        @click="emit('select', pref)"
      >
        {{ pref.name }}
      </button>
    </div>
    <label v-if="props.others" class="field">
      <span class="field-label">そのほかの都道府県</span>
      <select class="input" :value="otherSelected" @change="onOther">
        <option value="" disabled>通らない都道府県を選ぶ</option>
        <optgroup v-for="region in otherRegions" :key="region.name" :label="region.name">
          <option v-for="pref in region.prefectures" :key="pref.code" :value="pref.code">{{ pref.name }}</option>
        </optgroup>
      </select>
    </label>
  </div>
</template>
