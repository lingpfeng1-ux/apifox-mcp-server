/**
 * opt-in 集成 smoke(默认被 vitest.config.ts 排除)。
 *
 * 运行方式(真实打 Apifox API,有副作用,自带清理):
 *   APIFOX_RUN_INTEGRATION=1 \
 *   APIFOX_ACCESS_TOKEN=<token> \
 *   APIFOX_TEST_PROJECT_ID=<projectId> \
 *   APIFOX_TEST_MODULE_ID=<moduleId> \
 *   npx vitest run __tests__/smoke.integration.test.ts
 *
 * 只读步骤(get_project / list_modules / list_endpoints / list_folders)无副作用;
 * 接口 CRUD(create/update/delete)受 APIFOX_RUN_WRITE=1 二次开关控制,默认跳过。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseConfig } from '../src/config';
import { Apifox } from '../src/apifox';

const RUN = process.env.APIFOX_RUN_INTEGRATION === '1';
const RUN_WRITE = process.env.APIFOX_RUN_WRITE === '1';
const PROJECT_ID = process.env.APIFOX_TEST_PROJECT_ID;
const MODULE_ID = process.env.APIFOX_TEST_MODULE_ID ? Number(process.env.APIFOX_TEST_MODULE_ID) : undefined;

const d = RUN ? describe : describe.skip;

d('集成 smoke(真实 API)', () => {
  // 惰性构造:跳过(未开启集成)时不读取 token,避免 CI 无 token 时在收集阶段抛错
  let apifox: Apifox;
  beforeAll(() => {
    apifox = new Apifox(parseConfig([]));
  });

  it('get_project 可用', async () => {
    const p = await apifox.projects.getProject(PROJECT_ID);
    expect(p?.id).toBeDefined();
  });

  it('list_modules 可用', async () => {
    const m = await apifox.projects.listModules(PROJECT_ID);
    expect(Array.isArray(m)).toBe(true);
  });

  it('list_endpoints 可用', async () => {
    const e = await apifox.endpoints.list(PROJECT_ID, MODULE_ID);
    expect(Array.isArray(e)).toBe(true);
  });

  const writeIt = RUN_WRITE ? it : it.skip;
  writeIt('接口 CRUD(create -> update -> delete)闭环', async () => {
    const created = await apifox.endpoints.create(
      { name: '__smoke_crud__', method: 'POST', path: '/__smoke_crud__/ping', description: 'smoke' },
      PROJECT_ID
    );
    expect(created.id).toBeDefined();
    try {
      const updated = await apifox.endpoints.update(created.id, { name: '__smoke_crud__updated' }, PROJECT_ID);
      expect(updated).toBeTruthy();
    } finally {
      await apifox.endpoints.remove(created.id, PROJECT_ID, true);
    }
  });
});
