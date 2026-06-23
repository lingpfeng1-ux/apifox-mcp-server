/**
 * 工具注册表:集中定义所有 MCP 工具的 schema 与 handler。
 * handler 是薄封装:解析参数 -> 调能力层 -> 返回原始数据(由 server 统一包装)。
 */

import { Apifox } from '../apifox';
import * as yaml from 'yaml';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (apifox: Apifox, args: Record<string, any>) => Promise<unknown>;
}

// 可选 projectId:覆盖默认项目
const projectIdProp = {
  type: ['string', 'number'],
  description: '项目 ID,可选。覆盖启动参数 --project / 环境变量 APIFOX_PROJECT_ID 指定的默认项目',
};

export const tools: ToolDef[] = [
  {
    name: 'apifox_get_project',
    description: '获取 Apifox 项目详情',
    inputSchema: { type: 'object', properties: { projectId: projectIdProp } },
    handler: (apifox, args) => apifox.projects.getProject(args.projectId),
  },
  {
    name: 'apifox_list_modules',
    description: '获取项目下的模块列表',
    inputSchema: { type: 'object', properties: { projectId: projectIdProp } },
    handler: (apifox, args) => apifox.projects.listModules(args.projectId),
  },
  {
    name: 'apifox_list_folders',
    description: '列出指定模块下的所有目录(返回 moduleId / folderId / folderName / folderPath)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: '模块名称,如 "KAZ-PDP -接口"' },
        projectId: projectIdProp,
      },
      required: ['moduleName'],
    },
    handler: (apifox, args) => apifox.folders.listFolders(args.moduleName, args.projectId),
  },
  {
    name: 'apifox_find_folder',
    description: '根据模块名 + 目录名定位 moduleId 与 folderId',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: '模块名称,如 "KAZ-PDP -接口"' },
        folderName: { type: 'string', description: '目录名称,如 "Client-Image"' },
        projectId: projectIdProp,
      },
      required: ['moduleName', 'folderName'],
    },
    handler: (apifox, args) => apifox.folders.findFolder(args.moduleName, args.folderName, args.projectId),
  },
  {
    name: 'apifox_list_endpoints',
    description:
      '列出接口索引(精简:id/name/method/path/folderId),可按模块过滤(moduleId 或 moduleName)。' +
      '按关键词精准找接口用 apifox_search_endpoints;拿单个接口完整结构用 apifox_get_endpoint。',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: ['string', 'number'], description: '模块 ID,可选' },
        moduleName: { type: 'string', description: '模块名,可选(替代 moduleId,自动解析)' },
        projectId: projectIdProp,
      },
    },
    handler: async (apifox, args) => {
      const moduleId = await resolveModuleId(apifox, args);
      return apifox.endpoints.list(args.projectId, moduleId);
    },
  },
  {
    name: 'apifox_search_endpoints',
    description:
      '按关键词/方法/目录搜索接口(MCP 层过滤,避免全量列表导致上下文爆炸)。' +
      '返回精简字段(id/name/method/path/folderId),需要完整详情再用 apifox_get_endpoint。' +
      '推荐工作流:search_endpoints 定位 → get_endpoint 拿详情 → update_endpoint 修改。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键词,匹配接口名称或路径(不区分大小写)' },
        method: { type: 'string', description: 'HTTP 方法过滤(GET/POST/PUT/DELETE/PATCH)' },
        folderId: { type: 'number', description: '按目录 ID 过滤(配合 find_folder 使用)' },
        moduleId: { type: ['string', 'number'], description: '模块 ID,可选' },
        moduleName: { type: 'string', description: '模块名,可选(替代 moduleId,自动解析)' },
        limit: { type: 'number', description: '最多返回条数,默认 20,最大 100' },
        projectId: projectIdProp,
      },
    },
    handler: async (apifox, args) => {
      const moduleId = await resolveModuleId(apifox, args);
      return apifox.endpoints.search(args.projectId, {
        keyword: args.keyword,
        method: args.method,
        folderId: args.folderId,
        moduleId,
        limit: args.limit,
      });
    },
  },
  {
    name: 'apifox_get_endpoint',
    description:
      '获取接口详情(默认精简字段:name/method/path/description/parameters/requestBody/responses/folderId/tags/status)。' +
      '若 requestBody/responses 里出现 $ref 引用数据模型,改字段应改模型本身' +
      '(get_schema 拿模型 → 改 → import_openapi schemaOverwriteMode="name"),而不是改接口内联结构。' +
      '需要 Apifox 全量原始字段时传 raw=true。',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: { type: 'number', description: '接口 ID' },
        raw: { type: 'boolean', description: '是否返回全量原始字段,默认 false(精简)' },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
    handler: (apifox, args) => apifox.endpoints.get(args.apiId, args.projectId, args.raw === true),
  },
  {
    name: 'apifox_create_endpoint',
    description: '创建新接口。可传 folderId,或传 folderName(+moduleName)由服务自动解析 folderId。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '接口名称' },
        method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        path: { type: 'string', description: '接口路径,如 /api/users' },
        folderId: { type: 'number', description: '所属目录 ID(已知时直接传)' },
        folderName: { type: 'string', description: '目录名(替代 folderId,需配合 moduleName 自动解析)' },
        moduleName: { type: 'string', description: '模块名(配合 folderName 使用)' },
        description: { type: 'string', description: '接口描述' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
        parameters: {
          type: 'object',
          description: '参数对象 { path, query, header, cookie }(各为参数数组),原样传 Apifox 结构',
        },
        requestBody: { type: 'object', description: '请求体结构(原样传 Apifox 结构)' },
        responses: { type: 'array', description: '响应定义数组(原样传 Apifox 结构)' },
        projectId: projectIdProp,
      },
      required: ['name', 'method', 'path'],
    },
    handler: async (apifox, args) => {
      const folderId = await resolveFolderId(apifox, args);
      return apifox.endpoints.create(
        {
          name: args.name,
          method: args.method,
          path: args.path,
          folderId,
          description: args.description,
          tags: args.tags,
          parameters: args.parameters,
          requestBody: args.requestBody,
          responses: args.responses,
        },
        args.projectId
      );
    },
  },
  {
    name: 'apifox_update_endpoint',
    description:
      '更新接口信息(复杂结构建议先用 get_endpoint 拿现有结构,改完整体传入)。' +
      '注意:若字段定义来自数据模型($ref 引用),应改模型(get_schema → import_openapi schemaOverwriteMode="name"),' +
      '而不是在此把 $ref 改成内联结构。',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: { type: 'number', description: '接口 ID' },
        name: { type: 'string', description: '接口名称' },
        method: { type: 'string', description: 'HTTP 方法' },
        path: { type: 'string', description: '接口路径' },
        description: { type: 'string', description: '接口描述' },
        folderId: { type: 'number', description: '移动到的目录 ID(可选)' },
        folderName: { type: 'string', description: '移动到的目录名(替代 folderId,需配合 moduleName)' },
        moduleName: { type: 'string', description: '模块名(配合 folderName 使用)' },
        parameters: {
          type: 'object',
          description: '参数对象 { path, query, header, cookie },原样传 Apifox 结构',
        },
        requestBody: { type: 'object', description: '请求体结构(原样传 Apifox 结构)' },
        responses: { type: 'array', description: '响应定义数组(原样传 Apifox 结构)' },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
    handler: async (apifox, args) => {
      const folderId = await resolveFolderId(apifox, args);
      return apifox.endpoints.update(
        args.apiId,
        {
          name: args.name,
          method: args.method,
          path: args.path,
          description: args.description,
          ...(folderId !== undefined ? { folderId } : {}),
          parameters: args.parameters,
          requestBody: args.requestBody,
          responses: args.responses,
        },
        args.projectId
      );
    },
  },
  {
    name: 'apifox_delete_endpoint',
    description: '删除接口',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: { type: 'number', description: '接口 ID' },
        verify: { type: 'boolean', description: '删除后是否回查确认,默认 false' },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
    handler: (apifox, args) => apifox.endpoints.remove(args.apiId, args.projectId, args.verify === true),
  },
  {
    name: 'apifox_import_openapi',
    description:
      '导入 OpenAPI/Swagger 数据到项目(支持 JSON 或 YAML 字符串)。' +
      '可创建/更新接口与数据模型:在 spec 的 components.schemas 定义模型、paths 用 $ref 引用。' +
      '改已有数据模型字段:传 schemaOverwriteMode="name" 覆盖更新同名模型(改 required/描述/属性);' +
      '改已有接口:传 apiOverwriteMode="methodAndPath"。',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'string',
          description:
            'OpenAPI/Swagger 规范内容(JSON 或 YAML 字符串)。' +
            '含 components.schemas 时会创建/覆盖对应数据模型,paths 用 $ref 引用',
        },
        schemaOverwriteMode: {
          type: 'string',
          enum: ['ignore', 'name', 'nameAndFolder', 'merge'],
          description: '数据模型同名处理,默认 ignore;覆盖更新已有模型字段用 "name"',
        },
        apiOverwriteMode: {
          type: 'string',
          enum: ['ignore', 'methodAndPath', 'methodAndPathAndFolder', 'merge'],
          description: '接口同名处理,默认 ignore;覆盖更新已有接口用 "methodAndPath"',
        },
        projectId: projectIdProp,
      },
      required: ['spec'],
    },
    handler: (apifox, args) =>
      apifox.importExport.importOpenAPI(toJsonSpec(args.spec), {
        projectId: args.projectId,
        schemaOverwriteMode: args.schemaOverwriteMode,
        apiOverwriteMode: args.apiOverwriteMode,
      }),
  },
  {
    name: 'apifox_export_openapi',
    description: '导出项目/模块为 OpenAPI 格式',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'number', description: '模块 ID,可选。指定则只导出该模块' },
        addFoldersToTags: { type: 'boolean', description: '目录是否输出为 tag,默认 false' },
        projectId: projectIdProp,
      },
    },
    handler: (apifox, args) =>
      apifox.importExport.exportOpenAPI({
        projectId: args.projectId,
        moduleId: args.moduleId,
        addFoldersToTags: args.addFoldersToTags === true,
      }),
  },
  {
    name: 'apifox_list_schemas',
    description:
      '列出数据模型索引(精简:id/name/folderId/description,不含 jsonSchema,避免上下文爆炸)。' +
      '可用 keyword 按名/描述过滤。拿单个模型完整 jsonSchema 用 apifox_get_schema;' +
      '创建/改模型用 import_openapi(schemaOverwriteMode="name");删除用 apifox_delete_schema。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '关键词,匹配模型名或描述(不区分大小写)' },
        moduleId: { type: ['string', 'number'], description: '模块 ID,可选,按模块过滤' },
        moduleName: { type: 'string', description: '模块名,可选(替代 moduleId,自动解析)' },
        limit: { type: 'number', description: '最多返回条数,默认 50,最大 200' },
        projectId: projectIdProp,
      },
    },
    handler: async (apifox, args) => {
      const moduleId = await resolveModuleId(apifox, args);
      return apifox.schemas.list(args.projectId, {
        keyword: args.keyword,
        moduleId,
        limit: args.limit,
      });
    },
  },
  {
    name: 'apifox_get_schema',
    description:
      '获取单个数据模型的完整结构(含 jsonSchema),按 id 或名称定位。' +
      '改模型字段流程:get_schema 拿 jsonSchema → 修改 → update_schema(按 id 精确)传回。',
    inputSchema: {
      type: 'object',
      properties: {
        idOrName: { type: ['number', 'string'], description: '数据模型 ID 或名称' },
        projectId: projectIdProp,
      },
      required: ['idOrName'],
    },
    handler: (apifox, args) => apifox.schemas.get(args.idOrName, args.projectId),
  },
  {
    name: 'apifox_create_schema',
    description:
      '创建新数据模型(只需给模型名 + jsonSchema,内部自动组装 OpenAPI 并导入,无需手搓 spec)。' +
      '若项目已存在同名模型会报错(列出各 id),请改用 update_schema 按 id 精确改,或换一个模型名。' +
      '成功返回 { name, id, created }。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '数据模型名称' },
        jsonSchema: { type: 'object', description: 'JSON Schema 定义,如 { type:"object", properties:{...}, required:[...] }' },
        projectId: projectIdProp,
      },
      required: ['name', 'jsonSchema'],
    },
    handler: (apifox, args) => apifox.schemas.upsert(args.name, args.jsonSchema, args.projectId),
  },
  {
    name: 'apifox_update_schema',
    description:
      '精确更新已有数据模型的结构(PUT /api/v1/api-schemas/{id},按 schema id 精确更新)。' +
      '⚠️ 项目可能存在多个同名模型,务必用接口实际引用的 id:从 get_endpoint(raw=true) 的 ' +
      'requestBody/responses 里的 $ref(#/definitions/{id})取到那个 id 再传入。' +
      '传名称且有多个同名时会报错并列出各 id。jsonSchema 为完整新结构(建议先 get_schema 拿现有改完传)。',
    inputSchema: {
      type: 'object',
      properties: {
        idOrName: { type: ['number', 'string'], description: '数据模型 ID(优先,精确)或名称' },
        jsonSchema: { type: 'object', description: '完整的新 JSON Schema 定义' },
        projectId: projectIdProp,
      },
      required: ['idOrName', 'jsonSchema'],
    },
    handler: (apifox, args) => apifox.schemas.update(args.idOrName, args.jsonSchema, args.projectId),
  },
  {
    name: 'apifox_delete_schema',
    description:
      '删除数据模型(DELETE /api/v1/api-schemas/{id} + X-Project-Id header)。' +
      '⚠️ 不可逆,且引用该模型的接口会变成悬空 $ref。先用 list_schemas 获取 id 并确认无误。',
    inputSchema: {
      type: 'object',
      properties: {
        schemaId: { type: 'number', description: '数据模型 ID(从 list_schemas 返回的 id 字段获取)' },
        projectId: projectIdProp,
      },
      required: ['schemaId'],
    },
    handler: (apifox, args) => apifox.schemas.remove(args.schemaId, args.projectId),
  },
  {
    name: 'apifox_delete_folder',
    description:
      '删除接口目录(DELETE /api/v1/projects/{id}/api-folders/{folderId})。' +
      '⚠️ 会递归删除该目录及其子目录下的所有接口,不可逆。强烈建议先用 dryRun=true 预览;' +
      '传 moduleId 才能统计整棵子树(返回 includesSubfolders=true),否则只统计直接子接口。' +
      'folderId 从 find_folder / list_folders 获取。',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: { type: 'number', description: '目录 ID(从 find_folder 或 list_folders 获取)' },
        dryRun: { type: 'boolean', description: 'true 时只预览将被删除的接口,不真正删除' },
        moduleId: { type: ['string', 'number'], description: '模块 ID,建议传(才能统计子目录接口)' },
        projectId: projectIdProp,
      },
      required: ['folderId'],
    },
    handler: (apifox, args) =>
      apifox.folders.removeFolder(args.folderId, args.projectId, {
        dryRun: args.dryRun === true,
        moduleId: args.moduleId,
      }),
  },
];

