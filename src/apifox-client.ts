/**
 * Apifox API Client
 * Based on Apifox Open API (https://apifox-openapi.apifox.cn/)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// API Base URL
const API_BASE_URL = 'https://api.apifox.com';

// Type definitions
export interface ApifoxConfig {
  accessToken: string;
  // 默认项目 ID（来自 --project 启动参数），可为空，调用时可覆盖
  projectId?: string;
}

export interface ApiFolder {
  id?: number;
  name: string;
  parentId?: number;
  type?: string;
}

export interface ApiEndpoint {
  id?: number;
  name: string;
  method: string;
  path: string;
  folderId?: number;
  status?: string;
  tags?: string[];
  description?: string;
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses?: ApiResponse[];
}

export interface ApiParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: {
    type: string;
    example?: any;
  };
}

export interface ApiRequestBody {
  type: string;
  jsonSchema?: any;
  example?: any;
}

export interface ApiResponse {
  code: number;
  name: string;
  contentType?: string;
  jsonSchema?: any;
}

export interface ImportOpenAPIOptions {
  targetFolderId?: number;
  coverExistApi?: boolean;
  coverExistSchema?: boolean;
  syncFolder?: boolean;
}

export interface FindFolderParams {
  moduleName: string;
  folderName: string;
  projectId?: string | number;
}

export interface FindFolderResult {
  projectId: string;
  moduleId: number;
  folderId: number;
  moduleName: string;
  folderName: string;
}

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Apifox API Client
 */
export class ApifoxClient {
  private client: AxiosInstance;
  // 默认项目 ID（启动参数 --project），调用时可被显式 projectId 覆盖
  private projectId: string;

