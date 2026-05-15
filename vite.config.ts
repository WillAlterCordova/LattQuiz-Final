import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  
  return {
    base: '/', // 🛠️ Forzar que todas las rutas de assets comiencen desde la raíz real
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      assetsDir: 'static', // 🛠️ Cambiamos el nombre de la carpeta interna a 'static' para romper la caché corrupta de Vercel
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
})
