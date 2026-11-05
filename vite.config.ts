import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /poker/; locally it stays at the root.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
