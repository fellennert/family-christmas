'use client';

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/app/actions/types';

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  buttonClassName?: string;
  className?: string;
  /** Clear the fields after a successful submit (for "add" forms). */
  resetOnSuccess?: boolean;
  /** Called after a successful submit (e.g. to close a dialog). */
  onSuccess?: () => void;
  /** Extra buttons placed next to the submit button. */
  extraButtons?: ReactNode;
  testId?: string;
};

/**
 * A form wired to a Server Action with pending state and a friendly message
 * area. Unlike a plain `<form action>`, it does not wipe what the person typed
 * when there is an error.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = 'Working…',
  buttonClassName = 'btn-primary',
  className = 'space-y-4',
  resetOnSuccess = false,
  onSuccess,
  extraButtons,
  testId,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!state?.okAt) return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccessRef.current?.();
  }, [state?.okAt, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={className}
      data-testid={testId}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClassName} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {extraButtons}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite" className="min-h-0">
      {state?.error && (
        <p role="alert" className="rounded-lg bg-cranberry-light px-4 py-2 text-lg text-cranberry-dark">
          {state.error}
        </p>
      )}
      {state?.message && !state.error && (
        <p role="status" className="rounded-lg bg-pine-light px-4 py-2 text-lg text-pine-dark">
          {state.message}
        </p>
      )}
    </div>
  );
}
