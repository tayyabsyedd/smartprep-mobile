import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppStackParamList } from '../../navigation/AppNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'TestRunner'>;

/**
 * Placeholder for the interactive test runner (timer, questions, auto-save,
 * submit/scoring). Built in the next step; navigation + paywall land here now.
 */
export default function TestRunnerScreen({ route }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Test #{route.params.testId}</Text>
      <Text style={styles.subtitle}>
        The full test engine — timer, questions, auto-save — lands in the next
        step.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FEF7FF',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#49454F',
    textAlign: 'center',
    lineHeight: 22,
  },
});
