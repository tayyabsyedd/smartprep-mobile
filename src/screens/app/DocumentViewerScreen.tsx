import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  DownloadTask,
  File,
  Paths,
  type DownloadProgress,
} from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { FormBanner } from '../../components/FormBanner';
import { PrimaryButton } from '../../components/PrimaryButton';
import type { AppStackParamList } from '../../navigation/AppNavigator';
import { getToken } from '../../utils/storage';

type Props = NativeStackScreenProps<AppStackParamList, 'DocumentViewer'>;

type Phase = 'downloading' | 'ready' | 'error';

/**
 * Secure in-app PDF reader (M6 / BR-13).
 *
 * The PDF is downloaded with the Sanctum bearer token (guests can fetch
 * public notes without one) into the app's sandboxed cache directory and
 * rendered from the local file — the stream URL is never shown to the
 * user. The cached copy is deleted on unmount, and screenshots / screen
 * recording are blocked while the viewer is open (Android FLAG_SECURE).
 */
export default function DocumentViewerScreen({ navigation, route }: Props) {
  const { documentId, title } = route.params;

  const [phase, setPhase] = useState<Phase>('downloading');
  const [progress, setProgress] = useState<number | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const taskRef = useRef<DownloadTask | null>(null);
  const fileRef = useRef<File | null>(null);

  const download = useCallback(async () => {
    setPhase('downloading');
    setError(null);
    setProgress(null);
    setLocalUri(null);
    try {
      const baseURL = process.env.EXPO_PUBLIC_API_URL;
      if (!baseURL) throw new Error('The API URL is not configured.');

      const dest = new File(Paths.cache, `smartprep-doc-${documentId}.pdf`);
      // Start clean: a stale copy from a killed session must not block us.
      await deleteAsync(dest.uri, { idempotent: true }).catch(() => {});
      const token = await getToken();

      const task = new DownloadTask(
        `${baseURL}/documents/${documentId}/stream`,
        dest,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          onProgress: (p: DownloadProgress) => {
            if (p.totalBytes > 0) {
              setProgress(p.bytesWritten / p.totalBytes);
            }
          },
        }
      );
      taskRef.current = task;

      const file = await task.downloadAsync();
      taskRef.current = null;

      if (!file) {
        // Paused/cancelled — the unmount cleanup handles the file.
        return;
      }
      fileRef.current = file;
      setLocalUri(file.uri);
      setPhase('ready');
    } catch (e) {
      taskRef.current = null;
      const message = e instanceof Error ? e.message : 'Could not load the document.';
      setError(
        /\b403\b/.test(message)
          ? 'This document is available to enrolled students only.'
          : message
      );
      setPhase('error');
    }
  }, [documentId]);

  // Screenshot / screen-recording block while the viewer is open.
  useEffect(() => {
    preventScreenCaptureAsync().catch(() => {});
    return () => {
      allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  // Download (re-download on retry); cancel the transfer and delete the
  // cached copy on unmount.
  useEffect(() => {
    void download();
    return () => {
      taskRef.current?.cancel();
      taskRef.current = null;
      const file = fileRef.current;
      fileRef.current = null;
      if (file) {
        deleteAsync(file.uri, { idempotent: true }).catch(() => {});
      }
    };
  }, [download, retryKey]);

  // Native header: document title + live page indicator.
  useEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () =>
        pageCount > 0 ? (
          <Text style={styles.pageIndicator}>
            {page} / {pageCount}
          </Text>
        ) : null,
    });
  }, [navigation, title, page, pageCount]);

  if (phase === 'downloading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6750A4" />
        <Text style={styles.statusText}>
          {progress !== null
            ? `Downloading… ${Math.round(progress * 100)}%`
            : 'Loading document…'}
        </Text>
      </View>
    );
  }

  if (phase === 'error' || !localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Couldn&apos;t open the document</Text>
        {error ? <FormBanner kind="error" message={error} /> : null}
        <View style={styles.retryButton}>
          <PrimaryButton
            title="Retry"
            onPress={() => setRetryKey((k) => k + 1)}
          />
        </View>
      </View>
    );
  }

  return (
    <Pdf
      source={{ uri: localUri, cache: false }}
      onLoadComplete={(numPages) => {
        setPageCount(numPages);
        setPage(1);
      }}
      onPageChanged={(p) => setPage(p)}
      onError={(err) => {
        setError(err?.message ?? 'Could not render the PDF.');
        setPhase('error');
      }}
      style={styles.pdf}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FEF7FF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D1B20',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusText: {
    marginTop: 16,
    fontSize: 15,
    color: '#49454F',
  },
  retryButton: {
    width: '100%',
    maxWidth: 240,
    marginTop: 16,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: '600',
    color: '#49454F',
    marginRight: 4,
  },
  pdf: {
    flex: 1,
    backgroundColor: '#E7E0EC',
  },
});
