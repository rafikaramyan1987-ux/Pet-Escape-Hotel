import { defineConfig } from 'vitest/config';

export default defineConfig({ define: { __PLATFORM__: JSON.stringify('web') }, test: { include: ['tests/**/*.test.ts'], environment: 'node' } });
