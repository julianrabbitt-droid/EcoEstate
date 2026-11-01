// Errors the HTTP layer turns into { error: { code, message } } responses.

export class ConfigError extends Error {
  constructor(envVar, message) {
    super(message);
    this.envVar = envVar;
  }
}

export class UpstreamError extends Error {
  constructor(service, status, detail) {
    super(`${service} returned ${status}`);
    this.service = service;
    this.status = status;
    this.detail = detail;
  }
}

// A request problem with a fixed status, code and user-facing message.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Rejects with UpstreamError(service, 'timeout') if the promise hasn't settled
// within ms. For libraries that can't take an AbortSignal on every request.
export function withTimeout(promise, ms, service, detail) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new UpstreamError(service, 'timeout', detail)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
