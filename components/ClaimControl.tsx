'use client';

import { startTransition, useActionState } from 'react';
import { claimOrUnclaim } from '@/app/actions/claims';
import { FormMessage } from './ActionForm';

type Props = {
  giftId: string;
  /** Only ever rendered on someone else's list; never for the recipient. */
  status: 'unclaimed' | 'mine' | 'other';
  removed?: boolean;
};

/**
 * Claim / unclaim / dismiss button for one gift. A single component (and a
 * single action state) handles all three, so a message such as "Someone just
 * claimed this" survives the page refreshing underneath it.
 */
export function ClaimControl({ giftId, status, removed = false }: Props) {
  const [state, formAction, pending] = useActionState(claimOrUnclaim, null);

  let op: 'claim' | 'unclaim' | 'dismiss' | null = null;
  let label = '';
  let className = 'btn-claim';
  if (status === 'unclaimed' && !removed) {
    op = 'claim';
    label = 'I’m getting this';
  } else if (status === 'mine' && removed) {
    op = 'dismiss';
    label = 'Dismiss';
    className = 'btn-secondary';
  } else if (status === 'mine') {
    op = 'unclaim';
    label = 'Unclaim';
    className = 'btn-secondary';
  }

  return (
    <div className="space-y-2">
      {op && (
        <form
          action={formAction}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <input type="hidden" name="giftId" value={giftId} />
          <input type="hidden" name="op" value={op} />
          <button type="submit" className={className} disabled={pending}>
            {pending ? 'One moment…' : label}
          </button>
        </form>
      )}
      <FormMessage state={state} />
    </div>
  );
}
