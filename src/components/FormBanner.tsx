import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type BannerKind = 'error' | 'info' | 'success';

const COLORS: Record<BannerKind, { bg: string; text: string }> = {
  error: { bg: '#F9DEDC', text: '#410E0B' },
  info: { bg: '#E8DEF8', text: '#1D1B20' },
  success: { bg: '#E8F5E9', text: '#1B5E20' },
};

/** Inline message banner for form-level errors, info, and success states. */
export function FormBanner({ kind, message }: { kind: BannerKind; message: string }) {
  const colors = COLORS[kind];
  return (
    <View style={[styles.box, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
});
