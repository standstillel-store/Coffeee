import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` membuat hasil build memakai URL relatif, jadi bisa di-host
// di root domain maupun di sub-folder tanpa mengubah konfigurasi.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Gambar produk dan font sengaja tidak di-inline: itu aset yang ingin
    // Anda ganti sendiri lewat folder public/.
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
