import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import NotesScreen from '../screens/app/NotesScreen';
import ProfileScreen from '../screens/app/ProfileScreen';
import TestsScreen from '../screens/app/TestsScreen';

export type AppTabParamList = {
  Tests: undefined;
  Notes: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

/** Shown when a session token exists. Real screens come in later phases. */
export default function AppNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Tests" component={TestsScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
