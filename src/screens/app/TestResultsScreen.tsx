import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { api, extractErrorMessage } from '../../services/api';
import type { AttemptResults, ResultsQuestion } from '../../types';
import { formatElapsed } from '../../utils/format';

type Props = NativeStackScreenProps<AppStackParamList, 'TestResults'>;

/**
 * Scorecard screen (BR-08). Answers and explanations are revealed ONLY here —
 * the runner never receives them (see the start endpoint's sanitized payload).
 */
export default function TestResultsScreen({ route, navigation }: Props) {
  const { attemptId } = route.params;
  const [results, setResults] = useState<AttemptResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<AttemptResults>(
          `/test-attempts/${attemptId}/results`,
        );
        if (!cancelled) setResults(data);
      } catch (e) {
        if (!cancelled) setError(extractErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6750A4" />
        <Text style={styles.centerText}>Loading your scorecard…</Text>
      </View>
    );
  }

  if (error || !results) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load results</Text>
        <FormBanner kind="error" message={error ?? 'Unknown error.'} />
        <View style={styles.actionRow}>
          <PrimaryButton title="Back to Catalog" onPress={() => navigation.popToTop()} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Score hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTestTitle} numberOfLines={2}>
          {results.test.title}
        </Text>
        <Text style={styles.heroScore}>
          {results.score}
          <Text style={styles.heroTotal}> / {results.total_marks}</Text>
        </Text>
        <Text style={styles.heroPercentage}>{results.percentage}%</Text>
        <View
          style={[
            styles.passBadge,
            results.passed ? styles.passBadgePass : styles.passBadgeFail,
          ]}
        >
          <Text
            style={[
              styles.passBadgeText,
              results.passed ? styles.passBadgeTextPass : styles.passBadgeTextFail,
            ]}
          >
            {results.passed ? 'PASSED' : 'NOT PASSED'}
          </Text>
        </View>
        <View style={styles.heroPills}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              ⏱ {formatElapsed(results.time_spent_seconds)}
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              📱 {results.app_switches} app switch{results.app_switches === 1 ? '' : 'es'}
            </Text>
          </View>
        </View>
        <Text style={styles.heroHint}>
          Passing mark: {results.pass_percentage}%
        </Text>
      </View>

      {/* Question review */}
      <Text style={styles.sectionTitle}>Review your answers</Text>
      {results.questions.map((q, index) => (
        <QuestionReviewCard key={q.question_id} question={q} index={index} />
      ))}

      <View style={styles.actionRow}>
        <PrimaryButton
          title="Back to Catalog"
          onPress={() => navigation.popToTop()}
        />
      </View>
    </ScrollView>
  );
}

function QuestionReviewCard({
  question,
  index,
}: {
  question: ResultsQuestion;
  index: number;
}) {
  const correctSet = new Set(question.correct_options);
  const selectedSet = new Set(question.selected_options);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardQuestion} numberOfLines={3}>
          {index + 1}. {question.question_text}
        </Text>
        <View
          style={[
            styles.marksPill,
            question.is_correct ? styles.marksPillGood : styles.marksPillBad,
          ]}
        >
          <Text style={styles.marksPillText}>
            {question.marks_obtained}/{question.marks}
          </Text>
        </View>
      </View>

      {question.options.map((option, optIndex) => {
        const isCorrect = correctSet.has(optIndex);
        const isSelected = selectedSet.has(optIndex);
        return (
          <View
            key={optIndex}
            style={[
              styles.optionRow,
              isCorrect && styles.optionCorrect,
              isSelected && !isCorrect && styles.optionWrong,
            ]}
          >
            <Text style={styles.optionText}>{option}</Text>
            {isCorrect && isSelected ? (
              <Text style={[styles.optionTag, styles.tagCorrect]}>✓ Your answer</Text>
            ) : isCorrect ? (
              <Text style={[styles.optionTag, styles.tagCorrect]}>
                Correct answer
              </Text>
            ) : isSelected ? (
              <Text style={[styles.optionTag, styles.tagWrong]}>✗ Your answer</Text>
            ) : null}
          </View>
        );
      })}

      {question.explanation ? (
        <View style={styles.explanationBox}>
          <Text style={styles.explanationLabel}>Explanation</Text>
          <Text style={styles.explanationText}>{question.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#FEF7FF',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FEF7FF',
  },
  centerText: {
    marginTop: 12,
    fontSize: 15,
    color: '#49454F',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 12,
    textAlign: 'center',
  },
  hero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTestTitle: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroScore: {
    fontSize: 44,
    fontWeight: '800',
    color: '#1D1B20',
  },
  heroTotal: {
    fontSize: 22,
    fontWeight: '400',
    color: '#49454F',
  },
  heroPercentage: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6750A4',
    marginTop: 4,
  },
  passBadge: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 12,
  },
  passBadgePass: {
    backgroundColor: '#E8F5E9',
  },
  passBadgeFail: {
    backgroundColor: '#F9DEDC',
  },
  passBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  passBadgeTextPass: {
    color: '#1B5E20',
  },
  passBadgeTextFail: {
    color: '#B3261E',
  },
  heroPills: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  pill: {
    backgroundColor: '#F3EDF7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A4458',
  },
  heroHint: {
    fontSize: 12,
    color: '#79747E',
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1D1B20',
    flex: 1,
    marginRight: 8,
    lineHeight: 22,
  },
  marksPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  marksPillGood: {
    backgroundColor: '#E8F5E9',
  },
  marksPillBad: {
    backgroundColor: '#F9DEDC',
  },
  marksPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D1B20',
  },
  optionRow: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    backgroundColor: '#F7F2FA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionCorrect: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#6FCF7F',
  },
  optionWrong: {
    backgroundColor: '#F9DEDC',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  optionText: {
    fontSize: 14,
    color: '#1D1B20',
    flex: 1,
    marginRight: 8,
    lineHeight: 20,
  },
  optionTag: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagCorrect: {
    color: '#1B5E20',
  },
  tagWrong: {
    color: '#B3261E',
  },
  explanationBox: {
    marginTop: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A4A00',
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 14,
    color: '#1D1B20',
    lineHeight: 20,
  },
  actionRow: {
    marginTop: 8,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
});
