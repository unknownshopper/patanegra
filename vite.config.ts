import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        caja: resolve(__dirname, 'caja.html'),
        mesero: resolve(__dirname, 'mesero.html'),
        almacen: resolve(__dirname, 'almacen.html'),
        login: resolve(__dirname, 'login.html'),
        menu: resolve(__dirname, 'menu.html'),
        menuConfig: resolve(__dirname, 'menu-config.html'),
      },
    },
  },
})
