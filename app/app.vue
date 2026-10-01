<script setup lang="ts">
const route = useRoute()
// 一覧と作成ページには大きな作成ボタンがあるので、ヘッダーには出さない
const showNewButton = computed(() => route.path !== '/' && route.path !== '/plans/new')
// トップ画面は夜のスタジアムの見た目なので、ヘッダーも暗くする
const isTop = computed(() => route.path === '/')
</script>

<template>
  <div>
    <header class="app-header" :class="{ 'app-header-dark': isTop }">
      <NuxtLink to="/" class="logo">えんメイト</NuxtLink>
      <NuxtLink v-if="showNewButton" to="/plans/new" class="btn btn-small">
        <span class="label-wide">＋新しいプランを作る</span><span class="label-narrow">＋新規プラン</span>
      </NuxtLink>
    </header>
    <NuxtPage />
  </div>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 1100; /* 地図（Leaflet は 1000 まで使う）より手前 */
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-primary-dark);
  text-decoration: none;
}

.label-narrow {
  display: none;
}

@media (max-width: 520px) {
  .label-wide {
    display: none;
  }

  .label-narrow {
    display: inline;
  }
}

.app-header-dark {
  background: #050a1c;
  border-bottom-color: #050a1c;
}

.app-header-dark .logo {
  font-family: 'Dela Gothic One', sans-serif;
  font-weight: 400;
  letter-spacing: 0.05em;
  color: #b6ff3b;
}
</style>
