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
    description: '获取接口列表,可按模块过滤',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: ['string', 'number'], description: '模块 ID,可选。模块化项目建议指定' },
        projectId: projectIdProp,
      },
    },
    handler: (apifox, args) => apifox.endpoints.list(args.projectId, args.moduleId),
  },
  {
    name: 'apifox_get_endpoint',
    description: '获取指定接口详情',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: { type: 'number', description: '接口 ID' },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
    handler: (apifox, args) => apifox.endpoints.get(args.apiId, args.projectId),
  },
  {
    name: 'apifox_create_endpoint',
    description: '创建新接口',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '接口名称' },
        method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        path: { type: 'string', description: '接口路径,如 /api/users' },
        folderId: { type: 'number', description: '所属文件夹 ID' },
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
    handler: (apifox, args) =>
      apifox.endpoints.create(
        {
          name: args.name,
          method: args.method,
          path: args.path,
          folderId: args.folderId,
          description: args.description,
          tags: args.tags,
          parameters: args.parameters,
          requestBody: args.requestBody,
          responses: args.responses,
        },
        args.projectId
      ),
  },
  {
    name: 'apifox_update_endpoint',
    description: '更新接口信息(复杂结构建议先用 get_endpoint 拿到现有结构,改完再整体传入)',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: { type: 'number', description: '接口 ID' },
        name: { type: 'string', description: '接口名称' },
        method: { type: 'string', description: 'HTTP 方法' },
        path: { type: 'string', description: '接口路径' },
        description: { type: 'string', description: '接口描述' },
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
    handler: (apifox, args) =>
      apifox.endpoints.update(
        args.apiId,
        {
          name: args.name,
          method: args.method,
          path: args.path,
          description: args.description,
          parameters: args.parameters,
          requestBody: args.requestBody,
          responses: args.responses,
        },
        args.projectId
      ),
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
      '列出项目的数据模型(只读)。注:数据模型的创建只能通过 import_openapi,' +
      '修改/删除需在 Apifox UI 操作(写端点对 personal token 返回 302)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: ['string', 'number'], description: '模块 ID,可选,按模块过滤' },
        projectId: projectIdProp,
      },
    },
    handler: (apifox, args) => apifox.schemas.list(args.projectId, args.moduleId),
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

export const toolMap: Map<string, ToolDef> = new Map(tools.map((t) => [t.name, t]));
