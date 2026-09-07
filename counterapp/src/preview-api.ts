type EventPayload = Record<string, unknown>;
type AskOptions = { timeoutMs?: number };

type GuestRuntimeBridge = {
  __rill_emitEvent?: (eventName: string, payload?: unknown) => void;
  __rill_onHostEvent?: (
    eventName: string,
    callback: (payload: unknown) => void
  ) => () => void;
};

// 预览器使用的请求与响应事件配对，避免依赖 askit feature 分支才提供的旧 ask API。
const responseEvents: Record<string, string> = {
  GET_APP_INFO: 'SEND_APP_INFO',
  GET_LANGUAGE_LIST: 'LANGUAGE_LIST',
  SET_APP_LANGUAGE: 'SET_APP_LANGUAGE_RESULT',
  SET_TOOLBOX_ENTRIES: 'SET_TOOLBOX_ENTRIES_RESULT',
  CLEAR_CHAT_HISTORY: 'CLEAR_CHAT_HISTORY_RESULT',
  CLOSE_EXTENSION: 'CLOSE_EXTENSION_RESULT',
  SEND_EMAIL: 'SEND_EMAIL_RESULT',
  HTTP_REQUEST: 'HTTP_RESPONSE',
};

type PendingRequest = {
  requestEvent: string;
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// 记录尚未收到宿主响应的 guest 请求。
const pendingRequests = new Map<string, PendingRequest>();
// 每种响应事件只注册一个监听器，避免组件重复渲染造成监听器泄漏。
const responseSubscriptions = new Map<string, () => void>();
let requestSequence = 0;

// 为每个请求生成唯一 ID，让并发调用可以匹配各自的响应。
function nextRequestId(requestEvent: string): string {
  requestSequence += 1;
  return `${requestEvent}-${requestSequence}`;
}

// 惰性订阅宿主响应事件，只有真正调用某个请求时才建立监听。
function ensureResponseSubscription(responseEvent: string): boolean {
  if (responseSubscriptions.has(responseEvent)) return true;

  const bridge = globalThis as GuestRuntimeBridge;
  const onHostEvent = bridge.__rill_onHostEvent;

  // Keel 注入这两个全局函数；缺失时说明当前代码不在 guest 沙箱中。
  if (typeof onHostEvent !== 'function') return false;

  const remove = onHostEvent(responseEvent, (payload) => {
    const response = (payload ?? {}) as EventPayload;
    const requestId = String(response.requestId ?? '');
    const key = `${responseEvent}:${requestId}`;
    const pending = pendingRequests.get(key);

    // 无匹配请求通常是超时后的迟到响应，直接丢弃即可。
    if (!pending) return;

    pendingRequests.delete(key);
    clearTimeout(pending.timer);

    // 宿主明确返回失败时，将业务错误传递给调用方而不是静默 resolve。
    if (response.success === false) {
      pending.reject(new Error(`[ask] ${pending.requestEvent} failed: ${String(response.error ?? '')}`));
      return;
    }

    const businessPayload = { ...response };
    delete businessPayload.requestId;
    pending.resolve(businessPayload);
  });

  responseSubscriptions.set(responseEvent, remove);
  return true;
}

// 预览器内部的 ask 请求接口，行为与旧 askit ask.call 保持一致。
export const ask = {
  call<T = EventPayload>(
    requestEvent: string,
    payload: EventPayload = {},
    options: AskOptions = {}
  ): Promise<T> {
    const responseEvent = responseEvents[requestEvent];

    // 未声明的请求无法匹配响应事件，尽早失败并给出明确错误。
    if (!responseEvent) {
      return Promise.reject(new Error(`[ask] Unsupported request: ${requestEvent}`));
    }

    const requestId = nextRequestId(requestEvent);
    const key = `${responseEvent}:${requestId}`;
    const timeoutMs = options.timeoutMs ?? 10000;
    // 没有 Keel 响应通道时立即失败，避免创建一个必然超时的 pending 请求。
    if (!ensureResponseSubscription(responseEvent)) {
      return Promise.reject(new Error('[ask] Guest response bridge is unavailable'));
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(key);
        reject(new Error(`[ask] Timeout: ${requestEvent} -> ${responseEvent}`));
      }, timeoutMs);

      pendingRequests.set(key, {
        requestEvent,
        resolve: resolve as (payload: unknown) => void,
        reject,
        timer,
      });
      const emitEvent = (globalThis as GuestRuntimeBridge).__rill_emitEvent;

      // 请求必须通过 Keel 当前 runtime bridge 发送到宿主。
      if (typeof emitEvent !== 'function') {
        clearTimeout(timer);
        pendingRequests.delete(key);
        reject(new Error('[ask] Guest runtime bridge is unavailable'));
        return;
      }

      emitEvent(requestEvent, { ...payload, requestId });
    });
  },

  // 发送无需响应的单向事件，保留与旧 ask API 相同的调用语义。
  send(event: string, payload?: EventPayload): void {
    const emitEvent = (globalThis as GuestRuntimeBridge).__rill_emitEvent;
    if (typeof emitEvent !== 'function') return;
    emitEvent(event, payload);
  },

  // 订阅宿主主动推送的事件。
  on(event: string, listener: (payload: unknown) => void): () => void {
    const onHostEvent = (globalThis as GuestRuntimeBridge).__rill_onHostEvent;
    if (typeof onHostEvent !== 'function') return () => {};
    return onHostEvent(event, listener);
  },
};

type HttpResponse<T> = {
  data: T;
  status: number;
  success: boolean;
};

// 通过同一套 guest-host 事件通道提供 HTTP 请求能力。
export const http = {
  get<T>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return ask.call<HttpResponse<T>>('HTTP_REQUEST', {
      headers,
      method: 'GET',
      url,
    });
  },

  post<T>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return ask.call<HttpResponse<T>>('HTTP_REQUEST', {
      body,
      headers,
      method: 'POST',
      url,
    });
  },
};
