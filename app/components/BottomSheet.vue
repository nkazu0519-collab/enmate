<script setup lang="ts">
// 立ち寄り先の追加・宿泊先を選ぶ画面の枠（仕様書 §4.4・§4.5）。
// スマホでは下から出るシート、PC では左の列に重ねて出し、右の地図は見えたままにする。Esc キーか背景のクリックで閉じる
// 開いたら「閉じる」へフォーカスを移し、閉じたら開く前の場所へ戻す。
// スマホでは画面を覆うので、Tab でシートの外へ出ないようにする。PC では地図も操作できるので閉じ込めない
const props = defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const sheet = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()
const covers = ref(true) // スマホの幅（画面を覆うシート）か
let opener: HTMLElement | null = null

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key !== 'Tab' || !covers.value || !sheet.value) return
  const items = [...sheet.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const inside = sheet.value.contains(document.activeElement)
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  covers.value = !window.matchMedia('(min-width: 1000px)').matches
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  closeButton.value?.focus()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  // 開いたボタンが残っていれば、そこへ戻す
  if (opener?.isConnected) opener.focus()
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section ref="sheet" class="sheet" role="dialog" :aria-modal="covers ? 'true' : undefined" :aria-label="props.title">
      <header class="sheet-header">
        <h2 class="sheet-title">{{ props.title }}</h2>
        <button ref="closeButton" type="button" class="btn btn-small" @click="emit('close')">✕ 閉じる</button>
      </header>
      <slot />
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: var(--header-height) 0 0 0;
  z-index: 1200;
  background: rgba(31, 41, 51, 0.35);
}

/* スマホ: 下から出るシート */
.sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  max-height: 85%;
  padding: 16px;
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: var(--color-surface);
}

/* PC: 左の列に重ねて出し、右の地図は見えたままにする */
@media (min-width: 1000px) {
  .backdrop {
    right: auto;
    width: min(600px, 45vw);
    background: transparent;
  }

  .sheet {
    top: 0;
    max-height: none;
    border-right: 1px solid var(--color-border);
    border-radius: 0;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.12);
  }
}

.sheet > :deep(* + *) {
  margin-top: 12px;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sheet-title {
  font-size: 1.1rem;
}
</style>
