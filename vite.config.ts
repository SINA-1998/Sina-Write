import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sina Write',
        short_name: 'SinaWrite',
        description: "Sina's Personal Text Editor",
        theme_color: '#0f172a', // رنگ تیره و شیک برای نوار بالای گوشی
        background_color: '#0f172a',
        display: 'standalone', // اجرای تمام‌صفحه و بدون مرورگر
        icons: [
          {
            // یک آیکون موقت و زیبا برای روی صفحه گوشی شما
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})