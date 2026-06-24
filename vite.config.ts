import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { powerApps } from '@microsoft/power-apps-vite';

// https://vite.dev/config/

const CRM_URL = 'https://mpsphase2dev.crm.dynamics.com';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerApps()
  ],
  server: {
    port:5173,
    proxy: {
      // Routes local relative API calls to the authenticated environment
      '/api/data': {
        target: CRM_URL,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 1. Force the outbound headers to match your Dataverse Environment
            proxyReq.setHeader('Origin', CRM_URL);
            proxyReq.setHeader('Host', CRM_URL.replace('https://', ''));
            proxyReq.setHeader('Referer', CRM_URL);

            // 2. Keep the cookie payloads coming from your browser profile intact
            if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
          });
        }
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  }
})
