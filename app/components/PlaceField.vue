<script setup lang="ts">
// 場所を名前で検索して1つ選ぶ欄。検索するのは「検索」を押した時だけ（入力中には呼ばない）
import { searchPlaces } from '~/services/place'
import type { Place } from '~/types/plan'

const props = defineProps<{ label: string; placeholder: string }>()
const selected = defineModel<Place | null>({ required: true })

const word = ref('')
const searching = ref(false)
const results = ref<Place[] | null>(null)
const error = ref('')

async function search() {
  const query = word.value.trim()
  if (query === '' || searching.value) return
  searching.value = true
  error.value = ''
  results.value = null
  try {
    results.value = await searchPlaces(query)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '検索に失敗しました。もう一度押してください。'
  } finally {
    searching.value = false
  }
}

function choose(place: Place) {
  selected.value = place
  results.value = null
  word.value = ''
}

function clear() {
  selected.value = null
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ props.label }}</span>

    <div v-if="selected" class="selected">
      <div>
        <p class="selected-name">✓ {{ selected.name }}</p>
        <p class="muted">{{ [selected.category, selected.address].filter(Boolean).join('・') }}</p>
      </div>
      <button type="button" class="btn btn-small" @click="clear">変える</button>
    </div>

    <template v-else>
      <form class="search-row" @submit.prevent="search">
        <input v-model="word" class="input" type="search" :placeholder="props.placeholder" :aria-label="`${props.label}の名前`" maxlength="50" />
        <button type="submit" class="btn" :disabled="searching || word.trim() === ''">
          {{ searching ? '検索中…' : '検索' }}
        </button>
      </form>

      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <p v-else-if="results && results.length === 0" class="notice notice-warn">
        見つかりませんでした。名前を変えて、もう一度検索してください。
      </p>
      <ul v-else-if="results" class="results">
        <li v-for="place in results" :key="place.spotCode ?? `${place.lat},${place.lon}`">
          <button type="button" class="result" @click="choose(place)">
            <span class="result-name">{{ place.name }}</span>
            <span class="muted">{{ [place.category, place.address].filter(Boolean).join('・') }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.search-row {
  display: flex;
  gap: 8px;
}

.search-row .btn {
  flex-shrink: 0;
}

.selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--color-primary-soft);
}

.selected-name {
  font-weight: 600;
}

.notice {
  margin-top: 8px;
}

.results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.results li + li {
  border-top: 1px solid var(--color-border);
}

.result {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.result:hover {
  background: var(--color-primary-soft);
}

.result-name {
  font-weight: 600;
}
</style>
