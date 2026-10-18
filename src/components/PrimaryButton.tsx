import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'filled' | 'outlined';
}

/** Material Design 3 filled / outlined button. */
export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'filled',
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'filled' ? styles.filled : styles.outlined,
        isDisabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'filled' ? '#FFFFFF' : '#6750A4'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'filled' ? styles.labelFilled : styles.labelOutlined,
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  filled: {
    backgroundColor: '#6750A4',
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#79747E',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  labelFilled: {
    color: '#FFFFFF',
  },
  labelOutlined: {
    color: '#6750A4',
  },
});
