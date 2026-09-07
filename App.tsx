/**
 * askc 预览器：RN + keel 真实运行时 + askit 组件真实现 + fixture 宿主。
 *
 * 与 loom 同一条代码路径（Engine / Bridge / Receiver / JSC），仅宿主业务
 * handler 换成 fixture；askit/main 不再导出旧版 EventHandler，因此业务事件
 * 通过 askit 的 EventEmitter 接入当前 Bridge。
 */
import { useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Engine } from 'keel/host';
import { DefaultComponents, EngineView } from 'keel/host/preset';
import { createEngineAdapter, components as askitComponents } from 'askit/core';
import { EventEmitter } from 'askit';

// 与 Loom extensionPanel.phoneWidthRatio 保持一致，复刻 Phone 宿主的面板宽度。
const PHONE_PANEL_WIDTH_RATIO = 0.8;
// 与 Loom CHAT_HEADER_HEIGHT 保持一致，复刻面板顶部为宿主聊天头部预留的空间。
const CHAT_HEADER_HEIGHT = 70;
// expanded 宿主使用 Loom 的固定右侧面板宽度。
const PAD_PANEL_WIDTH = 400;
// 轮询 guest bundle 版本的间隔；watch 构建完成后让运行中的预览及时重载。
const GUEST_VERSION_POLL_INTERVAL_MS = 500;

type PreviewRuntime = {
  engine: Engine;
  dispose: () => void;
};

type PreviewRequestPayload = Record<string, unknown>;
type PreviewResponsePayload = Record<string, unknown>;
type PreviewHandler = (
  payload: PreviewRequestPayload
) => Promise<PreviewResponsePayload>;

// 将 guest 请求事件映射到 ask 合约约定的响应事件。
const previewResponseEvents: Record<string, string> = {
  GET_APP_INFO: 'SEND_APP_INFO',
  GET_LANGUAGE_LIST: 'LANGUAGE_LIST',
  SET_APP_LANGUAGE: 'SET_APP_LANGUAGE_RESULT',
  SET_TOOLBOX_ENTRIES: 'SET_TOOLBOX_ENTRIES_RESULT',
  CLEAR_CHAT_HISTORY: 'CLEAR_CHAT_HISTORY_RESULT',
  CLOSE_EXTENSION: 'CLOSE_EXTENSION_RESULT',
  SEND_EMAIL: 'SEND_EMAIL_RESULT',
  HTTP_REQUEST: 'HTTP_RESPONSE',
};

// 预览器提供的 fixture 业务处理器，替代 Loom 中真实宿主的业务实现。
const previewHandlers: Record<string, PreviewHandler> = {
  GET_APP_INFO: async () => ({
    appName: 'counterapp（预览）',
    logo: '',
    favoriteCount: 1,
    usedCount: 2,
    author: 'askc-preview',
    languageContents: {
      'zh-Hans': { description: '这是预览器里的应用介绍（fixture 数据）。' },
      en: { description: 'App intro from the preview fixture.' },
      ja: { description: 'プレビューのアプリ紹介です。' },
    },
  }),
  GET_LANGUAGE_LIST: async () => ({
    current: 'zh-Hans',
    languages: ['zh-Hans', 'en', 'ja'],
  }),
  SET_APP_LANGUAGE: async () => ({ success: true }),
  SET_TOOLBOX_ENTRIES: async () => ({ success: true }),
  CLEAR_CHAT_HISTORY: async () => ({ success: true }),
  CLOSE_EXTENSION: async () => ({ success: true }),
  SEND_EMAIL: async () => ({ success: true }),
  HTTP_REQUEST: async (payload) => {
    const url = String(payload.url ?? '');
    const method = String(payload.method ?? 'GET');
    const headers = (payload.headers ?? undefined) as Record<string, string> | undefined;
    const requestBody = payload.body;
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('json') ? await response.json() : await response.text();

    return {
      data,
      status: response.status,
      success: response.ok,
    };
  },
};

/**
 * 注册预览器业务事件，并在请求完成后通过当前 Engine 回传响应。
 * askit/main 已经移除了旧版 EventHandler.setup，业务事件现在走 EventEmitter。
 */
function registerPreviewHandlers(engine: Engine): () => void {
  const removers = Object.entries(previewHandlers).map(([requestEvent, handler]) => {
    const responseEvent = previewResponseEvents[requestEvent];

    // 响应事件缺失时属于预览器配置错误，避免注册一个无法完成请求的监听器。
    if (!responseEvent) {
      throw new Error(`Missing preview response event for ${requestEvent}`);
    }

    return EventEmitter.on(requestEvent, async (payload) => {
      const request = (payload ?? {}) as PreviewRequestPayload;
      const requestId = typeof request.requestId === 'string' ? request.requestId : undefined;

      try {
        const result = await handler(request);
        engine.sendEvent(responseEvent, {
          ...result,
          ...(requestId ? { requestId } : {}),
        });
      } catch (error) {
        // 将宿主异常转成 ask 响应，避免 guest 端只能等待超时。
        engine.sendEvent(responseEvent, {
          error: error instanceof Error ? error.message : String(error),
          requestId,
          success: false,
        });
      }
    });
  });

  return () => {
    removers.forEach((remove) => remove());
  };
}

