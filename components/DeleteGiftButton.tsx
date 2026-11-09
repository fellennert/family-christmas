'use client';

import { useRef } from 'react';
import { deleteGift } from '@/app/actions/gifts';
import { ActionForm } from './ActionForm';

/**
 * Delete with a confirmation dialog.
 *
 * Privacy (SPEC §5.3): the dialog text depends only on the gift's title. It is
 * identical whether or not anyone has claimed the gift, and the component is
 * never given claim information.
 */
export function DeleteGiftButton({ giftId, title }: { giftId: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="btn-danger" onClick={() => dialog.current?.showModal()}>
        Delete
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-gold/60 p-0 backdrop:bg-ink/50"
        aria-labelledby={`del-${giftId}`}
      >
        <div className="space-y-4 p-6">
          <h2 id={`del-${giftId}`} className="text-2xl">
            Remove “{title}”?
          </h2>
          <p className="text-lg">It will disappear from the list. You can’t undo this.</p>
          <ActionForm
            action={deleteGift}
            submitLabel="Yes, remove it"
            pendingLabel="Removing…"
            buttonClassName="btn-danger"
            onSuccess={() => dialog.current?.close()}
            extraButtons={
              <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
                Keep it
              </button>
            }
          >
            <input type="hidden" name="giftId" value={giftId} />
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
