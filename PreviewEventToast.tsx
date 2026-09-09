import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export type PreviewEventToastRef = {
  show: (event: string, payload: unknown) => void;
};

type ToastItem = {
  id: number;
  message: string;
};

// 每条提示的停留时长（不含淡入淡出）。
const TOAST_DISPLAY_MS = 3000;
// 同时可见的提示上限：超出时最旧的一条直接让位，避免连续事件把面板盖满。
const MAX_VISIBLE_TOASTS = 5;

function formatPayload(payload: unknown): string {
  if (payload === undefined) return 'undefined';
  if (typeof payload === 'string') return payload;

  try {
    // 多行缩进展示参数结构，不压成单行字符串，方便直接看清 guest 传了什么。
    return JSON.stringify(payload, null, 2) ?? String(payload);
  } catch {
    return String(payload);
  }
}

/** 单条事件提示：拥有自己的淡入淡出生命周期，结束后通知父级按 id 移除。 */
function ToastBubble({
  id,
  message,
  onDone,
}: {
  id: number;
  message: string;
  onDone: (id: number) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(TOAST_DISPLAY_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);
    // 每条提示独立走完自己的动画再移除，连续事件不会互相顶掉。
    animation.start(({ finished }) => {
      if (finished) onDone(id);
    });
    return () => animation.stop();
  }, [id, onDone, opacity]);

  return (
    <Animated.View style={{ opacity }}>
      <View style={styles.bubble}>
        {/* 参数是多行格式化 JSON，不限制行数，保证完整可见。 */}
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

/** Preview 专用事件提示：收到的 Guest 消息逐条堆叠在面板右上角。 */
export const PreviewEventToast = forwardRef<PreviewEventToastRef>((_, ref) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // 递增 id 作为每条提示的 key 与移除依据。
  const nextIdRef = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      show: (event, payload) => {
        nextIdRef.current += 1;
        const id = nextIdRef.current;
        const message = `接收到 ${event} 消息，参数\n${formatPayload(payload)}`;
        // 新提示追加到列表末尾（显示在已有提示下方），不替换未消失的提示。
        setToasts((prev) =>
          [...prev, { id, message }].slice(-MAX_VISIBLE_TOASTS)
        );
      },
    }),
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {toasts.map((toast) => (
        <ToastBubble
          key={toast.id}
          id={toast.id}
          message={toast.message}
          onDone={removeToast}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    right: 12,
    maxWidth: '88%',
    zIndex: 9999,
    // 多条提示纵向堆叠，保持整体右上角对齐。
    alignItems: 'flex-end',
    gap: 8,
  },
  bubble: {
    backgroundColor: '#242033',
    borderColor: '#7D6AA8',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 17,
  },
});
