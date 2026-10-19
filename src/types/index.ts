/**
 * Domain types mirroring the smartprep-api JSON contracts.
 *
 * Sources of truth (Laravel):
 * - User / AuthResponse .... App\Http\Resources\UserResource,
 *                             App\Http\Controllers\Api\AuthController
 * - Subject, Module, Test ... App\Models\*
 * - StudyDocument ........... App\Http\Controllers\Api\DocumentController
 * - Enrollment .............. App\Http\Controllers\Api\EnrollmentController
 *
 * Keep these in sync with the backend. When a contract changes,
 * `npx tsc --noEmit` will surface every call site that needs updating.
 */

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------

export type UserRole = 'student' | 'instructor' | 'admin';

export interface ModuleQuota {
  id: number;
  name: string;
  subject: string | null;
  free_tests_remaining: number;
}

export interface Entitlement {
  /** Lowercased class basename from the API: 'test' | 'bundle'. */
  type: string;
  id: number;
  title: string | null;
  source: string;
  granted_at: string | null;
}

export interface User {
  id: number;
  name: string;
  email: string;
  /** Nullable: phone is optional at registration. */
  phone: string | null;
  role: UserRole;
  is_enrolled: boolean;
  enrollment_id: string | null;
  /** Per-module free-test allowance, from GET /api/auth/me. */
  modules: ModuleQuota[];
  /** Live entitlements (purchased/unlocked tests & bundles). */
  entitlements: Entitlement[];
}

/** POST /api/auth/register and POST /api/auth/login */
export interface AuthResponse {
  message: string;
  token: string;
  token_type: 'Bearer';
  user: User;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginPayload {
  /** Email address or phone number. */
  login: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Subject {
  id: number;
  name: string;
  slug: string;
}

export interface Module {
  id: number;
  subject_id: number;
  name: string;
  description: string | null;
}

export type TestKind = 'practice' | 'mock';

export interface Test {
  id: number;
  module_id: number;
  title: string;
  description: string | null;
  kind: TestKind;
  timed: boolean;
  duration_minutes: number | null;
  is_free: boolean;
  /**
   * Laravel's `decimal:2` cast serializes as a string on the wire
   * (e.g. "499.00"), so both shapes are accepted.
   */
  price: number | string | null;
}

/**
 * Named StudyDocument (not Document) to avoid shadowing the DOM `Document`
 * global. Shape matches the API's `documents` table row.
 */
export type DocumentVisibility = 'public' | 'enrolled';

export interface StudyDocument {
  id: number;
  subject_id: number;
  module_id: number;
  chapter: string | null;
  title: string;
  visibility: DocumentVisibility;
  file_path: string;
}

// ---------------------------------------------------------------------------
// Enrollment — POST /api/enrollment/verify
// ---------------------------------------------------------------------------

export interface EnrollmentVerifyPayload {
  roll_id: string;
}

/**
 * NOTE: the real API returns `{ message, is_enrolled }` — there is no
 * `status: 'enrolled' | 'pending'` field. Typed to the wire contract.
 */
export interface EnrollmentVerifyResponse {
  message: string;
  is_enrolled: boolean;
  /** Present with HTTP 202 when an identical pending request already exists. */
  request?: {
    id: number;
    enrollment_id: string;
    status: string;
  };
}

// ---------------------------------------------------------------------------
// API error shapes (used by the network layer)
// ---------------------------------------------------------------------------

/** Laravel 422 validation payload: { message, errors: { field: [...] } } */
export interface LaravelValidationError {
  message: string;
  errors: Record<string, string[]>;
}

/** General Laravel error payload: { message } (401, 403, 404, 422, 500). */
export interface LaravelError {
  message: string;
}

/** GET /api/tests catalog tree. */
export interface CatalogTest {
  id: number;
  title: string;
  kind: TestKind;
  timed: boolean;
  duration_minutes: number | null;
  is_free: boolean;
  price: number | string | null;
  question_count: number;
}

export interface CatalogModule {
  id: number;
  name: string;
  subject: string;
  /** Per-module free-attempt quota; 2 for guests (no token). */
  remaining_quota: number;
  tests: CatalogTest[];
}

export interface CatalogSubject {
  id: number;
  name: string;
  modules: CatalogModule[];
}

export interface TestsCatalogResponse {
  subjects: CatalogSubject[];
}

/** Exact 403 payload from AccessService::ensureCanAttempt. */
export interface QuotaExceededPayload {
  error: 'quota_exceeded';
  message: string;
  test_id: number;
}

/** GET /api/documents index tree (public; enrolled docs carry lock flags). */
export interface DocumentsIndexDocument {
  id: number;
  title: string;
  visibility: DocumentVisibility;
}

export interface DocumentsIndexChapter {
  chapter: string | null;
  documents: DocumentsIndexDocument[];
}

export interface DocumentsIndexModule {
  id: number | null;
  name: string;
  sort_order: number;
  chapters: DocumentsIndexChapter[];
}

export interface DocumentsIndexSubject {
  id: number;
  name: string;
  sort_order: number;
  modules: DocumentsIndexModule[];
}

export interface DocumentsIndexResponse {
  subjects: DocumentsIndexSubject[];
}

/** POST /api/tests/{id}/start — sanitized questions (no answers/explanations). */
export type QuestionType = 'mcq' | 'true_false' | 'multi_select';

export interface AttemptQuestion {
  question_id: number;
  qtype: QuestionType;
  question_text: string;
  options: string[];
  marks: number;
}

export interface StartAttemptResponse {
  attempt_id: number;
  /** ISO timestamp — used to compute remaining time on resume. */
  started_at: string;
  /** Total seconds for the attempt; null = untimed. */
  duration_seconds: number | null;
  resumed: boolean;
  questions: AttemptQuestion[];
}

/**
 * NOTE: the real API takes a BATCH under `answers`, with `selected` (not
 * `selected_option_ids`) holding option indices — typed to the wire contract.
 */
export interface AnswerPayloadItem {
  question_id: number;
  selected: number[];
  time_spent_seconds?: number;
}

/** GET /api/test-attempts/{id}/results — full scorecard. */
export interface ResultsQuestion {
  question_id: number;
  qtype: QuestionType;
  question_text: string;
  options: string[];
  selected_options: number[];
  selected_labels: (string | null)[];
  correct_options: number[];
  correct_labels: (string | null)[];
  is_correct: boolean;
  marks: number;
  marks_obtained: number;
  time_spent_seconds: number;
  explanation: string | null;
}

export interface AttemptResults {
  attempt_id: number;
  test: { id: number; title: string; module: string };
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  pass_percentage: number;
  time_spent_seconds: number;
  app_switches: number;
  submitted_at: string | null;
  questions: ResultsQuestion[];
}