/**
 * 创建一套与当前 guest bundle 绑定的宿主运行时。
 * bundle 更新后会销毁旧 Engine，再创建新 Engine，避免 EngineView 因 isLoaded
 * 而继续复用旧 bundle。
 */
function createPreviewRuntime(): PreviewRuntime {
  const engine = new Engine({
    debug: false,
    // guest 沙箱的 console 直通到 metro 终端（默认被吞，排障两眼一抹黑）
    logger: {
      log: (...args: unknown[]) => console.log('[guest]', ...args),
      warn: (...args: unknown[]) => console.warn('[guest]', ...args),
      error: (...args: unknown[]) => console.error('[guest]', ...args),
    },
  });
  engine.register({ ...DefaultComponents, ...askitComponents });
  const removePreviewHandlers = registerPreviewHandlers(engine);
  const adapter = createEngineAdapter(engine);
  let disposed = false;

  return {
    engine,
    dispose: () => {
      // dispose 可能同时被 bundle 重载和组件卸载触发，只执行一次清理。
      if (disposed) return;
      disposed = true;
      removePreviewHandlers();
      adapter.dispose();
      engine.destroy();
    },
  };
}

export default function App() {
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  // 用于在 bundle 更新后触发 App 重渲染，让 EngineView 接收到新的 Engine 实例。
  const [, setRuntimeRevision] = useState(0);
  // 读取真实窗口宽度，让预览面板和 Loom 在手机 / 平板窗口下使用相同宽度规则。
  const { width: windowWidth } = useWindowDimensions();
  // compact 窗口模拟 PhoneExtensionPanel，expanded 窗口模拟 TabletExtensionPanel。
  const isCompactPreview = windowWidth < 768;
  // 面板宽度与 Loom 的 Phone 比例和 Tablet 固定宽度保持一致。
  const extensionPanelWidth = isCompactPreview
    ? windowWidth * PHONE_PANEL_WIDTH_RATIO
    : PAD_PANEL_WIDTH;
  // 首次渲染时创建宿主运行时；后续 bundle 重载只替换 runtimeRef 当前实例。
  if (!runtimeRef.current) {
    runtimeRef.current = createPreviewRuntime();
  }

  useEffect(() => {
    let stopped = false;
    let knownVersion: string | null = null;

    const checkGuestVersion = async () => {
      try {
        const response = await fetch('http://localhost:8084/guest/app-version');
        // Metro 尚未启动或 bundle 尚未生成时，保留当前 guest，下一轮继续检查。
        if (!response.ok) return;

        const payload = (await response.json()) as { version?: string };
        const nextVersion = payload.version;
        // 版本接口只返回有效版本号，避免无效响应触发空 runtime。
        if (!nextVersion) return;
        // 第一次拿到版本只建立基线，不重复加载初始 guest。
        if (knownVersion === null) {
          knownVersion = nextVersion;
          return;
        }
        // 文件版本没有变化时不重建 Engine，避免打断用户当前操作。
        if (nextVersion === knownVersion || stopped) return;

        knownVersion = nextVersion;
        runtimeRef.current?.dispose();
        runtimeRef.current = createPreviewRuntime();
        setRuntimeRevision((revision) => revision + 1);
      } catch {
        // 开发服务器短暂重启时忽略本轮失败，下一轮自动恢复检查。
      }
    };

    checkGuestVersion();
    const timer = setInterval(checkGuestVersion, GUEST_VERSION_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // runtimeRef 在首次渲染前已初始化，EngineView 始终拿到当前 bundle 对应的 Engine。
  const runtime = runtimeRef.current;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.hostSurface}>
          <View
            style={[
              styles.extensionPanel,
              isCompactPreview
                ? styles.phoneExtensionPanel
                : styles.tabletExtensionPanel,
              { width: extensionPanelWidth },
            ]}
          >
            <EngineView
              engine={runtime!.engine}
              source="http://localhost:8084/guest/app.js"
              style={styles.guest}
            />
          </View>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F6' },
  hostSurface: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F2F6',
  },
  extensionPanel: {
    height: '100%',
    flexShrink: 1,
    // 让 EngineView 在预览宿主中保留 Loom Shell 的左右内容边距，避免 guest 贴边。
    paddingLeft: 20,
    paddingRight: 12,
    backgroundColor: '#F2F2F6',
    borderRightWidth: 1,
    borderRightColor: '#DADADE',
    overflow: 'hidden',
  },
  phoneExtensionPanel: {
    paddingTop: CHAT_HEADER_HEIGHT,
  },
  tabletExtensionPanel: {
    marginLeft: 'auto',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 0,
  },
  guest: { flex: 1 },
});