/** 把 YAML 或 JSON 字符串统一成 JSON 字符串(import-data 接受 OpenAPI 字符串) */
export function toJsonSpec(spec: string): string {
  const trimmed = spec.trim();
  if (trimmed.startsWith('{')) return trimmed;
  try {
    return JSON.stringify(yaml.parse(spec));
  } catch {
    return spec;
  }
}

/**
 * 解析 folderId:优先用显式 folderId;否则若给了 folderName(+moduleName)则自动 find_folder。
 * 都没给则返回 undefined(根目录 / 不改目录)。
 */
async function resolveFolderId(apifox: Apifox, args: Record<string, any>): Promise<number | undefined> {
  if (args.folderId != null) return args.folderId;
  if (args.folderName && args.moduleName) {
    const r = await apifox.folders.findFolder(args.moduleName, args.folderName, args.projectId);
    return r.folderId;
  }
  return undefined;
}

/**
 * 解析 moduleId:优先用显式 moduleId;否则若给了 moduleName 则用 resolveModule 解析。
 * 与 find_folder/create_endpoint 的 moduleName 用法对齐。
 */
async function resolveModuleId(
  apifox: Apifox,
  args: Record<string, any>
): Promise<string | number | undefined> {
  if (args.moduleId != null && String(args.moduleId).trim() !== '') return args.moduleId;
  if (args.moduleName) {
    const m = await apifox.projects.resolveModule(args.moduleName, args.projectId);
    return m.id;
  }
  return undefined;
}

export const toolMap: Map<string, ToolDef> = new Map(tools.map((t) => [t.name, t]));
