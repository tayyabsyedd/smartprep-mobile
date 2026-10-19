import { api } from './api';
import type {
  InitiatePurchaseRequest,
  InitiatePurchaseResponse,
  Purchase,
} from '../types';

/** POST /api/purchases/initiate — start a checkout. */
export async function initiatePurchase(
  input: InitiatePurchaseRequest
): Promise<InitiatePurchaseResponse> {
  const { data } = await api.post<InitiatePurchaseResponse>(
    '/purchases/initiate',
    input
  );
  return data;
}

export interface SlipFile {
  uri: string;
  name: string;
  type: string;
}

/**
 * POST /api/purchases/{id}/upload-slip — bank-transfer receipt.
 * Sent as multipart/form-data; the API validates image/PDF ≤ 5 MB.
 */
export async function uploadSlip(
  purchaseId: number,
  file: SlipFile
): Promise<{ message: string }> {
  const form = new FormData();
  // React Native FormData file part.
  form.append('slip', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  const { data } = await api.post<{ message: string }>(
    `/purchases/${purchaseId}/upload-slip`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
}

/** GET /api/purchases/my-purchases — the student's receipt history. */
export async function getMyPurchases(): Promise<Purchase[]> {
  const { data } = await api.get<{ purchases: Purchase[] }>(
    '/purchases/my-purchases'
  );
  return data.purchases;
}
