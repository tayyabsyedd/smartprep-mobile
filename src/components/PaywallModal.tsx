import { colors } from '../theme';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { extractErrorMessage } from '../services/api';
import { initiatePurchase, uploadSlip } from '../services/purchases';
import type {
  CatalogTest,
  InitiatePurchaseResponse,
  PaymentMethod,
} from '../types';
import { formatPrice } from '../utils/format';
import { FormBanner } from './FormBanner';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

interface PaywallModalProps {
  visible: boolean;
  test: CatalogTest | null;
  moduleName: string;
  /** Total free allowance for the module (2 guest / 5 enrolled). */
  allowance: number;
  /** Called after a purchase completes — the parent closes the sheet and retries the test. */
  onUnlocked: () => void;
  onDismiss: () => void;
}

type SheetView = 'menu' | 'phone' | 'bank' | 'done';

const METHODS: { key: PaymentMethod; title: string; subtitle: string }[] = [
  {
    key: 'jazzcash',
    title: 'JazzCash Mobile Account',
    subtitle: 'Pay from your JazzCash wallet',
  },
  {
    key: 'easypaisa',
    title: 'Easypaisa Wallet',
    subtitle: 'Pay from your Easypaisa account',
  },
  {
    key: 'bank_transfer',
    title: 'Manual Bank Transfer',
    subtitle: 'Transfer & upload your receipt',
  },
];

