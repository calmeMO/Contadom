import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/contadom/',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    allowedHosts: ["c512-38-44-126-6.ngrok-free.app"], // Agrega el host permitido
  }
});
