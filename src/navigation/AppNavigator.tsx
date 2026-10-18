import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import NotesScreen from '../screens/app/NotesScreen';
import ProfileScreen from '../screens/app/ProfileScreen';
import TestRunnerScreen from '../screens/app/TestRunnerScreen';
import TestsScreen from '../screens/app/TestsScreen';

export type AppTabParamList = {
  Tests: undefined;
  Notes: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  MainTabs: undefined;
  TestRunner: { testId: number };
};

const Tab = createBottomTabNavigator<AppTabParamList>();
const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Bottom tabs live inside a stack so full-screen flows (the test runner)
 * can push on top of them. Screens inside the tabs reach the stack via
 * CompositeScreenProps (see TestsScreen).
 */
function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Tests" component={TestsScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TestRunner"
        component={TestRunnerScreen}
        options={{ title: 'Test' }}
      />
    </Stack.Navigator>
  );
}
