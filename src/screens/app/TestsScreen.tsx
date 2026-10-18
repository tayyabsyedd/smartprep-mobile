import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  SectionList,
  SectionListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FormBanner } from '../../components/FormBanner';
import { PaywallModal } from '../../components/PaywallModal';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import {
  AppStackParamList,
  AppTabParamList,
} from '../../navigation/AppNavigator';
import { api, extractErrorMessage } from '../../services/api';
import type {
  CatalogModule,
  CatalogSubject,
  CatalogTest,
  QuotaExceededPayload,
  TestsCatalogResponse,
} from '../../types';
import { formatDuration, formatPrice } from '../../utils/format';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Tests'>,
  NativeStackScreenProps<AppStackParamList>
>;

interface TestSection {
  key: string;
  title: string;
  module: CatalogModule;
  data: CatalogTest[];
}

const ALL_SUBJECTS = '__all__';

export default function TestsScreen({ navigation }: Props) {
  const { user, isGuest, logout } = useAuth();
  const [subjects, setSubjects] = useState<CatalogSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>(ALL_SUBJECTS);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [paywall, setPaywall] = useState<{
    test: CatalogTest;
    module: CatalogModule;
  } | null>(null);

  const fetchCatalog = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<TestsCatalogResponse>('/tests');
      setSubjects(data.subjects ?? []);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // The catalog API needs a token; guests get the upsell state instead
    // of a doomed request.
    if (!isGuest) {
      fetchCatalog();
    } else {
      setLoading(false);
    }
  }, [isGuest, fetchCatalog]);

  const sections: TestSection[] = useMemo(() => {
    const visible =
      selectedSubject === ALL_SUBJECTS
        ? subjects
        : subjects.filter((s) => String(s.id) === selectedSubject);
    const list: TestSection[] = [];
    for (const subject of visible) {
      for (const module of subject.modules) {
        if (module.tests.length === 0) continue;
        list.push({
          key: `module-${module.id}`,
          title:
            selectedSubject === ALL_SUBJECTS
              ? `${subject.name} · ${module.name}`
              : module.name,
          module,
          data: module.tests,
        });
      }
    }
    return list;
  }, [subjects, selectedSubject]);

  const handleTestPress = async (test: CatalogTest, module: CatalogModule) => {
    if (checkingId !== null) return;
    setCheckingId(test.id);
    try {
      // 200: accessible (free, entitled, or quota left). 403: paywall below.
      await api.get(`/tests/${test.id}`);
      navigation.navigate('TestRunner', { testId: test.id });
    } catch (e) {
      if (
        axios.isAxiosError(e) &&
        e.response?.status === 403 &&
        (e.response.data as QuotaExceededPayload)?.error === 'quota_exceeded'
      ) {
        setPaywall({ test, module });
      } else {
        Alert.alert('Could not open test', extractErrorMessage(e));
      }
    } finally {
      setCheckingId(null);
    }
  };

  const handleUnlock = () => {
    setPaywall(null);
    // Step 5 wires this to the real payment flow.
    Alert.alert(
      'Coming in Step 5',
      'The payment flow unlocks paid tests in the next step.',
    );
  };

  const renderTestCard: SectionListRenderItem<CatalogTest, TestSection> = ({
    item: test,
    section,
  }) => {
    const checking = checkingId === test.id;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleTestPress(test, section.module)}
        disabled={checking}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {test.title}
          </Text>
          {checking ? (
            <ActivityIndicator size="small" color="#6750A4" />
          ) : (
            <Text style={styles.chevron}>›</Text>
          )}
        </View>
        <Text style={styles.cardMeta}>
          {formatDuration(test.timed, test.duration_minutes)} ·{' '}
          {test.question_count} question{test.question_count === 1 ? '' : 's'}
        </Text>
        <View style={styles.badgeRow}>
          {test.is_free ? (
            <View style={[styles.badge, styles.badgeFree]}>
              <Text style={[styles.badgeText, styles.badgeTextFree]}>
                Free Practice
              </Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgePaid]}>
              <Text style={[styles.badgeText, styles.badgeTextPaid]}>
                Paid Mock
              </Text>
            </View>
          )}
          {!test.is_free && test.price != null ? (
            <Text style={styles.price}>{formatPrice(test.price)}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: TestSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.quotaPill}>
        <Text style={styles.quotaText}>
          {section.module.free_tests_remaining} free left
        </Text>
      </View>
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

  // Guests have no token, so the catalog API would only 401. Show the
  // upsell instead of a doomed request.
  if (isGuest) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>You're browsing as a guest</Text>
        <Text style={styles.subtitle}>
          Create a free account to browse the test catalog and get 2 free
          attempts per module.
        </Text>
        <View style={styles.retryButton}>
          <PrimaryButton
            title="Create an Account / Log In"
            onPress={() => {
              void logout();
            }}
          />
        </View>
      </View>
    );
  }

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
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color="#6750A4"
        />
      </View>
    );
  }

  if (error && subjects.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load tests</Text>
        <FormBanner kind="error" message={error} />
        <View style={styles.retryButton}>
          <PrimaryButton title="Retry" onPress={() => fetchCatalog()} />
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
        keyExtractor={(item) => `test-${item.id}`}
        renderItem={renderTestCard}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchCatalog(true)}
            colors={['#6750A4']}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.subtitle}>No tests available yet.</Text>
          </View>
        }
      />
      <PaywallModal
        visible={paywall !== null}
        test={paywall?.test ?? null}
        moduleName={paywall?.module.name ?? ''}
        allowance={user?.is_enrolled ? 5 : 2}
        onUnlock={handleUnlock}
        onDismiss={() => setPaywall(null)}
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
    backgroundColor: '#6750A4',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    backgroundColor: '#FEF7FF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D1B20',
    flex: 1,
  },
  quotaPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#E8DEF8',
    marginLeft: 8,
  },
  quotaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A4458',
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
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1B20',
    flex: 1,
    marginRight: 8,
  },
  chevron: {
    fontSize: 22,
    color: '#79747E',
  },
  cardMeta: {
    fontSize: 13,
    color: '#49454F',
    marginBottom: 10,
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
  badgePaid: {
    backgroundColor: '#E8E0F4',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextFree: {
    color: '#1B5E20',
  },
  badgeTextPaid: {
    color: '#4F378B',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D1B20',
    marginLeft: 10,
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
