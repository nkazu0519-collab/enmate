<!-- PC では左に内容・右に地図を並べ、スマホでは内容の下に地図を置く -->
<template>
  <div class="split">
    <div class="split-main"><slot /></div>
    <aside class="split-map"><slot name="map" /></aside>
  </div>
</template>

<style scoped>
.split {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 16px 48px;
}

.split-map {
  height: 380px;
  margin-top: 24px;
}

@media (min-width: 1000px) {
  .split {
    display: grid;
    grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1400px;
  }

  .split-map {
    position: sticky;
    top: calc(var(--header-height) + 20px);
    height: calc(100vh - var(--header-height) - 40px);
    margin-top: 0;
  }
}
</style>
