import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Im Entwicklungsmodus leitet Vite API-Aufrufe an das Backend weiter
    proxy: { '/api': 'http://localhost:8095' },
  },
  test: { environment: 'node' },
});
