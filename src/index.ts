#!/usr/bin/env node

/**
 * Apifox MCP Server with Read/Write/Import capabilities
 * 
 * Supported features:
 * - Read project info, folders, endpoint list
 * - Create/Update/Delete endpoints
 * - Import OpenAPI/Swagger data
 * - Create folders and data models
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ApifoxClient, ApifoxConfig } from './apifox-client';
import * as yaml from 'yaml';

// Parse command line arguments
function parseArgs(): ApifoxConfig {
  const args = process.argv.slice(2);
  let projectId = '';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--project=')) {
      projectId = args[i].split('=')[1];
    } else if (args[i] === '--project' && args[i + 1]) {
      projectId = args[i + 1];
      i++;
    }
  }

  const accessToken = process.env.APIFOX_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('Error: APIFOX_ACCESS_TOKEN environment variable is required');
    process.exit(1);
  }

  // projectId 不再强制要求：未提供 --project 时，可由环境变量 APIFOX_PROJECT_ID
  // 兜底，或在每次工具调用时通过 projectId 参数显式指定。
  if (!projectId && !process.env.APIFOX_PROJECT_ID) {
    console.error(
      'Warning: 未配置默认项目（--project / APIFOX_PROJECT_ID），调用工具时需显式传入 projectId'
    );
  }

  return { accessToken, projectId };
}

// projectId 参数定义（每个工具可选传入，用于覆盖默认项目）
const projectIdProp = {
  type: ['string', 'number'],
  description:
    '项目 ID，可选。覆盖启动参数 --project / 环境变量 APIFOX_PROJECT_ID 指定的默认项目',
};

// Define tools
const tools: Tool[] = [
  {
    name: 'apifox_get_project',
    description: '获取 Apifox 项目详情',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
      },
    },
  },
  {
    name: 'apifox_get_folders',
    description: '获取项目所有文件夹（目录结构）',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
      },
    },
  },
  {
    name: 'apifox_get_modules',
    description: '获取项目下的模块列表',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
      },
    },
  },
  {
    name: 'apifox_find_folder',
    description: '根据模块名 + 目录名定位 moduleId 与 folderId',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
        moduleName: {
          type: 'string',
          description: '模块名称，如 "KAZ-PDP -接口"',
        },
        folderName: {
          type: 'string',
          description: '目录名称，如 "Client-Image"',
        },
      },
      required: ['moduleName', 'folderName'],
    },
  },
  {
    name: 'apifox_create_folder',
    description: '创建新文件夹',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '文件夹名称',
        },
        parentId: {
          type: 'number',
          description: '父文件夹 ID，0 表示根目录',
        },
        projectId: projectIdProp,
      },
      required: ['name'],
    },
  },
  {
    name: 'apifox_get_endpoints',
    description: '获取项目所有接口列表',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: ['string', 'number'],
          description: '模块 ID，可选。模块化项目建议指定,以获取对应模块下的接口',
        },
        projectId: projectIdProp,
      },
    },
  },
  {
    name: 'apifox_get_endpoint',
    description: '获取指定接口详情',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: {
          type: 'number',
          description: '接口 ID',
        },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
  },
  {
    name: 'apifox_create_endpoint',
    description: '创建新接口',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '接口名称',
        },
        method: {
          type: 'string',
          description: 'HTTP 方法 (GET, POST, PUT, DELETE, PATCH)',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        },
        path: {
          type: 'string',
          description: '接口路径，如 /api/users',
        },
        folderId: {
          type: 'number',
          description: '所属文件夹 ID',
        },
        description: {
          type: 'string',
          description: '接口描述',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表',
        },
        projectId: projectIdProp,
      },
      required: ['name', 'method', 'path'],
    },
  },
  {
    name: 'apifox_update_endpoint',
    description: '更新接口信息',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: {
          type: 'number',
          description: '接口 ID',
        },
        name: {
          type: 'string',
          description: '接口名称',
        },
        method: {
          type: 'string',
          description: 'HTTP 方法',
        },
        path: {
          type: 'string',
          description: '接口路径',
        },
        description: {
          type: 'string',
          description: '接口描述',
        },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
  },
  {
    name: 'apifox_delete_endpoint',
    description: '删除接口',
    inputSchema: {
      type: 'object',
      properties: {
        apiId: {
          type: 'number',
          description: '接口 ID',
        },
        projectId: projectIdProp,
      },
      required: ['apiId'],
    },
  },
  {
    name: 'apifox_import_openapi',
    description: '导入 OpenAPI/Swagger 数据到项目',
    inputSchema: {
      type: 'object',
      properties: {
        spec: {
          type: 'string',
          description: 'OpenAPI/Swagger 规范内容（JSON 或 YAML 格式字符串）',
        },
        targetFolderId: {
          type: 'number',
          description: '目标文件夹 ID，0 表示根目录',
        },
        coverExistApi: {
          type: 'boolean',
          description: '是否覆盖已存在的接口，默认 true',
        },
        coverExistSchema: {
          type: 'boolean',
          description: '是否覆盖已存在的数据模型，默认 true',
        },
        syncFolder: {
          type: 'boolean',
          description: '是否同步文件夹结构，默认 true',
        },
        projectId: projectIdProp,
      },
      required: ['spec'],
    },
  },
  {
    name: 'apifox_import_openapi_from_url',
    description: '通过 URL 导入 OpenAPI/Swagger 数据',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'OpenAPI/Swagger 规范文件的 URL',
        },
        targetFolderId: {
          type: 'number',
          description: '目标文件夹 ID',
        },
        coverExistApi: {
          type: 'boolean',
          description: '是否覆盖已存在的接口',
        },
        projectId: projectIdProp,
      },
      required: ['url'],
    },
  },
  {
    name: 'apifox_get_schemas',
    description: '获取项目所有数据模型',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
      },
    },
  },
  {
    name: 'apifox_create_schema',
    description: '创建数据模型',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '模型名称',
        },
        description: {
          type: 'string',
          description: '模型描述',
        },
        jsonSchema: {
          type: 'object',
          description: 'JSON Schema 定义',
        },
        folderId: {
          type: 'number',
          description: '所属文件夹 ID',
        },
        projectId: projectIdProp,
      },
      required: ['name', 'jsonSchema'],
    },
  },
  {
    name: 'apifox_export_openapi',
    description: '导出项目为 OpenAPI 格式',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: projectIdProp,
      },
    },
  },
];

// Main function
async function main() {
  const config = parseArgs();
  const client = new ApifoxClient(config);

  const server = new Server(
    {
      name: 'apifox-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: any;
      // MCP 层的 projectId 仅用于路由到目标项目，不会透传进 Apifox 请求体
      const projectId = args?.projectId as string | number | undefined;

      switch (name) {
        case 'apifox_get_project':
          result = await client.getProject(projectId);
          break;

        case 'apifox_get_folders':
          result = await client.getFolders(projectId);
          break;

        case 'apifox_get_modules':
          result = await client.getModules(projectId);
          break;

        case 'apifox_find_folder':
          result = await client.findFolder({
            moduleName: args?.moduleName as string,
            folderName: args?.folderName as string,
            projectId,
          });
          break;

        case 'apifox_create_folder':
          result = await client.createFolder({
            name: args?.name as string,
            parentId: args?.parentId as number,
          }, projectId);
          break;

        case 'apifox_get_endpoints':
          result = await client.getEndpoints(projectId, args?.moduleId as string | number);
          break;

        case 'apifox_get_endpoint':
          result = await client.getEndpoint(args?.apiId as number, projectId);
          break;

        case 'apifox_create_endpoint':
          result = await client.createEndpoint({
            name: args?.name as string,
            method: args?.method as string,
            path: args?.path as string,
            folderId: args?.folderId as number,
            description: args?.description as string,
            tags: args?.tags as string[],
          }, projectId);
          break;

        case 'apifox_update_endpoint':
          result = await client.updateEndpoint(args?.apiId as number, {
            name: args?.name as string,
            method: args?.method as string,
            path: args?.path as string,
            description: args?.description as string,
          }, projectId);
          break;

        case 'apifox_delete_endpoint':
          result = await client.deleteEndpoint(args?.apiId as number, projectId);
          break;

        case 'apifox_import_openapi': {
          let spec = args?.spec as string;
          // Try to parse YAML format
          try {
            if (spec.trim().startsWith('{')) {
              // Already JSON
              spec = spec;
            } else {
              // Try to parse as YAML and convert to JSON
              const parsed = yaml.parse(spec);
              spec = JSON.stringify(parsed);
            }
          } catch (e) {
            // Keep as is
          }
          result = await client.importOpenAPI(spec, {
            targetFolderId: args?.targetFolderId as number,
            coverExistApi: args?.coverExistApi as boolean,
            coverExistSchema: args?.coverExistSchema as boolean,
            syncFolder: args?.syncFolder as boolean,
          }, projectId);
          break;
        }

        case 'apifox_import_openapi_from_url':
          result = await client.importOpenAPIFromURL(args?.url as string, {
            targetFolderId: args?.targetFolderId as number,
            coverExistApi: args?.coverExistApi as boolean,
          }, projectId);
          break;

        case 'apifox_get_schemas':
          result = await client.getSchemas(projectId);
          break;

        case 'apifox_create_schema':
          result = await client.createSchema({
            name: args?.name as string,
            description: args?.description as string,
            jsonSchema: args?.jsonSchema,
            folderId: args?.folderId as number,
          }, projectId);
          break;

        case 'apifox_export_openapi':
          result = await client.exportOpenAPI(projectId);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Apifox MCP Server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