  constructor(config: ApifoxConfig) {
    this.projectId = config.projectId || '';
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'X-Apifox-Api-Version': '2024-03-28',
      },
    });

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const message = error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;
        throw new Error(`Apifox API Error: ${message}`);
      }
    );
  }

  /**
   * 解析本次请求实际使用的项目 ID。
   * 优先级：调用参数 projectId > 启动参数 --project > 环境变量 APIFOX_PROJECT_ID > 报错。
   */
  resolveProjectId(projectId?: string | number): string {
    const explicit =
      projectId !== undefined && projectId !== null && String(projectId).trim() !== ''
        ? String(projectId).trim()
        : '';
    if (explicit) return explicit;

    if (this.projectId) return this.projectId;

    const envId = process.env.APIFOX_PROJECT_ID;
    if (envId && envId.trim()) return envId.trim();

    throw new Error(
      'projectId 未指定：请在调用参数中传入 projectId，或通过启动参数 --project / 环境变量 APIFOX_PROJECT_ID 配置默认项目'
    );
  }

  /**
   * Get project details
   */
  async getProject(projectId?: string | number): Promise<ApiResult<any>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(`/api/v1/projects/${pid}`);
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all folders (directories)
   */
  async getFolders(projectId?: string | number): Promise<ApiResult<ApiFolder[]>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(
        `/api/v1/projects/${pid}/api-tree`
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create folder
   */
  async createFolder(folder: ApiFolder, projectId?: string | number): Promise<ApiResult<ApiFolder>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.post(
        `/api/v1/projects/${pid}/api-tree-folders`,
        {
          name: folder.name,
          parentId: folder.parentId || 0,
        }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get endpoint list
   * @param moduleId 可选，按模块过滤（模块化项目需要指定模块才能拿到对应接口）
   */
  async getEndpoints(
    projectId?: string | number,
    moduleId?: string | number
  ): Promise<ApiResult<ApiEndpoint[]>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const params: Record<string, any> = {};
      if (moduleId !== undefined && moduleId !== null && String(moduleId).trim() !== '') {
        params.moduleId = moduleId;
      }
      const response = await this.client.get(
        `/api/v1/projects/${pid}/http-apis`,
        { params }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get endpoint details
   */
  async getEndpoint(apiId: number, projectId?: string | number): Promise<ApiResult<ApiEndpoint>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(
        `/api/v1/projects/${pid}/http-apis/${apiId}`
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create endpoint
   */
  async createEndpoint(endpoint: ApiEndpoint, projectId?: string | number): Promise<ApiResult<ApiEndpoint>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.post(
        `/api/v1/projects/${pid}/http-apis`,
        {
          name: endpoint.name,
          method: endpoint.method.toUpperCase(),
          path: endpoint.path,
          folderId: endpoint.folderId || 0,
          status: endpoint.status || 'developing',
          description: endpoint.description || '',
          tags: endpoint.tags || [],
          parameters: {
            path: endpoint.parameters?.filter(p => p.in === 'path') || [],
            query: endpoint.parameters?.filter(p => p.in === 'query') || [],
            header: endpoint.parameters?.filter(p => p.in === 'header') || [],
            cookie: endpoint.parameters?.filter(p => p.in === 'cookie') || [],
          },
          requestBody: endpoint.requestBody,
          responses: endpoint.responses || [],
        }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update endpoint
   */
  async updateEndpoint(
    apiId: number,
    endpoint: Partial<ApiEndpoint>,
    projectId?: string | number
  ): Promise<ApiResult<ApiEndpoint>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.put(
        `/api/v1/projects/${pid}/http-apis/${apiId}`,
        endpoint
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete endpoint
   */
  async deleteEndpoint(apiId: number, projectId?: string | number): Promise<ApiResult<boolean>> {
    try {
      const pid = this.resolveProjectId(projectId);
      await this.client.delete(
        `/api/v1/projects/${pid}/http-apis/${apiId}`
      );
      return { success: true, data: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Import OpenAPI/Swagger data
   */
  async importOpenAPI(
    openAPISpec: string | object,
    options?: ImportOpenAPIOptions,
    projectId?: string | number
  ): Promise<ApiResult<any>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const specData = typeof openAPISpec === 'string'
        ? openAPISpec
        : JSON.stringify(openAPISpec);

      const response = await this.client.post(
        `/api/v1/projects/${pid}/import-data`,
        {
          input: specData,
          inputType: 'openapi',
          options: {
            targetFolderId: options?.targetFolderId || 0,
            coverExistApi: options?.coverExistApi ?? true,
            coverExistSchema: options?.coverExistSchema ?? true,
            syncFolder: options?.syncFolder ?? true,
          },
        }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Import OpenAPI data from URL
   */
  async importOpenAPIFromURL(
    url: string,
    options?: ImportOpenAPIOptions,
    projectId?: string | number
  ): Promise<ApiResult<any>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.post(
        `/api/v1/projects/${pid}/import-data`,
        {
          input: url,
          inputType: 'openapi-url',
          options: {
            targetFolderId: options?.targetFolderId || 0,
            coverExistApi: options?.coverExistApi ?? true,
            coverExistSchema: options?.coverExistSchema ?? true,
            syncFolder: options?.syncFolder ?? true,
          },
        }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get data model list
   */
  async getSchemas(projectId?: string | number): Promise<ApiResult<any[]>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(
        `/api/v1/projects/${pid}/schemas`
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create data model
   */
  async createSchema(schema: {
    name: string;
    description?: string;
    jsonSchema: any;
    folderId?: number;
  }, projectId?: string | number): Promise<ApiResult<any>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.post(
        `/api/v1/projects/${pid}/schemas`,
        {
          name: schema.name,
          description: schema.description || '',
          jsonSchema: schema.jsonSchema,
          folderId: schema.folderId || 0,
        }
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Export project as OpenAPI format
   */
  async exportOpenAPI(projectId?: string | number): Promise<ApiResult<any>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(
        `/api/v1/projects/${pid}/export-openapi`
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取项目下的模块列表
   */
  async getModules(projectId?: string | number): Promise<ApiResult<any[]>> {
    try {
      const pid = this.resolveProjectId(projectId);
      const response = await this.client.get(
        `/api/v1/projects/${pid}/modules`
      );
      return { success: true, data: response.data?.data || response.data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 按模块导出 OpenAPI（目录会以 x-apifox-folder / tag 形式呈现）。
   * 内部方法，供 findFolder 关联目录名与 folderId 使用。
   */
  private async exportModuleOpenAPI(pid: string, moduleId: number): Promise<any> {
    const response = await this.client.post(
      `/api/v1/projects/${pid}/export-openapi`,
      {
        scope: { type: 'ALL', excludedByTags: [] },
        options: {
          includeApifoxExtensionProperties: true,
          addFoldersToTags: true,
        },
        oasVersion: '3.0',
        exportFormat: 'JSON',
        moduleId,
      }
    );
    return response.data;
  }

  /**
   * 根据模块名 + 目录名定位 folderId。
   *
   * 由于当前 Open API（personal token）无法直接访问目录树端点，这里通过三段数据关联得到结果：
   *  1. /modules            —— 模块名 -> moduleId
   *  2. export-openapi(模块) —— method+path -> 目录名(x-apifox-folder)
   *  3. /http-apis?moduleId  —— method+path -> folderId
   * 以 method+path 为连接键，得到 目录名 -> folderId。
   */
  async findFolder(params: FindFolderParams): Promise<ApiResult<FindFolderResult>> {
    try {
      const pid = this.resolveProjectId(params.projectId);

      // 1. 解析模块
      const modulesResp = await this.client.get(`/api/v1/projects/${pid}/modules`);
      const modules: any[] = modulesResp.data?.data || modulesResp.data || [];
      const targetModule = this.matchByName(modules, params.moduleName);
      if (!targetModule) {
        const names = modules.map((m) => m.name).join(', ');
        return { success: false, error: `未找到模块「${params.moduleName}」。可用模块：${names}` };
      }
      const moduleId = Number(targetModule.id);

      // 2. 导出该模块 OpenAPI，建立 method+path -> 目录名
      const openapi = await this.exportModuleOpenAPI(pid, moduleId);
      const folderByKey = new Map<string, string>();
      const paths = openapi?.paths || {};
      for (const [path, methods] of Object.entries<any>(paths)) {
        for (const [method, op] of Object.entries<any>(methods || {})) {
          const folderPath = op?.['x-apifox-folder'];
          if (folderPath != null) {
            folderByKey.set(`${method.toUpperCase()} ${path}`, String(folderPath));
          }
        }
      }

      // 3. 拉取该模块接口，按 method+path 关联 folderId
      const apisResp = await this.client.get(`/api/v1/projects/${pid}/http-apis`, {
        params: { moduleId },
      });
      const apis: any[] = apisResp.data?.data || apisResp.data || [];

      const matchedFolderIds = new Set<number>();
      const availableFolders = new Set<string>();
      for (const api of apis) {
        const key = `${String(api.method).toUpperCase()} ${api.path}`;
        const folderPath = folderByKey.get(key);
        if (folderPath == null) continue;
        availableFolders.add(folderPath);
        if (this.folderPathMatches(folderPath, params.folderName)) {
          matchedFolderIds.add(Number(api.folderId));
        }
      }

      if (matchedFolderIds.size === 0) {
        const names = [...availableFolders].join(', ');
        return {
          success: false,
          error: `模块「${params.moduleName}」下未找到目录「${params.folderName}」。可用目录：${names}`,
        };
      }

      // 命中多个 folderId（极少见，目录重名）时取第一个
      const folderId = [...matchedFolderIds][0];

      return {
        success: true,
        data: {
          projectId: pid,
          moduleId,
          folderId,
          moduleName: targetModule.name,
          folderName: params.folderName,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 按名称匹配，优先精确匹配，再用去空白的宽松匹配兜底（模块名常含多余空格）。
   */
  private matchByName(list: any[], name: string): any | undefined {
    const exact = list.find((x) => x.name === name);
    if (exact) return exact;
    const norm = (s: string) => String(s).replace(/\s+/g, '').toLowerCase();
    const target = norm(name);
    return list.find((x) => norm(x.name) === target);
  }

  /**
   * 判断 folderPath 是否匹配用户给的 folderName。
   * folderPath 可能是多级路径（如 "父目录/子目录"），folderName 为单级目录名。
   * 命中条件：整体相等，或路径最后一段相等（去空白、忽略大小写）。
   */
  private folderPathMatches(folderPath: string, folderName: string): boolean {
    const norm = (s: string) => String(s).replace(/\s+/g, '').toLowerCase();
    const target = norm(folderName);
    if (norm(folderPath) === target) return true;
    const last = folderPath.split('/').pop() || '';
    return norm(last) === target;
  }
}

export default ApifoxClient;
