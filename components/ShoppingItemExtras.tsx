'use client';

import { startTransition, useActionState, useId, useState } from 'react';
import { saveClaimNote, setPurchased } from '@/app/actions/claims';
import { ActionForm, FormMessage } from './ActionForm';

/**
 * The claimer's own memory aids on their shopping list: a "Got it" toggle and
 * a private note. Stored in a claimer-only table; nobody else ever sees them.
 */
export function ShoppingItemExtras({
  giftId,
  purchased,
  note,
}: {
  giftId: string;
  purchased: boolean;
  note: string | null;
}) {
  const [state, toggleAction, pending] = useActionState(setPurchased, null);
  const [editing, setEditing] = useState(false);
  const id = useId();

  return (
    <div className="space-y-3">
      <form
        action={toggleAction}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => toggleAction(data));
        }}
      >
        <input type="hidden" name="giftId" value={giftId} />
        <input type="hidden" name="purchased" value={purchased ? 'false' : 'true'} />
        <button
          type="submit"
          role="switch"
          aria-checked={purchased}
          disabled={pending}
          data-testid="got-it"
          className={`flex min-h-12 items-center gap-3 rounded-xl border-2 px-4 text-lg font-semibold ${
            purchased ? 'border-pine bg-pine text-white' : 'border-pine/40 bg-white text-pine'
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex size-7 items-center justify-center rounded-md border-2 ${
              purchased ? 'border-white bg-white text-pine' : 'border-pine/60'
            }`}
          >
            {purchased ? '✓' : ''}
          </span>
          {purchased ? 'Got it!' : 'Got it?'}
        </button>
      </form>
      <FormMessage state={state} />

      {note && !editing && (
        <div className="rounded-xl bg-cream p-3" data-testid="private-note">
          <p className="text-base text-muted">📝 Your note (only you can see this)</p>
          <p className="text-lg whitespace-pre-line break-words">{note}</p>
          <button type="button" className="btn-link mt-1" onClick={() => setEditing(true)}>
            Edit note
          </button>
        </div>
      )}

      {!note && !editing && (
        <button type="button" className="btn-link" onClick={() => setEditing(true)}>
          📝 Add a note for yourself
        </button>
      )}

      {editing && (
        <div className="rounded-xl bg-cream p-4">
          <ActionForm
            action={saveClaimNote}
            submitLabel="Save note"
            pendingLabel="Saving…"
            buttonClassName="btn-secondary"
            onSuccess={() => setEditing(false)}
            extraButtons={
              <button type="button" className="btn-link" onClick={() => setEditing(false)}>
                Cancel
              </button>
            }
          >
            <input type="hidden" name="giftId" value={giftId} />
            <div>
              <label htmlFor={`${id}-note`} className="label">
                Your note <span className="font-normal text-muted">(only you can see this)</span>
              </label>
              <textarea
                id={`${id}-note`}
                name="note"
                rows={2}
                maxLength={500}
                defaultValue={note ?? ''}
                placeholder="e.g. Ordered online, arrives 12 Dec"
                className="input"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
