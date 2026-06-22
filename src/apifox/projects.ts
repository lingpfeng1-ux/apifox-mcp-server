/**
 * 项目与模块能力。
 */

import { HttpClient } from './http';
import { ApifoxModule } from './types';
import { ApifoxError } from '../errors';

export class ProjectService {
  constructor(private readonly http: HttpClient) {}

  /** 项目详情 */
  async getProject(projectId?: string | number): Promise<any> {
    const pid = this.http.resolveProjectId(projectId);
    const body = await this.http.get(`/api/v1/projects/${pid}`);
    return body?.data ?? body;
  }

  /** 模块列表 */
  async listModules(projectId?: string | number): Promise<ApifoxModule[]> {
    const pid = this.http.resolveProjectId(projectId);
    const body = await this.http.get(`/api/v1/projects/${pid}/modules`);
    return (body?.data ?? body) as ApifoxModule[];
  }

  /**
   * 按名称解析模块,优先精确匹配,再用去空白的宽松匹配兜底(模块名常含多余空格)。
   * 找不到抛出 ApifoxError(带可用模块名)。
   */
  async resolveModule(moduleName: string, projectId?: string | number): Promise<ApifoxModule> {
    const modules = await this.listModules(projectId);
    const found = matchByName(modules, moduleName);
    if (!found) {
      const names = modules.map((m) => m.name).join(', ');
      throw new ApifoxError(`未找到模块「${moduleName}」。可用模块:${names}`);
    }
    return found;
  }
}

/** 名称匹配:精确优先,去空白+忽略大小写兜底 */
export function matchByName<T extends { name: string }>(list: T[], name: string): T | undefined {
  const exact = list.find((x) => x.name === name);
  if (exact) return exact;
  const norm = (s: string) => String(s).replace(/\s+/g, '').toLowerCase();
  const target = norm(name);
  return list.find((x) => norm(x.name) === target);
}
