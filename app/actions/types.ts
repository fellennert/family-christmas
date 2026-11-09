/** What every form action returns. `null` = nothing to show yet. */
export type ActionState = {
  error?: string;
  /** A friendly confirmation to show next to the form. */
  message?: string;
  /** Lets a form reset itself after success (changes on every success). */
  okAt?: number;
} | null;

export const ok = (message?: string): ActionState => ({ message, okAt: Date.now() });
export const fail = (error: string): ActionState => ({ error });
