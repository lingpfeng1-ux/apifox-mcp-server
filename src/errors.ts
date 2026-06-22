/**
 * 统一错误类型：所有能力层抛出的可预期错误都用 ApifoxError，
 * 工具层据此包装成 MCP 错误响应，不再静默吞错或假成功。
 */

export interface ApifoxErrorMeta {
  status?: number;
  endpoint?: string;
  errorCode?: string;
}

export class ApifoxError extends Error {
  readonly status?: number;
  readonly endpoint?: string;
  readonly errorCode?: string;

  constructor(message: string, meta: ApifoxErrorMeta = {}) {
    super(message);
    this.name = 'ApifoxError';
    this.status = meta.status;
    this.endpoint = meta.endpoint;
    this.errorCode = meta.errorCode;
    // 维持 instanceof 在编译到 ES5/ES2020 时正常
    Object.setPrototypeOf(this, ApifoxError.prototype);
  }
}
