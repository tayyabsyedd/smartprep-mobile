import { colors } from '../../theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AppStackParamList } from '../../navigation/AppNavigator';
import { api, extractErrorMessage } from '../../services/api';
import type {
  AnswerPayloadItem,
  AttemptQuestion,
  StartAttemptResponse,
} from '../../types';
import { formatClock } from '../../utils/format';

type Props = NativeStackScreenProps<AppStackParamList, 'TestRunner'>;

type Phase = 'starting' | 'ready' | 'submitting' | 'error';

const AUTOSAVE_DEBOUNCE_MS = 400;

/**
 * Interactive test runner (BR-07).
 *
 * Wire notes (typed to the real API, not the draft spec):
 * - start returns `duration_seconds` (not minutes), `started_at` (ISO, for
 *   resume math), `resumed`, and sanitized questions.
 * - autosave posts a BATCH: { answers: [{ question_id, selected, ... }] }
 *   where `selected` holds option *indices*.
 * - submit posts { answers: [...], app_switches } (not app_switch_count).
 * - resume does NOT return previously saved selections, so on a resumed
 *   attempt the submit payload only carries questions answered this session
 *   (sending [] for the rest would wipe the server's saved rows).
 */
export default function TestRunnerScreen({ route, navigation }: Props) {
  const { testId, title } = route.params;

  const [phase, setPhase] = useState<Phase>('starting');
  const [startError, setStartError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [resumed, setResumed] = useState(false);
  const [timed, setTimed] = useState(false);
  const [remainingSecs, setRemainingSecs] = useState(0);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [visited, setVisited] = useState<Record<number, boolean>>({});
  const [paletteVisible, setPaletteVisible] = useState(false);

  // Refs (no re-render needed): timer, app-state, per-question timing.
  const deadlineRef = useRef(0);
  const remainingRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>('active');
  const appSwitchesRef = useRef(0);
  const timeSpentRef = useRef<Record<number, number>>({});
  const questionEnterRef = useRef(0);
  const currentQidRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  const pendingSaveRef = useRef<{ qid: number; selected: number[] } | null>(null);
  const phaseRef = useRef<Phase>('starting');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const current = questions[currentIndex];

  // --- Timer ---------------------------------------------------------------

  const stopTicker = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const submitRef = useRef<(auto: boolean) => Promise<void>>(
    async () => undefined,
  );

  const startTicker = useCallback(() => {
    stopTicker();
    intervalRef.current = setInterval(() => {
      const left = Math.max(
        0,
        Math.round((deadlineRef.current - Date.now()) / 1000),
      );
      remainingRef.current = left;
      setRemainingSecs(left);
      if (left <= 0) {
        stopTicker();
        // Timer expired: submit immediately, no confirmation dialog.
        void submitRef.current(true);
      }
    }, 1000);
  }, [stopTicker]);

  // --- Per-question timing ---------------------------------------------------

  /** Move elapsed wall-time since entering the question into its accumulator. */
  const noteTime = useCallback((qid: number | null) => {
    if (qid === null) return;
    const now = Date.now();
    const elapsed = Math.max(0, (now - questionEnterRef.current) / 1000);
    timeSpentRef.current[qid] = (timeSpentRef.current[qid] ?? 0) + elapsed;
    questionEnterRef.current = now;
  }, []);

  const totalTimeFor = useCallback(
    (qid: number): number => {
      const live =
        qid === currentQidRef.current
          ? Math.max(0, (Date.now() - questionEnterRef.current) / 1000)
          : 0;
      return (timeSpentRef.current[qid] ?? 0) + live;
    },
    [],
  );

  // --- Autosave --------------------------------------------------------------

  const sendSave = useCallback(
    async (qid: number, selected: number[]) => {
      const id = attemptId;
      if (id === null || submittedRef.current) return;
      try {
        // Best-effort: a hiccup here must never freeze the UI, and the
        // final submit carries every answer again anyway.
        await api.post(`/test-attempts/${id}/answers`, {
          answers: [
            {
              question_id: qid,
              selected,
              time_spent_seconds: Math.round(totalTimeFor(qid)),
            } satisfies AnswerPayloadItem,
          ],
        });
      } catch {
        // Swallowed deliberately (see above).
      }
    },
    [attemptId, totalTimeFor],
  );

  const scheduleSave = useCallback(
    (qid: number, selected: number[]) => {
      pendingSaveRef.current = { qid, selected };
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        pendingSaveRef.current = null;
        void sendSave(qid, selected);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [sendSave],
  );

  /** Send any debounced-but-unsent answer immediately (used on exit). */
  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      await sendSave(pending.qid, pending.selected);
    }
  }, [sendSave]);

  // --- Submit ------------------------------------------------------------------

  const submitTest = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || attemptId === null || questions.length === 0) {
        return;
      }
      submittedRef.current = true;
      setPhase('submitting');
      stopTicker();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      noteTime(currentQidRef.current);

      try {
        // Fresh attempt: send every question (unanswered -> []), so the
        // results breakdown is complete. Resumed attempt: only send what
        // was answered this session — sending [] for the rest would wipe
        // rows the server saved before the app was killed.
        const payload: AnswerPayloadItem[] = questions
          .filter((q) => (resumed ? answers[q.question_id] !== undefined : true))
          .map((q) => ({
            question_id: q.question_id,
            selected: answers[q.question_id] ?? [],
            time_spent_seconds: Math.round(
              timeSpentRef.current[q.question_id] ?? 0,
            ),
          }));
        const body = {
          answers:
            payload.length > 0
              ? payload
              : [
                  {
                    question_id: questions[0].question_id,
                    selected: [],
                    time_spent_seconds: 0,
                  } satisfies AnswerPayloadItem,
                ],
          // Wire field is `app_switches` (not app_switch_count).
          app_switches: appSwitchesRef.current,
        };
        await api.post(`/test-attempts/${attemptId}/submit`, body);
        // replace(): the back button can never re-enter a submitted test.
        navigation.replace('TestResults', { attemptId });
      } catch (e) {
        submittedRef.current = false;
        setPhase('ready');
        // NOTE: the ticker is deliberately NOT restarted here. On a failed
        // auto-submit the deadline is already past, so restarting it would
        // instantly re-trigger submission in a loop. The student retries
        // manually via Submit Test instead.
        if (!auto) {
          Alert.alert('Submission failed', extractErrorMessage(e));
        } else {
          // Auto-submit failed (likely offline): un-freeze so the student
          // can retry manually. The timer stays at 00:00.
          Alert.alert(
            'Auto-submit failed',
            `${extractErrorMessage(e)}\n\nYour answers are saved on this device — tap Submit Test to retry.`,
          );
        }
      }
    },
    [attemptId, questions, resumed, answers, stopTicker, noteTime, navigation],
  );

  useEffect(() => {
    submitRef.current = submitTest;
  }, [submitTest]);

  // --- Init --------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.post<StartAttemptResponse>(
          `/tests/${testId}/start`,
        );
        if (cancelled) return;

        if (data.questions.length === 0) {
          setStartError('This test has no questions yet.');
          setPhase('error');
          return;
        }

        setAttemptId(data.attempt_id);
        setQuestions(data.questions);
        setResumed(data.resumed);

        if (data.duration_seconds !== null) {
          // Remaining time: total minus wall-clock elapsed since start
          // (correct for both fresh and resumed attempts).
          const elapsed =
            (Date.now() - new Date(data.started_at).getTime()) / 1000;
          const remaining = Math.max(
            0,
            Math.round(data.duration_seconds - elapsed),
          );
          setTimed(true);
          remainingRef.current = remaining;
          setRemainingSecs(remaining);
          deadlineRef.current = Date.now() + remaining * 1000;
          startTicker();
        }

        const firstQid = data.questions[0].question_id;
        currentQidRef.current = firstQid;
        questionEnterRef.current = Date.now();
        setVisited({ [firstQid]: true });
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        setStartError(extractErrorMessage(e));
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [testId, startTicker]);

  // --- AppState: pause timer + count app switches -------------------------------

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (next === 'background' && prev !== 'background') {
        appSwitchesRef.current += 1;
        noteTime(currentQidRef.current);
        if (intervalRef.current) {
          // Locked decision: the displayed countdown pauses while the app
          // is backgrounded. (The server still measures wall-clock for its
          // own time_spent_seconds — the results screen shows that value.)
          const left = Math.max(
            0,
            Math.round((deadlineRef.current - Date.now()) / 1000),
          );
          remainingRef.current = left;
          setRemainingSecs(left);
          stopTicker();
          pausedRef.current = true;
        }
      } else if (next === 'active' && pausedRef.current) {
        pausedRef.current = false;
        deadlineRef.current = Date.now() + remainingRef.current * 1000;
        questionEnterRef.current = Date.now();
        startTicker();
      }
    });
    return () => sub.remove();
  }, [noteTime, stopTicker, startTicker]);

  // --- Android back button ---------------------------------------------------------

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const ph = phaseRef.current;
      // Hold the user during start/submit; free pass on the error screen.
      if (ph === 'starting' || ph === 'submitting') return true;
      if (ph === 'error') return false;
      Alert.alert(
        'Exit Test?',
        'Your progress is saved, but the timer will keep running.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Exit',
            style: 'destructive',
            onPress: () => {
              // Flush the debounced autosave so the "progress is saved"
              // promise above holds even for the last tap.
              void flushPendingSave().finally(() => navigation.goBack());
            },
          },
        ],
      );
      return true;
    });
    return () => sub.remove();
  }, [navigation, flushPendingSave]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTicker();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [stopTicker]);

  // --- Question navigation -----------------------------------------------------------

  const goToQuestion = useCallback(
    (index: number) => {
      if (index < 0 || index >= questions.length || index === currentIndex) {
        return;
      }
      noteTime(currentQidRef.current);
      const qid = questions[index].question_id;
      currentQidRef.current = qid;
      questionEnterRef.current = Date.now();
      setVisited((prev) => ({ ...prev, [qid]: true }));
      setCurrentIndex(index);
      setPaletteVisible(false);
    },
    [questions, currentIndex, noteTime],
  );

  const handleOptionTap = useCallback(
    (index: number) => {
      const q = questions[currentIndex];
      if (!q || submittedRef.current) return;
      const isMulti = q.qtype === 'multi_select';
      const prevSelected = answers[q.question_id] ?? [];
      const next = isMulti
        ? prevSelected.includes(index)
          ? prevSelected.filter((i) => i !== index)
          : [...prevSelected, index]
        : [index];

      setAnswers((prev) => ({ ...prev, [q.question_id]: next }));
      scheduleSave(q.question_id, next);
    },
    [questions, currentIndex, answers, scheduleSave],
  );

  const toggleFlag = useCallback(() => {
    const q = questions[currentIndex];
    if (!q) return;
    setFlagged((prev) => ({ ...prev, [q.question_id]: !prev[q.question_id] }));
  }, [questions, currentIndex]);

  const handleSubmitPress = useCallback(() => {
    const answeredCount = questions.filter(
      (q) => (answers[q.question_id] ?? []).length > 0,
    ).length;
    const flaggedCount = questions.filter((q) => flagged[q.question_id]).length;
    Alert.alert(
      'Submit Test?',
      `Answered: ${answeredCount}\nUnanswered: ${questions.length - answeredCount}\nFlagged: ${flaggedCount}`,
      [
        { text: 'Keep Working', style: 'cancel' },
        { text: 'Submit', onPress: () => void submitRef.current(false) },
      ],
    );
  }, [questions, answers, flagged]);

  const paletteStatus = useCallback(
    (q: AttemptQuestion): 'unvisited' | 'visited' | 'answered' | 'flagged' => {
      if (flagged[q.question_id]) return 'flagged';
      if ((answers[q.question_id] ?? []).length > 0) return 'answered';
      if (visited[q.question_id]) return 'visited';
      return 'unvisited';
    },
    [flagged, answers, visited],
  );

  const answeredTotal = useMemo(
    () =>
      questions.filter((q) => (answers[q.question_id] ?? []).length > 0).length,
    [questions, answers],
  );

  // --- Render --------------------------------------------------------------------------

  if (phase === 'starting' || phase === 'submitting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>
          {phase === 'starting' ? 'Starting test…' : 'Submitting…'}
        </Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't start the test</Text>
        <FormBanner kind="error" message={startError ?? 'Unknown error.'} />
        <View style={styles.retryButton}>
          <PrimaryButton title="Back to Tests" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  if (!current) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const selected = answers[current.question_id] ?? [];
  const isMulti = current.qtype === 'multi_select';
  const timerUrgent = timed && remainingSecs <= 60;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle}>
            Question {currentIndex + 1} of {questions.length} · {answeredTotal} answered
          </Text>
        </View>
        {timed ? (
          <View style={[styles.timerChip, timerUrgent && styles.timerChipUrgent]}>
            <Text style={[styles.timerText, timerUrgent && styles.timerTextUrgent]}>
              {formatClock(remainingSecs)}
            </Text>
          </View>
        ) : (
          <View style={styles.timerChip}>
            <Text style={styles.timerText}>Untimed</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.paletteButton}
          onPress={() => setPaletteVisible(true)}
        >
          <Text style={styles.paletteButtonText}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Question */}
      <ScrollView contentContainerStyle={styles.questionContent}>
        <View style={styles.questionMeta}>
          <Text style={styles.marksChip}>{current.marks} mark{current.marks === 1 ? '' : 's'}</Text>
          {isMulti ? (
            <Text style={styles.multiHint}>Select all that apply</Text>
          ) : null}
        </View>
        <Text style={styles.questionText}>{current.question_text}</Text>

        {current.options.map((option, index) => {
          const isSelected = selected.includes(index);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => handleOptionTap(index)}
              activeOpacity={0.7}
            >
              {isMulti ? (
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
              ) : (
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
              )}
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.flagRow} onPress={toggleFlag}>
          <Text style={styles.flagText}>
            {flagged[current.question_id] ? '🚩 Flagged for review' : '⚑ Flag for review'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={() => goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          <Text style={styles.navButtonText}>← Prev</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentIndex === questions.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={() => goToQuestion(currentIndex + 1)}
          disabled={currentIndex === questions.length - 1}
        >
          <Text style={styles.navButtonText}>Next →</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.submitRow}>
        <PrimaryButton title="Submit Test" onPress={handleSubmitPress} />
      </View>

      {/* Question palette */}
      <Modal
        visible={paletteVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPaletteVisible(false)}
      >
        <View style={styles.paletteBackdrop}>
          <View style={styles.paletteSheet}>
            <View style={styles.paletteHeader}>
              <Text style={styles.paletteTitle}>Questions</Text>
              <TouchableOpacity onPress={() => setPaletteVisible(false)}>
                <Text style={styles.paletteClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.paletteLegend}>
              <LegendDot color="#9E9E9E" label="Unvisited" />
              <LegendDot color="#7BA7F5" label="Visited" />
              <LegendDot color="#6FCF7F" label="Answered" />
              <LegendDot color="#F5B74B" label="Flagged" />
            </View>
            <View style={styles.paletteGrid}>
              {questions.map((q, index) => {
                const status = paletteStatus(q);
                const isCurrent = index === currentIndex;
                return (
                  <TouchableOpacity
                    key={q.question_id}
                    style={[
                      styles.paletteCell,
                      status === 'unvisited' && styles.cellUnvisited,
                      status === 'visited' && styles.cellVisited,
                      status === 'answered' && styles.cellAnswered,
                      status === 'flagged' && styles.cellFlagged,
                      isCurrent && styles.cellCurrent,
                    ]}
                    onPress={() => goToQuestion(index)}
                  >
                    <Text
                      style={[
                        styles.paletteCellText,
                        isCurrent && styles.paletteCellTextCurrent,
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
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
  retryButton: {
    width: '100%',
    maxWidth: 240,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0EC',
  },
  headerText: {
    flex: 1,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D1B20',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#49454F',
    marginTop: 2,
  },
  timerChip: {
    backgroundColor: '#E8DEF8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  timerChipUrgent: {
    backgroundColor: '#F9DEDC',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A4458',
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: {
    color: '#B3261E',
  },
  paletteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3EDF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteButtonText: {
    fontSize: 18,
    color: colors.primary,
  },
  questionContent: {
    padding: 16,
    paddingBottom: 24,
  },
  questionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  marksChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A4458',
    backgroundColor: '#E8DEF8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  multiHint: {
    fontSize: 12,
    color: '#49454F',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  questionText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#1D1B20',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E7E0EC',
  },
  optionSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    padding: 13,
    backgroundColor: '#F5F0FF',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#79747E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#79747E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  optionText: {
    fontSize: 15,
    color: '#1D1B20',
    flex: 1,
    lineHeight: 22,
  },
  flagRow: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  flagText: {
    fontSize: 14,
    color: '#7A4A00',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  navButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#79747E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  submitRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  paletteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  paletteSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  paletteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paletteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1B20',
  },
  paletteClose: {
    fontSize: 18,
    color: '#49454F',
    padding: 4,
  },
  paletteLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: '#49454F',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paletteCell: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  cellUnvisited: {
    backgroundColor: '#E7E0EC',
  },
  cellVisited: {
    backgroundColor: '#D3E3FD',
  },
  cellAnswered: {
    backgroundColor: '#C6F0C2',
  },
  cellFlagged: {
    backgroundColor: '#FFE0B2',
  },
  cellCurrent: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  paletteCellText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D1B20',
  },
  paletteCellTextCurrent: {
    color: '#4A4458',
  },
});
