import type { EmailType } from './templates';

export interface JobData {
  kind: 'customer' | 'owner';
  type: EmailType;
  bookingId: string;
  notificationId: string;
}

// Abstract class so it can be used as an injection token (BullMQ in production and tests).
export abstract class JobQueue {
  /** Adds a job. delayMs > 0 = delayed job (reminders). The same jobId is never added twice. */
  abstract add(data: JobData, opts: { jobId: string; delayMs?: number }): Promise<void>;
  /** Removes a waiting or delayed job. Returns false if there was nothing to remove. */
  abstract remove(jobId: string): Promise<boolean>;
  /** Milliseconds before a delayed job runs, or null if the job does not exist. */
  abstract delayOf(jobId: string): Promise<number | null>;
  /** Is Redis answering? Used by the readiness check. */
  abstract ping(): Promise<boolean>;
  /** Starts the worker. onFinalFailure is called once all attempts have failed. */
  abstract start(
    handler: (data: JobData) => Promise<void>,
    onFinalFailure: (data: JobData, error: Error) => Promise<void>,
  ): void;
}
