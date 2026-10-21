import { colors } from '../theme';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api, extractErrorMessage } from '../services/api';
import { FormBanner } from './FormBanner';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

interface RollIdUnlockModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Fired after a successful verification — the parent opens the document. */
  onUnlocked: () => void;
}

/**
 * Prompt shown when a guest (or a non-enrolled student) taps an
 * enrolled-only note. Logged-in students verify their roll ID in place;
 * guests are routed to account creation first, since verification needs
 * an account.
 */
export function RollIdUnlockModal({
  visible,
  onDismiss,
  onUnlocked,
}: RollIdUnlockModalProps) {
  const { isGuest, logout, refreshUser } = useAuth();
  const [rollId, setRollId] = useState('');
  const [rollError, setRollError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      setRollId('');
      setRollError(undefined);
      setBusy(false);
      setNotice(null);
    }
  }, [visible]);

  const handleVerify = async () => {
    const id = rollId.trim();
    if (!id) {
      setRollError('Enter your institute roll ID.');
      return;
    }
    setRollError(undefined);
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await api.post<{
        message: string;
        is_enrolled?: boolean;
      }>('/enrollment/verify', { roll_id: id });

      if (data.is_enrolled) {
        await refreshUser();
        onUnlocked();
      } else {
        setNotice({
          kind: 'info',
          message: data.message || 'Your request is under review.',
        });
      }
    } catch (e) {
      // Already enrolled (422): sync state and unlock anyway.
      if (axios.isAxiosError(e) && e.response?.status === 422) {
        await refreshUser();
        onUnlocked();
        return;
      }
      setNotice({ kind: 'error', message: extractErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleGuestContinue = () => {
    // Verification needs an account: exit guest mode to the Auth stack,
    // the same pattern the Profile tab uses.
    void logout();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Enrolled Students Only</Text>
            <Text style={styles.body}>
              {isGuest
                ? 'This note is for enrolled students. Create a free account, then verify your institute roll ID to unlock it.'
                : 'Enter your institute roll ID to unlock enrolled notes.'}
            </Text>

            {notice ? (
              <View style={styles.bannerGap}>
                <FormBanner kind={notice.kind} message={notice.message} />
              </View>
            ) : null}

            <TextField
              label="Institute Roll ID"
              value={rollId}
              onChangeText={setRollId}
              error={rollError}
              autoCapitalize="characters"
              placeholder="e.g. ROLL-101"
              onSubmitEditing={isGuest ? handleGuestContinue : handleVerify}
            />

            <View style={styles.buttonGap}>
              {isGuest ? (
                <PrimaryButton
                  title="Create free account"
                  onPress={handleGuestContinue}
                />
              ) : (
                <PrimaryButton
                  title={busy ? 'Verifying…' : 'Verify & Unlock'}
                  onPress={handleVerify}
                  loading={busy}
                  disabled={busy}
                />
              )}
            </View>
          </ScrollView>
          <TouchableOpacity onPress={onDismiss} style={styles.dismissRow}>
            <Text style={styles.dismissText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#49454F',
    lineHeight: 22,
    marginBottom: 16,
  },
  bannerGap: {
    marginBottom: 16,
  },
  buttonGap: {
    marginTop: 8,
    marginBottom: 4,
  },
  dismissRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
