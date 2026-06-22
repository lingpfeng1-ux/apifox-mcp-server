/**
 * 底层 HTTP 客户端。
 *
 * 职责:
 *  - 统一注入鉴权头与 X-Apifox-Api-Version
 *  - 不跟随重定向(maxRedirects:0),把 3xx 当作"端点对当前 token 不可用"的信号
 *  - 识别 200 空 body(失效端点的典型表现),抛明确异常而不是返回空
 *  - 把 4xx/网络错误归一化为 ApifoxError
 *  - 提供 resolveProjectId(参数 > 默认 > env > 报错)
 *
 * 注意:能力层方法直接返回数据或抛异常,不再用 {success,data,error} 包裹。
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { AppConfig } from '../config';
import { ApifoxError } from '../errors';

export class HttpClient {
  private readonly http: AxiosInstance;
  private readonly defaultProjectId?: string;

  constructor(config: AppConfig, instance?: AxiosInstance) {
    this.defaultProjectId = config.defaultProjectId;
    this.http =
      instance ??
      axios.create({
        baseURL: config.baseURL,
        // 关键:不跟随重定向。失效端点会返回 302 跳到 HTML 帮助页,
        // 跟随会拿到一堆 HTML 或空 body,造成"假成功"。
        maxRedirects: 0,
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          'X-Apifox-Api-Version': config.apiVersion,
        },
        // 自己判定状态码,避免依赖 axios 对 3xx 的抛错差异
        validateStatus: () => true,
      });
  }

  /** 解析本次请求实际使用的项目 ID:参数 > 默认 > 环境变量 > 报错 */
  resolveProjectId(override?: string | number): string {
    const explicit =
      override !== undefined && override !== null && String(override).trim() !== ''
        ? String(override).trim()
        : '';
    if (explicit) return explicit;
    if (this.defaultProjectId) return this.defaultProjectId;
    const env = process.env.APIFOX_PROJECT_ID;
    if (env && env.trim()) return env.trim();
    throw new ApifoxError(
      'projectId 未指定:请在调用参数中传入 projectId,或通过启动参数 --project / 环境变量 APIFOX_PROJECT_ID 配置默认项目'
    );
  }

  async request<T = any>(method: string, path: string, opts: AxiosRequestConfig = {}): Promise<T> {
    let resp;
    try {
      resp = await this.http.request({ method, url: path, ...opts });
    } catch (err: any) {
      // 网络层错误(超时、DNS、连接拒绝等)
      throw new ApifoxError(`请求 ${path} 失败: ${err?.message || String(err)}`, { endpoint: path });
    }

    const { status, data } = resp;

    // 3xx:失效端点典型表现(重定向到帮助页)
    if (status >= 300 && status < 400) {
      throw new ApifoxError(
        `端点 ${path} 返回 ${status} 重定向,该端点可能对当前 access token 不可用`,
        { status, endpoint: path }
      );
    }

    // 4xx/5xx:解析 Apifox 错误体
    if (status >= 400) {
      const obj = data && typeof data === 'object' ? (data as Record<string, any>) : undefined;
      const apiMsg = obj?.errorMessage ?? obj?.message ?? (typeof data === 'string' ? data : '');
      const code = obj?.errorCode;
      throw new ApifoxError(
        `Apifox API 错误 [${path}] HTTP ${status}: ${apiMsg || '(无错误消息)'}`,
        { status, endpoint: path, errorCode: code }
      );
    }

    // 2xx 但空 body:失效端点(如 /api-tree、/schemas GET)典型表现
    if (data === '' || data === null || data === undefined) {
      throw new ApifoxError(
        `端点 ${path} 返回空响应(HTTP ${status}),该端点可能对当前 access token 不可用`,
        { status, endpoint: path }
      );
    }

    return data as T;
  }

  get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('get', path, { params });
  }

  post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('post', path, { data: body });
  }

  put<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('put', path, { data: body });
  }

  delete<T = any>(path: string): Promise<T> {
    return this.request<T>('delete', path);
  }
}
