#!/usr/bin/env node

/**
 * Apifox MCP Server 入口。
 *
 * - 解析配置(token / 默认 projectId / baseURL / api 版本)
 * - 启动 MCP server,基于工具注册表注册 list/call handler
 * - 统一错误包装:能力层抛 ApifoxError,这里转成 MCP isError 响应
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { parseConfig } from './config';
import { Apifox } from './apifox';
import { tools, toolMap } from './tools/registry';

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2));
  if (!config.defaultProjectId && !process.env.APIFOX_PROJECT_ID) {
    console.error('Warning: 未配置默认项目(--project / APIFOX_PROJECT_ID),调用工具时需显式传入 projectId');
  }

  const apifox = new Apifox(config);

  const server = new Server(
    { name: 'apifox-mcp-server', version: '2.0.0' },
    { capabilities: { tools: {} } }
  );

  const toolList: Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Tool['inputSchema'],
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolMap.get(name);
    if (!tool) {
      return errorResult(`未知工具: ${name}`);
    }
    try {
      const result = await tool.handler(apifox, (args ?? {}) as Record<string, any>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: any) {
      return errorResult(error?.message ?? String(error));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Apifox MCP Server started');
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
    isError: true,
  };
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
