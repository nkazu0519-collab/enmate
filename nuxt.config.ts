// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // プランをブラウザ（localStorage）に保存するので、画面はブラウザ側だけで組み立てる
  ssr: false,
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'ja' },
      title: 'えんメイト',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      // トップ画面の見出しと数字に使う文字（Google Fonts）
      link: [
        // アイコン（元の画像は本人が Gemini で作成。タブ用は車の部分を切り出し、ホーム画面用は全体）
        { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&display=swap' },
      ],
    },
  },
})
