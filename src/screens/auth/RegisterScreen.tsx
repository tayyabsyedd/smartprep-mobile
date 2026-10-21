import { colors } from '../../theme';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import axios from 'axios';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../context/AuthContext';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import { extractErrorMessage } from '../../services/api';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Typing in a field clears that field's error. */
  const bind =
    (setter: (v: string) => void, field: string) => (text: string) => {
      setter(text);
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    };

  /** Mirrors the API rules (RegisterRequest): name/email required, pw min 8. */
  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Please enter your full name.';
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Enter a valid email address.';
    if (phone.trim() && phone.trim().length > 30)
      errs.phone = 'Phone number is too long.';
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 8)
      errs.password = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleRegister = async () => {
    if (submitting) return;
    const errs = validate();
    setFieldErrors(errs);
    setGeneralError(null);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
      });
      // Auto-login: the session is set, RootNavigator flips to the app tabs.
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 422) {
        // Laravel validation: show each message under its field.
        const data = e.response.data as {
          errors?: Record<string, string[]>;
        };
        if (data.errors && typeof data.errors === 'object') {
          const mapped: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.errors)) {
            if (Array.isArray(messages) && messages.length > 0) {
              mapped[field] = messages[0];
            }
          }
          setFieldErrors(mapped);
        } else {
          setGeneralError(extractErrorMessage(e));
        }
      } else {
        setGeneralError(extractErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Two free practice tests per module — no card needed.
        </Text>

        {generalError ? (
          <View style={styles.banner}>
            <FormBanner kind="error" message={generalError} />
          </View>
        ) : null}

        <TextField
          label="Full name"
          value={name}
          onChangeText={bind(setName, 'name')}
          error={fieldErrors.name}
          autoCapitalize="words"
          returnKeyType="next"
          placeholder="Ali Raza"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={bind(setEmail, 'email')}
          error={fieldErrors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          placeholder="you@example.com"
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={bind(setPhone, 'phone')}
          error={fieldErrors.phone}
          autoCapitalize="none"
          keyboardType="phone-pad"
          returnKeyType="next"
          placeholder="03xx xxxxxxx"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={bind(setPassword, 'password')}
          error={fieldErrors.password}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleRegister}
          placeholder="At least 8 characters"
        />

        <View style={styles.buttonRow}>
          <PrimaryButton
            title="Create account"
            onPress={handleRegister}
            loading={submitting}
            disabled={submitting}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchLink}>Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FEF7FF',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#49454F',
    marginBottom: 24,
  },
  banner: {
    marginBottom: 8,
  },
  buttonRow: {
    marginTop: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  switchText: {
    fontSize: 14,
    color: '#49454F',
  },
  switchLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
});
