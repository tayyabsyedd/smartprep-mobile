import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CatalogTest } from '../types';
import { formatPrice } from '../utils/format';
import { PrimaryButton } from './PrimaryButton';

interface PaywallModalProps {
  visible: boolean;
  test: CatalogTest | null;
  moduleName: string;
  /** Total free allowance for the module (2 guest / 5 enrolled). */
  allowance: number;
  onUnlock: () => void;
  onDismiss: () => void;
}

/** Bottom-sheet paywall shown on the backend's 403 quota_exceeded payload. */
export function PaywallModal({
  visible,
  test,
  moduleName,
  allowance,
  onUnlock,
  onDismiss,
}: PaywallModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Free attempts used up</Text>
          <Text style={styles.body}>
            You have used your {allowance} free attempt
            {allowance === 1 ? '' : 's'} for {moduleName}.
            {test ? ` Unlock "${test.title}" to keep practicing.` : ''}
          </Text>

          {test && !test.is_free && test.price != null ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Unlock price</Text>
              <Text style={styles.priceValue}>{formatPrice(test.price)}</Text>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <PrimaryButton title="Unlock now" onPress={onUnlock} />
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.dismissRow}>
            <Text style={styles.dismissText}>Not now</Text>
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
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F3EDF7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 14,
    color: '#49454F',
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1D1B20',
  },
  buttonRow: {
    marginBottom: 4,
  },
  dismissRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6750A4',
  },
});
