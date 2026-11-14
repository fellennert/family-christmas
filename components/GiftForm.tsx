'use client';

import { useId } from 'react';
import { addGift, updateGift } from '@/app/actions/gifts';
import { LIMITS } from '@/lib/gifts';
import { ActionForm } from './ActionForm';

type Props =
  | { mode: 'add'; familyId: string; recipientId: string; submitLabel?: string; titlePlaceholder?: string }
  | {
      mode: 'edit';
      giftId: string;
      initial: { title: string; url: string | null; notes: string | null };
      onDone?: () => void;
    };

/** Add or edit a gift: title (required), link and notes (optional). */
export function GiftForm(props: Props) {
  const id = useId();
  const initial = props.mode === 'edit' ? props.initial : { title: '', url: null, notes: null };

  return (
    <ActionForm
      action={props.mode === 'add' ? addGift : updateGift}
      submitLabel={props.mode === 'add' ? (props.submitLabel ?? 'Add to list') : 'Save changes'}
      pendingLabel="Saving…"
      resetOnSuccess={props.mode === 'add'}
      onSuccess={props.mode === 'edit' ? props.onDone : undefined}
      testId={props.mode === 'add' ? 'add-gift-form' : 'edit-gift-form'}
    >
      {props.mode === 'add' ? (
        <>
          <input type="hidden" name="familyId" value={props.familyId} />
          <input type="hidden" name="recipientId" value={props.recipientId} />
        </>
      ) : (
        <input type="hidden" name="giftId" value={props.giftId} />
      )}
      <div>
        <label htmlFor={`${id}-title`} className="label">
          What is it?
        </label>
        <input
          id={`${id}-title`}
          name="title"
          required
          maxLength={LIMITS.title}
          defaultValue={initial.title}
          placeholder={props.mode === 'add' ? (props.titlePlaceholder ?? 'e.g. Warm slippers') : undefined}
          className="input"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={`${id}-url`} className="label">
          Link <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${id}-url`}
          name="url"
          type="url"
          inputMode="url"
          maxLength={LIMITS.url}
          defaultValue={initial.url ?? ''}
          placeholder="https://…"
          className="input"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={`${id}-notes`} className="label">
          Notes <span className="font-normal text-muted">(optional: size, color…)</span>
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={LIMITS.notes}
          defaultValue={initial.notes ?? ''}
          className="input"
        />
      </div>
    </ActionForm>
  );
}
