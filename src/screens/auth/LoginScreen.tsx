import { NativeStackScreenProps } from '@react-navigation/native-stack';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    identifier.trim().length > 0 && password.length > 0 && !submitting;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = identifier.trim();
      // The API's `login` field accepts either identifier; route it explicitly.
      const credentials = /^[+\d][\d\s-]{5,}$/.test(id)
        ? { phone: id, password }
        : { email: id, password };
      await login(credentials);
      // Session is set — RootNavigator flips to the app tabs on its own.
    } catch (e) {
      // 401 ("Invalid credentials.") and network failures both land here
      // as one readable message.
      setError(extractErrorMessage(e));
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
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to continue learning.</Text>

        {error ? (
          <View style={styles.banner}>
            <FormBanner kind="error" message={error} />
          </View>
        ) : null}

        <TextField
          label="Email or phone"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <View style={styles.buttonRow}>
          <PrimaryButton
            title="Log in"
            onPress={handleLogin}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>New to SmartPrep? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.switchLink}>Create an account</Text>
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
    color: '#6750A4',
  },
});