/** Bottom-sheet paywall with the M4 checkout flow. */
export function PaywallModal({
  visible,
  test,
  moduleName,
  allowance,
  onUnlocked,
  onDismiss,
}: PaywallModalProps) {
  const [view, setView] = useState<SheetView>('menu');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [purchase, setPurchase] = useState<InitiatePurchaseResponse | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setView('menu');
      setMethod(null);
      setPhone('');
      setPhoneError(undefined);
      setPurchase(null);
      setBusy(false);
      setError(null);
      setDoneMessage(null);
    }
  }, [visible]);

  if (!test) return null;

  const startInitiate = async (
    paymentMethod: PaymentMethod,
    phoneNumber?: string
  ): Promise<InitiatePurchaseResponse | null> => {
    setBusy(true);
    setError(null);
    try {
      const res = await initiatePurchase({
        purchasable_type: 'test',
        purchasable_id: test.id,
        payment_method: paymentMethod,
        ...(phoneNumber ? { phone_number: phoneNumber } : {}),
      });
      return res;
    } catch (e) {
      setError(extractErrorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleMockPay = async () => {
    const res = await startInitiate('mock');
    if (res && res.status === 'completed') {
      onUnlocked();
    } else if (res) {
      setError(`Unexpected payment status: ${res.status}. Please try again.`);
    }
  };

  const handleMethodTap = (key: PaymentMethod) => {
    setMethod(key);
    setError(null);
    if (key === 'jazzcash' || key === 'easypaisa') {
      setView('phone');
    } else {
      void handleBankInitiate();
    }
  };

  const handleWalletPay = async () => {
    const digits = phone.replace(/\D/g, '');
    if (!/^03\d{9}$/.test(digits)) {
      setPhoneError('Enter your 11-digit mobile number (03XXXXXXXXX).');
      return;
    }
    setPhoneError(undefined);
    const res = await startInitiate(method as PaymentMethod, digits);
    if (!res) return;

    if (res.status === 'completed') {
      onUnlocked();
      return;
    }
    // Gateway handoff (or a clear "not configured yet" message from the API).
    setPurchase(res);
    setDoneMessage(
      res.payment_data?.post_url
        ? 'Payment created. Complete it on the gateway page, then return here — your test unlocks automatically once the payment confirms.'
        : 'Payment created with status: ' + res.status
    );
    setView('done');
  };

  const handleBankInitiate = async () => {
    const res = await startInitiate('bank_transfer');
    if (res) {
      setPurchase(res);
      setView('bank');
    } else {
      setView('menu');
    }
  };

  const handlePickSlip = async () => {
    if (!purchase) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picked.canceled || picked.assets.length === 0) return;

    const asset = picked.assets[0];
    const name =
      asset.fileName ?? `slip-${purchase.purchase_id}.jpg`;
    const type = asset.mimeType ?? 'image/jpeg';

    setBusy(true);
    setError(null);
    try {
      const res = await uploadSlip(purchase.purchase_id, {
        uri: asset.uri,
        name,
        type,
      });
      setDoneMessage(res.message);
      setView('done');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bank = purchase?.payment_data;

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
            {view === 'menu' && (
              <>
                <Text style={styles.title}>Free attempts used up</Text>
                <Text style={styles.body}>
                  You have used your {allowance} free attempt
                  {allowance === 1 ? '' : 's'} for {moduleName}. Unlock &ldquo;
                  {test.title}&rdquo; to keep practicing.
                </Text>

                {!test.is_free && test.price != null ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Unlock price</Text>
                    <Text style={styles.priceValue}>
                      {formatPrice(test.price)}
                    </Text>
                  </View>
                ) : null}

                {error && (
                  <View style={styles.bannerGap}>
                    <FormBanner kind="error" message={error} />
                  </View>
                )}

                {__DEV__ && (
                  <TouchableOpacity
                    style={[styles.methodRow, styles.mockRow]}
                    onPress={handleMockPay}
                    disabled={busy}
                  >
                    <View style={styles.methodText}>
                      <Text style={styles.methodTitle}>
                        Instant Test Pay (Mock)
                      </Text>
                      <Text style={styles.methodSubtitle}>
                        Dev only — completes immediately
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color="#1D6B3C" />
                    ) : (
                      <Text style={styles.chev}>›</Text>
                    )}
                  </TouchableOpacity>
                )}

                {METHODS.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.methodRow}
                    onPress={() => handleMethodTap(m.key)}
                    disabled={busy}
                  >
                    <View style={styles.methodText}>
                      <Text style={styles.methodTitle}>{m.title}</Text>
                      <Text style={styles.methodSubtitle}>{m.subtitle}</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {view === 'phone' && (
              <>
                <Text style={styles.title}>
                  {method === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} payment
                </Text>
                <Text style={styles.body}>
                  Enter the mobile number of your{' '}
                  {method === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} account.
                  You will approve the {formatPrice(test.price)} payment on
                  your phone.
                </Text>
                {error && (
                  <View style={styles.bannerGap}>
                    <FormBanner kind="error" message={error} />
                  </View>
                )}
                <TextField
                  label="Mobile number"
                  value={phone}
                  onChangeText={setPhone}
                  error={phoneError}
                  keyboardType="phone-pad"
                  placeholder="03XXXXXXXXX"
                  maxLength={11}
                />
                <View style={styles.buttonGap}>
                  <PrimaryButton
                    title={busy ? 'Creating payment…' : 'Pay now'}
                    onPress={handleWalletPay}
                    loading={busy}
                    disabled={busy}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setView('menu')}
                  style={styles.backRow}
                >
                  <Text style={styles.backText}>‹ Back to payment methods</Text>
                </TouchableOpacity>
              </>
            )}

            {view === 'bank' && (
              <>
                <Text style={styles.title}>Manual bank transfer</Text>
                <Text style={styles.body}>
                  Transfer {formatPrice(test.price)} to the institute account,
                  then upload your receipt below.
                </Text>
                {error && (
                  <View style={styles.bannerGap}>
                    <FormBanner kind="error" message={error} />
                  </View>
                )}
                <View style={styles.bankCard}>
                  <BankLine label="Bank" value={bank?.bank} />
                  <BankLine label="Account title" value={bank?.account_title} />
                  <BankLine
                    label="Account number"
                    value={bank?.account_number}
                  />
                  <BankLine label="IBAN" value={bank?.iban} mono />
                </View>
                {bank?.instructions ? (
                  <Text style={styles.instructions}>{bank.instructions}</Text>
                ) : null}
                <View style={styles.buttonGap}>
                  <PrimaryButton
                    title={busy ? 'Uploading…' : 'Upload receipt'}
                    onPress={handlePickSlip}
                    loading={busy}
                    disabled={busy}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setView('menu')}
                  style={styles.backRow}
                >
                  <Text style={styles.backText}>‹ Back to payment methods</Text>
                </TouchableOpacity>
              </>
            )}

            {view === 'done' && (
              <>
                <View style={styles.bannerGap}>
                  <FormBanner
                    kind="info"
                    message={
                      doneMessage ?? 'Payment recorded. You will be notified.'
                    }
                  />
                </View>
                <Text style={styles.body}>
                  {purchase?.status === 'pending_verification'
                    ? 'Verification pending — your test unlocks automatically once an admin verifies your receipt.'
                    : 'If the gateway confirms your payment, your test unlocks automatically.'}
                </Text>
                <View style={styles.buttonGap}>
                  <PrimaryButton title="Done" onPress={onDismiss} />
                </View>
              </>
            )}
          </ScrollView>

          {view === 'menu' && (
            <TouchableOpacity onPress={onDismiss} style={styles.dismissRow}>
              <Text style={styles.dismissText}>Not now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function BankLine({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <View style={styles.bankLine}>
      <Text style={styles.bankLabel}>{label}</Text>
      <Text style={[styles.bankValue, mono && styles.mono]}>
        {value || '—'}
      </Text>
    </View>
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
    maxHeight: '85%',
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
  bannerGap: {
    marginBottom: 16,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  mockRow: {
    borderColor: '#1D6B3C',
    backgroundColor: '#F1F8F3',
  },
  methodText: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1B20',
  },
  methodSubtitle: {
    fontSize: 13,
    color: '#49454F',
    marginTop: 2,
  },
  chev: {
    fontSize: 22,
    color: '#49454F',
    marginLeft: 8,
  },
  buttonGap: {
    marginTop: 8,
    marginBottom: 4,
  },
  backRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  bankCard: {
    backgroundColor: '#F3EDF7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  bankLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bankLabel: {
    fontSize: 14,
    color: '#49454F',
  },
  bankValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1B20',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  mono: {
    fontFamily: 'monospace',
  },
  instructions: {
    fontSize: 13,
    color: '#49454F',
    lineHeight: 19,
    marginBottom: 8,
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
