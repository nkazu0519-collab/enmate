<script setup lang="ts">
// 場所を名前で検索して1つ選ぶ欄（仕様書 §4.9）。検索するのは「検索」を押した時だけ（入力中には呼ばない。設計書 §3.2）
import { searchPlaces } from '~/services/place'
import type { Place } from '~/types/plan'

const props = defineProps<{ label: string; placeholder: string; venueOnly?: boolean }>()
const selected = defineModel<Place | null>({ required: true })

const FIRST_COUNT = 5
// 会場の候補は、スタジアム・球場・アリーナ・ホール・劇場・ライブハウス・競馬場などの施設に絞る（種類のないスポットは残す）
const VENUE_CODES = ['0102013', '0102015', '0106003', '0106004', '0106009', '0107001']
const isVenue = (place: Place) => !place.categoryCode || VENUE_CODES.some((code) => place.categoryCode!.startsWith(code))

const word = ref('')
const searched = ref('')
const searching = ref(false)
const results = ref<Place[] | null>(null)
const showAll = ref(false)
const error = ref('')

async function search() {
  const query = word.value.trim()
  if (query === '' || searching.value) return
  searching.value = true
  error.value = ''
  results.value = null
  showAll.value = false
  try {
    const places = await searchPlaces(query)
    results.value = props.venueOnly ? places.filter(isVenue) : places
    searched.value = query
  } catch (e) {
    error.value = e instanceof Error ? e.message : '検索に失敗しました。もう一度押してください。'
  } finally {
    searching.value = false
  }
}

const shown = computed(() => (results.value && !showAll.value ? results.value.slice(0, FIRST_COUNT) : (results.value ?? [])))
const isSelected = (place: Place) => selected.value?.lat === place.lat && selected.value?.lon === place.lon

function choose(place: Place) {
  selected.value = place
  results.value = null
  word.value = ''
}

const spotUrl = (code: string) => `https://www.navitime.co.jp/poi?spt=${encodeURIComponent(code)}`
</script>

<template>
  <div class="field">
    <span class="field-label">{{ props.label }}</span>

    <div v-if="selected" class="selected">
      <div>
        <p class="selected-name">{{ selected.name }}</p>
        <p class="muted">✓ 設定済み<template v-if="selected.address">・{{ selected.address }}</template></p>
      </div>
    </div>

    <form class="search-row" @submit.prevent="search">
      <input v-model="word" class="input" type="search" :placeholder="selected ? '別の場所を検索' : props.placeholder" :aria-label="`${props.label}の名前`" maxlength="50" />
      <button type="submit" class="btn" :disabled="searching || word.trim() === ''">
        {{ searching ? '検索中…' : '検索' }}
      </button>
    </form>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
    <p v-else-if="results && results.length === 0" class="notice notice-warn">見つかりませんでした。</p>
    <div v-else-if="results" class="results-box">
      <div class="results-head">
        <p class="results-title">{{ props.label }}を選ぶ</p>
        <button type="button" class="btn btn-small" @click="results = null">✕ 閉じる</button>
      </div>
      <p class="muted results-count">「{{ searched }}」の検索結果（{{ results.length }}件）です</p>
      <ul class="results">
        <!-- カードを押して選ぶ（本人の修正、2026-10-01。「ここにする」のボタンはなくした）。キーボードでは Enter・スペースで選ぶ -->
        <li
          v-for="place in shown"
          :key="place.spotCode ?? `${place.lat},${place.lon}`"
          class="result"
          :class="{ 'result-choosable': !isSelected(place) }"
          :role="isSelected(place) ? undefined : 'button'"
          :tabindex="isSelected(place) ? undefined : 0"
          :aria-label="isSelected(place) ? undefined : `${place.name}を${props.label}にする`"
          @click="!isSelected(place) && choose(place)"
          @keydown.enter.prevent="!isSelected(place) && choose(place)"
          @keydown.space.prevent="!isSelected(place) && choose(place)"
        >
          <div class="result-body">
            <p class="result-name">{{ place.name }}</p>
            <p class="muted">{{ [place.category, place.address].filter(Boolean).join('・') }}</p>
            <a v-if="place.spotCode" class="result-link" :href="spotUrl(place.spotCode)" target="_blank" rel="noopener" @click.stop @keydown.enter.stop @keydown.space.stop>NAVITIMEで詳しく見る↗</a>
          </div>
          <span v-if="isSelected(place)" class="muted">✓ {{ props.label }}に設定済み</span>
        </li>
      </ul>
      <div v-if="results.length > FIRST_COUNT && !showAll" class="results-more">
        <button type="button" class="btn btn-block" @click="showAll = true">もっと見る（あと{{ results.length - FIRST_COUNT }}件）</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field > * + * {
  margin-top: 8px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-row .btn {
  flex-shrink: 0;
}

.selected {
  padding: 10px 14px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--color-primary-soft);
}

.selected-name {
  font-weight: 600;
}

/* 検索結果の行は大きな枠の端から端まで広げ、行どうしは線だけで区切る（2026-10-02 本人の指摘） */
.results-box {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 0;
}

.results-title {
  font-weight: 700;
}

.results-count {
  padding: 4px 14px 10px;
}

.results {
  margin: 0;
  padding: 0;
  list-style: none;
}

.result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--color-border);
}

.result-choosable {
  cursor: pointer;
}

.result-choosable:hover {
  background: var(--color-primary-soft);
}

/* 枠で切れないよう、内側に線を引く */
.result-choosable:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.results-more {
  padding: 10px 14px;
  border-top: 1px solid var(--color-border);
}

.result-body {
  min-width: 0;
}

.result-name {
  font-weight: 600;
  line-height: 1.4;
}

.result-link {
  font-size: 0.875rem;
}

.result .btn {
  flex: none;
}
</style>
