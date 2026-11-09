'use client';

import { useRef } from 'react';
import { GiftForm } from './GiftForm';

/** "Edit" toggle that reveals the gift form inline. */
export function EditGift(props: {
  giftId: string;
  initial: { title: string; url: string | null; notes: string | null };
}) {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={details} className="group w-full">
      <summary className="btn-secondary w-fit list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Edit</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <div className="mt-4 rounded-xl bg-cream p-4">
        <GiftForm
          mode="edit"
          giftId={props.giftId}
          initial={props.initial}
          onDone={() => details.current?.removeAttribute('open')}
        />
      </div>
    </details>
  );
}
