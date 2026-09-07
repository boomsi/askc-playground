import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'keel/guest';
import { ask } from '../preview-api';

const TOOLBOX_ENTRIES = [
  { key: 'camera', label: '相机' },
  { key: 'photo', label: '照片' },
  { key: 'file', label: '文件' },
  { key: 'location', label: '位置' },
  { key: 'webSearch', label: '联网搜索' },
  { key: 'sendKey', label: '发送键' },
] as const;

interface LanguageOption {
  id: string;
  label: string;
  backgroundColor: string;
  color: string;
}

type AppInfo = {
  languageContents?: Record<string, { description?: string }>;
};

type LanguageList = {
  current: string;
  languages: string[];
};

const supportedLanguages: LanguageOption[] = [
  {
    id: 'en',
    label: 'Welcome',
    backgroundColor: '#F4ECEA',
    color: '#D95B4F',
  },
  {
    id: 'zh-Hans',
    label: '欢迎',
    backgroundColor: '#F5EDED',
    color: '#E45C4E',
  },
  {
    id: 'ja',
    label: 'いらっしゃいませ',
    backgroundColor: '#ECF3F8',
    color: '#2E7B8B',
  },
  {
    id: 'fr',
    label: 'accfaueillir',
    backgroundColor: '#F8EEF4',
    color: '#E16586',
  },
  {
    id: 'ko',
    label: '환영',
    backgroundColor: '#EEF2FF',
    color: '#005DFF',
  },
  {
    id: 'zh-Hant',
    label: '歡迎',
    backgroundColor: '#F8F0F0',
    color: '#D95B4F',
  },
  {
    id: 'es',
    label: 'bienvenido',
    backgroundColor: '#F8F5F2',
    color: '#DB9432',
  },
  {
    id: 'ru',
    label: 'добропожаловать',
    backgroundColor: '#F0EEF7',
    color: '#6B5BAA',
  },
];

/**
 * 中间内容区的浅 / 深色值。
 * guest 无法共享宿主 theme token，这里手动对齐 src/shared/theme/colors.ts：
 * - sectionTitle ↔ textHeading (#252525 / #D5D5D5)
 * - aboutText ↔ 次要文字 (#9E9E9E / #8E8E93)
 * - pillSelectedBg ↔ 选中强调色 #E35C49
 */
const lightPalette = {
  sectionTitle: '#252525',
  aboutText: '#9E9E9E',
  pillSelectedBg: '#E35C49',
};

const darkPalette = {
  sectionTitle: '#D5D5D5',
  aboutText: '#8E8E93',
  pillSelectedBg: '#E35C49',
};

/**
 * 扩展面板中间内容（介绍 + 选择语种）。
 *
 * 头尾（应用信息 / 操作项）已收敛到宿主 ExtensionPanelShell 直接渲染，
 * guest 仅负责这两块内容；色值随系统色温在浅 / 深之间切换。
 *
 * 本组件只是一个撑开的 View（不限高、不自身滚动）——滚动交给宿主 Shell 的
 * ScrollView 统一处理，header / 本内容 / footer 在同一滚动流里。
 */
export default function Stats() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [lang, setLang] = useState<string>('zhHans');
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [statsData, setStatsData] = useState<AppInfo>({});

  const [toolbox, setToolbox] = useState<Record<string, boolean>>({
    camera: true,
    photo: true,
    file: true,
    location: true,
    webSearch: true,
    sendKey: true,
  });
  const toggleToolboxEntry = useCallback((key: string) => {
    setToolbox((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      ask.call('SET_TOOLBOX_ENTRIES', { entries: next }).catch((err) => {
        console.error('[Stats] setToolboxEntries failed:', err);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    ask.call<AppInfo>('GET_APP_INFO').then((appInfo) => {
      setStatsData(appInfo);
    });

    ask.call<LanguageList>('GET_LANGUAGE_LIST').then((result) => {
      const langs = result.languages;

      setLanguages(
        supportedLanguages.filter(({ id }) => langs.includes(id)),
      );
      setLang(result.current);
    });
  }, []);

  const handleLanguagePress = useCallback((language: LanguageOption) => {
    setLang(language.id);
    ask.call('SET_APP_LANGUAGE', { language: language.id }).catch((err) => {
      console.error('[Stats] setAppLanguage failed:', err);
    });
  }, []);

  const languageHandlers = useMemo(() => {
    const map: Record<string, () => void> = {};
    for (const l of languages) {
      map[l.id] = () => handleLanguagePress(l);
    }
    return map;
  }, [languages, handleLanguagePress]);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>介绍</Text>
        <Text style={styles.aboutText}>
          {statsData.languageContents?.[lang]?.description}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>选择语种</Text>
        <View style={styles.languageGrid}>
          {languages.map((language) => {
            const isSelected = language.id === lang;

            return (
              <TouchableOpacity
                key={language.id}
                onPress={languageHandlers[language.id]}
                style={[
                  styles.languagePill,
                  {
                    backgroundColor: isSelected
                      ? palette.pillSelectedBg
                      : language.backgroundColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.languageText,
                    { color: isSelected ? '#FFFFFF' : language.color },
                  ]}
                >
                  {language.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>工具栏入口</Text>
        {TOOLBOX_ENTRIES.map((entry) => {
          const visible = toolbox[entry.key];
          return (
            <TouchableOpacity
              key={entry.key}
              style={styles.toolboxRow}
              activeOpacity={0.7}
              onPress={() => toggleToolboxEntry(entry.key)}
            >
              <Text style={styles.toolboxLabel}>{entry.label}</Text>
              <Text
                style={[
                  styles.toolboxValue,
                  {
                    color: visible
                      ? palette.pillSelectedBg
                      : palette.aboutText,
                  },
                ]}
              >
                {visible ? '显示' : '隐藏'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (p: typeof lightPalette) =>
  StyleSheet.create({
    container: {
      width: '100%',
    },
    section: {
      marginBottom: 40,
    },
    sectionTitle: {
      color: p.sectionTitle,
      fontSize: 18,
      fontWeight: '500',
      lineHeight: 28,
      marginBottom: 9,
    },
    aboutText: {
      color: p.aboutText,
      fontSize: 16,
      lineHeight: 24,
    },
    languageGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
    },
    languagePill: {
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 8,
      marginRight: 16,
      marginBottom: 16,
    },
    languageText: {
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 25,
    },
    toolboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: 'rgba(0,0,0,0.04)',
    },
    toolboxLabel: {
      color: p.sectionTitle,
      fontSize: 16,
      fontWeight: '500',
    },
    toolboxValue: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
