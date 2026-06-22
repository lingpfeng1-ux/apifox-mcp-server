import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // 集成 smoke(*.integration.test.ts)在无 APIFOX_RUN_INTEGRATION 时会被 describe.skip 跳过,
    // 因此无需在此排除;普通 npm test 会显示为 skipped。
  },
});
