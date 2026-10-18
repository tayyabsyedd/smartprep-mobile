import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Minimal placeholder — real UI lands in a later phase. */
export default function NotesScreen() {
  return (
    <View style={styles.center}>
      <Text>Notes Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
