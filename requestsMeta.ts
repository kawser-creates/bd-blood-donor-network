/** Pure constants/helpers for requests (no Supabase import, so unit tests need no environment). */
import type { MessageKey } from '../messages';

export const PRIORITIES = ['critical', 'urgent', 'normal'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REQUEST_STATUSES = ['pending', 'notification_sent', 'donor_responded', 'donor_confirmed', 'completed', 'cancelled', 'expired'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_STATUSES: readonly RequestStatus[] = ['pending', 'notification_sent', 'donor_responded', 'donor_confirmed'];

export const PRIORITY_KEY = {
  critical: 'rqPriorityCritical', urgent: 'rqPriorityUrgent', normal: 'rqPriorityNormal',
} as const satisfies Record<Priority, MessageKey>;

export const STATUS_KEY = {
  pending: 'rqStPending', notification_sent: 'rqStNotified', donor_responded: 'rqStResponded',
  donor_confirmed: 'rqStConfirmed', completed: 'rqStCompleted', cancelled: 'rqStCancelled', expired: 'rqStExpired',
} as const satisfies Record<RequestStatus, MessageKey>;

export const PAGE_SIZE = 20;

export function dialNumber(p: string): string {
  return p.startsWith('+') || p.startsWith('0') ? p : `+${p}`;
}
