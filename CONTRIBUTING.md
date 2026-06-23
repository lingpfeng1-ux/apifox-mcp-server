# 贡献指南 / Contributing

感谢参与 Apifox MCP Server 的开发。

## 开发环境

```bash
npm install
npm run build      # tsc 编译到 dist/
npm test           # 单元测试(mock HTTP,无副作用)
npm run test:watch # 监听模式
```

集成 smoke(真实打 Apifox API,默认 skip)见 [README](./README.md#测试)。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` 新功能
- `fix:` 修复
- `perf:` 性能/上下文优化
- `refactor:` 重构
- `docs:` 文档
- `test:` 测试
- `chore:` 杂项

## 代码约定

- TypeScript,分层架构:`tools/`(MCP 工具薄封装) → `apifox/*`(能力层) → `apifox/http.ts`(HTTP)。
- 能力层方法直接返回数据或抛 `ApifoxError`,不要静默吞错或"假成功"。
- 列表/检索类工具返回精简索引,完整结构走 `get_*`,避免污染调用方上下文。
- 新增/修改端点行为时,优先用单元测试(mock HTTP)覆盖;有副作用的集成步骤必须默认 skip + 显式开关。

## PR 流程

1. 从 `main` 切分支
2. 确保 `npm run build` 与 `npm test` 通过(CI 会自动校验)
3. 提交 PR,描述清楚动机与改动范围

## 关于 Apifox 端点

本项目通过个人访问令牌(`afxp_`)调用 Apifox REST API,部分端点有权限边界(见
[`docs/功能与实现方案.md`](./docs/功能与实现方案.md))。新增端点前建议先用 `curl` 或逆向客户端确认其
对 personal token 的可用性与正确参数,再落地到能力层。
