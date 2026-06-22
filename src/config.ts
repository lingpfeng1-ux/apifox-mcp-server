/**
 * 运行配置解析。
 * token 来自环境变量;默认 projectId / baseURL / apiVersion 可通过启动参数覆盖。
 */

import { ApifoxError } from './errors';

export const DEFAULT_BASE_URL = 'https://api.apifox.com';
export const DEFAULT_API_VERSION = '2024-03-28';

export interface AppConfig {
  accessToken: string;
  // 默认项目 ID(来自 --project),可为空,调用时可由工具参数 projectId 覆盖
  defaultProjectId?: string;
  baseURL: string;
  apiVersion: string;
}

/**
 * 解析命令行参数：
 *   --project=<id> / --project <id>
 *   --base-url=<url>
 *   --api-version=<version>
 * accessToken 始终从环境变量 APIFOX_ACCESS_TOKEN 读取。
 */
export function parseConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): AppConfig {
  let defaultProjectId = '';
  let baseURL = DEFAULT_BASE_URL;
  let apiVersion = DEFAULT_API_VERSION;

  const takeValue = (arg: string, next: string | undefined, prefix: string): string | undefined => {
    if (arg.startsWith(`${prefix}=`)) return arg.slice(prefix.length + 1);
    if (arg === prefix && next) return next;
    return undefined;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    const project = takeValue(arg, next, '--project');
    if (project !== undefined) {
      defaultProjectId = project;
      if (arg === '--project') i++;
      continue;
    }
    const base = takeValue(arg, next, '--base-url');
    if (base !== undefined) {
      baseURL = base;
      if (arg === '--base-url') i++;
      continue;
    }
    const ver = takeValue(arg, next, '--api-version');
    if (ver !== undefined) {
      apiVersion = ver;
      if (arg === '--api-version') i++;
      continue;
    }
  }

  const accessToken = env.APIFOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new ApifoxError('缺少环境变量 APIFOX_ACCESS_TOKEN');
  }

  return {
    accessToken,
    defaultProjectId: defaultProjectId || undefined,
    baseURL,
    apiVersion,
  };
}
