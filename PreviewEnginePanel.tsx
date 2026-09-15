/**
 * 预览器专用 Engine 渲染容器。
 *
 * 加载与更新复用 keel 的 useEngineView 管线（与 EngineView 同源），
 * 渲染层在宿主侧按 __panelId 从 guest 树中提取 right 面板——即 loom
 * AskcTabView 中 extractPanelsByPanelId 的预览器等价物。面板提取属于
 * 宿主职责，因此预览 bundle 与打包 bundle 共用同一个 askc footer。
 */
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Engine, useEngineView } from 'keel/host';

// 与 Loom ExtensionPanelShell.scrollContent 的滚动边距保持一致，
// 保证预览的上下留白与真实宿主所见即所得。
const PANEL_SCROLL_PADDING_TOP = 30;
const PANEL_SCROLL_PADDING_BOTTOM = 28;

type ExtractedPanels = {
  /** 树中是否出现 __panelId 标记（usePanels 形态的 guest）。 */
  isPanelTree: boolean;
  /** __panelId === 'right' 面板的内容；未找到时为 null。 */
  right: React.ReactNode;
};

/**
 * 从 guest 渲染树中提取 right 面板。
 * 遍历逻辑与 loom runtimeUtils.extractPanelsByPanelId 同构：遇到带
 * __panelId 的节点即取其 children，不再深入；预览器只渲染 right，
 * 因此仅返回单个面板而非 left/right 一对。
 */
function extractRightPanel(element: React.ReactNode): ExtractedPanels {
  const result: ExtractedPanels = { isPanelTree: false, right: null };

  function traverse(node: React.ReactNode): void {
    if (!React.isValidElement(node)) return;

    const props = node.props as Record<string, unknown>;
    const panelId = props.__panelId;
    if (panelId === 'left' || panelId === 'right') {
      result.isPanelTree = true;
      if (panelId === 'right') {
        result.right = props.children as React.ReactNode;
      }
      return;
    }

    const children = props.children;
    if (Array.isArray(children)) {
      children.forEach(traverse);
    } else if (children) {
      traverse(children as React.ReactNode);
    }
  }

  traverse(element);
  return result;
}

type PreviewEnginePanelProps = {
  engine: Engine;
  source: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * 与 keel EngineView 相同的加载/错误状态展示，渲染层替换为面板提取。
 * 面板形态的 guest 只渲染 right 面板（复刻 Loom 面板滚动边距），
 * 普通 guest 保持整树渲染，与 askc footer 的默认组件回退行为一致。
 */
export function PreviewEnginePanel({
  engine,
  source,
  style,
}: PreviewEnginePanelProps) {
  const { loadingState, error, content } = useEngineView({ engine, source });

  if (loadingState === 'loading' || loadingState === 'idle') {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.statusContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.statusText}>Loading bundle...</Text>
        </View>
      </View>
    );
  }

  if (loadingState === 'error' && error) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.statusContainer}>
          <Text style={styles.errorTitle}>Bundle Error</Text>
          <Text style={styles.errorMessage}>{error.message}</Text>
        </View>
      </View>
    );
  }

  const { isPanelTree, right } = extractRightPanel(content);

  if (isPanelTree) {
    return (
      <View style={[styles.container, style]}>
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={{
            paddingTop: PANEL_SCROLL_PADDING_TOP,
            paddingBottom: PANEL_SCROLL_PADDING_BOTTOM,
          }}
        >
          {right}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.container, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  panelScroll: {
    flex: 1,
  },
  statusContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
