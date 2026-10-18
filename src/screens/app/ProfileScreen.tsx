import axios from 'axios';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../context/AuthContext';
import { api, extractErrorMessage } from '../../services/api';
import type { EnrollmentVerifyResponse } from '../../types';

type VerifyState = 'idle' | 'success' | 'pending' | 'error';

export default function ProfileScreen() {
  const { user, isGuest, logout, refreshUser } = useAuth();
  const [rollId, setRollId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Offline cold start: a token exists but the profile couldn't be fetched.
  // Screens must tolerate user === null (see AuthContext boot).
  if (!user) {
    const handleRetry = async () => {
      setRetrying(true);
      setRetryError(null);
      try {
        await refreshUser();
      } catch (e) {
        setRetryError(extractErrorMessage(e));
      } finally {
        setRetrying(false);
      }
    };

    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn't load your profile</Text>
        <Text style={styles.subtitle}>
          Check your connection and try again.
        </Text>
        {retryError ? <FormBanner kind="error" message={retryError} /> : null}
        <View style={styles.retryButton}>
          <PrimaryButton
            title="Retry"
            onPress={handleRetry}
            loading={retrying}
            disabled={retrying}
          />
        </View>
      </View>
    );
  }

  const enrolled = user.is_enrolled;
  const initial = (user.name.trim()[0] ?? '?').toUpperCase();

  const handleVerify = async () => {
    const id = rollId.trim().toUpperCase();
    if (!id) {
      setVerifyState('error');
      setVerifyMessage('Enter your institute roll ID.');
      return;
    }

    setVerifying(true);
    setVerifyState('idle');
    setVerifyMessage(null);
    try {
      const { data } =
        await api.post<EnrollmentVerifyResponse>('/enrollment/verify', {
          roll_id: id,
        });

      if (data.is_enrolled) {
        // Roster match: refresh so the pill flips immediately.
        await refreshUser();
        setVerifyState('success');
        setVerifyMessage('Enrollment verified — welcome aboard!');
      } else {
        // New pending request (200) or already under review (202):
        // the server's message says exactly what happened.
        setVerifyState('pending');
        setVerifyMessage(data.message);
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 422) {
        // "You are already enrolled." — sync state just in case.
        await refreshUser().catch(() => undefined);
        setVerifyState('success');
        setVerifyMessage('You are already enrolled.');
      } else {
        setVerifyState('error');
        setVerifyMessage(extractErrorMessage(e));
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      // Token is gone — RootNavigator returns to the Auth stack on its own.
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{user.name}</Text>
          {user.email ? (
            <Text style={styles.email}>{user.email}</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.pill,
            enrolled ? styles.pillEnrolled : styles.pillGuest,
          ]}
        >
          <Text
            style={[
              styles.pillText,
              enrolled ? styles.pillTextEnrolled : styles.pillTextGuest,
            ]}
          >
            {enrolled ? 'Enrolled Student' : 'Guest'}
          </Text>
        </View>
      </View>

      {enrolled && user.enrollment_id ? (
        <View style={styles.rollRow}>
          <Text style={styles.rollLabel}>Roll ID</Text>
          <Text style={styles.rollValue}>{user.enrollment_id}</Text>
        </View>
      ) : null}

      {/* Guest upsell banner */}
      {isGuest ? (
        <View style={styles.card}>
          <FormBanner
            kind="info"
            message="You're browsing as a guest. Create a free account to save your progress and unlock 2 free tests per module."
          />
          <PrimaryButton
            title="Create an Account / Log In"
            onPress={handleLogout}
            loading={loggingOut}
            disabled={loggingOut}
          />
        </View>
      ) : null}

      {/* Roll ID verification (BR-02) — guests only */}
      {!enrolled ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Verify your enrollment</Text>
          {isGuest ? (
            <FormBanner
              kind="info"
              message="Your roll ID links to an account. Create a free account first — verifying then unlocks the enrolled test allowance."
            />
          ) : (
            <Text style={styles.cardSubtitle}>
              Enter the roll ID your institute gave you to unlock the enrolled
              test allowance.
            </Text>
          )}

          {verifyState !== 'idle' && verifyMessage ? (
            <FormBanner
              kind={
                verifyState === 'success'
                  ? 'success'
                  : verifyState === 'pending'
                    ? 'info'
                    : 'error'
              }
              message={verifyMessage}
            />
          ) : null}

          <TextField
            label="Institute roll ID"
            value={rollId}
            onChangeText={setRollId}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={isGuest ? undefined : handleVerify}
            placeholder="e.g. ROLL-101"
            editable={!isGuest}
          />
          {isGuest ? (
            <PrimaryButton
              title="Create Account to Verify"
              onPress={handleLogout}
              loading={loggingOut}
              disabled={loggingOut}
            />
          ) : (
            <PrimaryButton
              title="Verify Enrollment"
              onPress={handleVerify}
              loading={verifying}
              disabled={verifying}
            />
          )}
        </View>
      ) : null}

      <View style={styles.logoutRow}>
        <PrimaryButton
          title={isGuest ? 'Exit Guest Mode / Sign In' : 'Log out'}
          onPress={handleLogout}
          loading={loggingOut}
          disabled={loggingOut}
          variant="outlined"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
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
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    width: '100%',
    maxWidth: 240,
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#6750A4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1D1B20',
  },
  email: {
    fontSize: 13,
    color: '#49454F',
    marginTop: 2,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillEnrolled: {
    backgroundColor: '#E8F5E9',
  },
  pillGuest: {
    backgroundColor: '#F3EDF7',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillTextEnrolled: {
    color: '#1B5E20',
  },
  pillTextGuest: {
    color: '#49454F',
  },
  rollRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  rollLabel: {
    fontSize: 14,
    color: '#49454F',
  },
  rollValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D1B20',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 16,
    lineHeight: 20,
  },
  logoutRow: {
    marginTop: 8,
  },
});
