import { colors } from '../../theme';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  SectionListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { RollIdUnlockModal } from '../../components/RollIdUnlockModal';
import { useAuth } from '../../context/AuthContext';
import {
  AppStackParamList,
  AppTabParamList,
} from '../../navigation/AppNavigator';
import { api, extractErrorMessage } from '../../services/api';
import type {
  DocumentsIndexDocument,
  DocumentsIndexResponse,
  DocumentsIndexSubject,
} from '../../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Notes'>,
  NativeStackScreenProps<AppStackParamList>
>;

interface NotesSection {
  key: string;
  title: string;
  data: DocumentsIndexDocument[];
}

const ALL_SUBJECTS = '__all__';

/**
 * Study notes browser (BRD guest browsing): the documents index is public,
 * so guests see everything. Enrolled-only documents render with a lock
 * badge and open a roll-ID unlock prompt — the stream endpoint stays the
 * enforcement point and still 403s non-enrolled users.
 */
export default function NotesScreen({ navigation }: Props) {
  const { user, isGuest } = useAuth();
  const [subjects, setSubjects] = useState<DocumentsIndexSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>(ALL_SUBJECTS);
  // Document awaiting unlock via the roll-ID modal (null = modal closed).
  const [unlockDoc, setUnlockDoc] =
    useState<DocumentsIndexDocument | null>(null);

  // Only enrolled students can open enrolled-only documents.
  const canOpenEnrolled = !!user && !isGuest && user.is_enrolled;

  const fetchDocuments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DocumentsIndexResponse>('/documents');
      setSubjects(data.subjects ?? []);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const sections: NotesSection[] = useMemo(() => {
    const visible =
      selectedSubject === ALL_SUBJECTS
        ? subjects
        : subjects.filter((s) => String(s.id) === selectedSubject);
    const list: NotesSection[] = [];
    for (const subject of visible) {
      for (const mod of subject.modules) {
        for (const ch of mod.chapters) {
          if (ch.documents.length === 0) continue;
          const chapterName = ch.chapter || 'General';
          list.push({
            key: `docs-${subject.id}-${mod.id}-${chapterName}`,
            title:
              selectedSubject === ALL_SUBJECTS
                ? `${subject.name} · ${mod.name} · ${chapterName}`
                : `${mod.name} · ${chapterName}`,
            data: ch.documents,
          });
        }
      }
    }
    return list;
  }, [subjects, selectedSubject]);

  const openDocument = (doc: DocumentsIndexDocument) => {
    navigation.navigate('DocumentViewer', {
      documentId: doc.id,
      title: doc.title,
    });
  };

  const handleDocPress = (doc: DocumentsIndexDocument) => {
    const locked = doc.visibility === 'enrolled' && !canOpenEnrolled;
    if (locked) {
      // Guests and non-enrolled students get the roll-ID unlock prompt.
      setUnlockDoc(doc);
      return;
    }
    openDocument(doc);
  };

  const handleUnlocked = () => {
    const doc = unlockDoc;
    setUnlockDoc(null);
    // Verification flipped the enrolled flag — open the document now.
    if (doc) openDocument(doc);
  };

  const renderDocCard: SectionListRenderItem<
    DocumentsIndexDocument,
    NotesSection
  > = ({ item: doc }) => {
    const locked = doc.visibility === 'enrolled' && !canOpenEnrolled;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleDocPress(doc)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {locked ? '🔒 ' : ''}
            {doc.title}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          {locked ? (
            <View style={[styles.badge, styles.badgeLocked]}>
              <Text style={[styles.badgeText, styles.badgeTextLocked]}>
                Enrolled only
              </Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeFree]}>
              <Text style={[styles.badgeText, styles.badgeTextFree]}>Free</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: NotesSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  const renderSubjectChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      <SubjectChip
        label="All"
        active={selectedSubject === ALL_SUBJECTS}
        onPress={() => setSelectedSubject(ALL_SUBJECTS)}
      />
      {subjects.map((s) => {
        const id = String(s.id);
        return (
          <SubjectChip
            key={id}
            label={s.name}
            active={selectedSubject === id}
            onPress={() => setSelectedSubject(id)}
          />
        );
      })}
    </ScrollView>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.skeletonChipRow}>
          <View style={styles.skeletonChip} />
          <View style={styles.skeletonChip} />
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonCard}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          </View>
        ))}
        <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && subjects.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load notes</Text>
        <FormBanner kind="error" message={error} />
        <View style={styles.retryButton}>
          <PrimaryButton title="Retry" onPress={() => fetchDocuments()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {renderSubjectChips()}
      {error ? (
        <View style={styles.inlineError}>
          <FormBanner kind="error" message={error} />
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => `doc-${item.id}`}
        renderItem={renderDocCard}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDocuments(true)}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.subtitle}>No notes available yet.</Text>
          </View>
        }
      />
      <RollIdUnlockModal
        visible={unlockDoc !== null}
        onDismiss={() => setUnlockDoc(null)}
        onUnlocked={handleUnlocked}
      />
    </View>
  );
}

function SubjectChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FEF7FF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FEF7FF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#49454F',
    textAlign: 'center',
  },
  retryButton: {
    width: '100%',
    maxWidth: 240,
    marginTop: 8,
  },
  loader: {
    marginTop: 24,
  },
  chipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3EDF7',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#49454F',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  inlineError: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingVertical: 12,
    backgroundColor: '#FEF7FF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D1B20',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1B20',
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeFree: {
    backgroundColor: '#E8F5E9',
  },
  badgeLocked: {
    backgroundColor: '#F3EDF7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextFree: {
    color: '#1B5E20',
  },
  badgeTextLocked: {
    color: '#49454F',
  },
  skeletonChipRow: {
    flexDirection: 'row',
    padding: 16,
  },
  skeletonChip: {
    width: 80,
    height: 36,
    borderRadius: 20,
    backgroundColor: '#E7E0EC',
    marginRight: 8,
  },
  skeletonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  skeletonLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E7E0EC',
    marginBottom: 8,
  },
  skeletonLineShort: {
    width: '60%',
    marginBottom: 0,
  },
});
