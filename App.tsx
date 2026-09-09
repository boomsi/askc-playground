/**
 * askc 预览器：RN + keel 真实运行时 + askit 组件真实现 + fixture 宿主。
 *
 * 与 loom 同一条代码路径（Engine / Bridge / Receiver / JSC），仅宿主业务
 * handler 换成 fixture；Guest -> Host 业务事件通过 askit 的 EventHandler 接入当前 Bridge。
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
import { EventHandler } from 'askit';
import type { HandlerRegistry } from 'askit';
import { PreviewEventToast, type PreviewEventToastRef } from './PreviewEventToast';

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

// 预览器提供的 fixture 业务处理器，替代 Loom 中真实宿主的业务实现。
// 与 Loom 的 useExtensionEvent 同构：每个 handler 各自先打印收到的业务载荷
// （对应 Loom 各 handler 里的 console.log），再执行 fixture 逻辑。
// handler 入参是 askit EventHandler 拆分 requestId 后的业务对象，打印天然不含管道字段。
// 响应事件由 askit/contracts 的 EVENT_PAIRS 统一决定，避免 Preview 自己维护一份映射。
function createPreviewHandlers(
  notify: (event: string, payload: unknown) => void
): HandlerRegistry {
  return {
    GET_APP_INFO: async (payload) => {
      notify('GET_APP_INFO', payload);
      return {
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
      };
    },
    GET_LANGUAGE_LIST: async (payload) => {
      notify('GET_LANGUAGE_LIST', payload);
      return {
        current: 'zh-Hans',
        languages: ['zh-Hans', 'en', 'ja'],
      };
    },
    SET_APP_LANGUAGE: async (payload) => {
      notify('SET_APP_LANGUAGE', payload);
      return { success: true };
    },
    SET_TOOLBOX_ENTRIES: async (payload) => {
      notify('SET_TOOLBOX_ENTRIES', payload);
      return { success: true };
    },
    CLEAR_CHAT_HISTORY: async (payload) => {
      notify('CLEAR_CHAT_HISTORY', payload);
      return { success: true };
    },
    CLOSE_EXTENSION: async (payload) => {
      notify('CLOSE_EXTENSION', payload);
      return { success: true };
    },
    SEND_EMAIL: async (payload) => {
      notify('SEND_EMAIL', payload);
      return { success: true };
    },
  };
}

/**
 * 创建与 Loom 相同的 Guest -> Host 事件分发入口。
 * EventHandler 负责 requestId 拆分、响应事件匹配和 Host -> Guest 回传；
 * 与 Loom 的区别仅在 handler 实现：Loom 执行真实业务，Preview 打印事件并返回 fixture。
 */
function createPreviewRuntime(
  onGuestEvent: (event: string, payload: unknown) => void
): PreviewRuntime {
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
  const removeEventHandler = EventHandler.setup(engine, {
    tabId: 'preview',
    handlers: createPreviewHandlers(onGuestEvent),
  });
  const adapter = createEngineAdapter(engine);
  let disposed = false;

  return {
    engine,
    dispose: () => {
      // dispose 可能同时被 bundle 重载和组件卸载触发，只执行一次清理。
      if (disposed) return;
      disposed = true;
      removeEventHandler();
      adapter.dispose();
      engine.destroy();
    },
  };
}

export default function App() {
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  // 保存 Preview 事件 Toast 的命令式引用，让 Engine 收到消息时可以立即展示提示。
  const eventToastRef = useRef<PreviewEventToastRef>(null);
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
    runtimeRef.current = createPreviewRuntime((event, payload) => {
      eventToastRef.current?.show(event, payload);
    });
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
        // Bundle 重载时保留同一套事件提示回调，让新 Engine 的消息继续显示在 Preview 上。
        runtimeRef.current = createPreviewRuntime((event, eventPayload) => {
          eventToastRef.current?.show(event, eventPayload);
        });
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
            {/* 事件提示固定在 Preview 面板右上角，不参与 guest 内容布局。 */}
            <PreviewEventToast ref={eventToastRef} />
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
