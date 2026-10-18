import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';

/**
 * Session-driven root: splash while the boot check settles, then the
 * Auth stack (no token and not a guest) or the app tabs (token or guest
 * mode). A 401 anywhere drops the token via the api interceptor ->
 * AuthProvider resets -> we land back here. Guest 401s are per-screen
 * errors and never bounce the guest to the Auth stack.
 */
export default function RootNavigator() {
  const { token, isGuest, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {token || isGuest ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
