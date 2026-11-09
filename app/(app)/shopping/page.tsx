import type { Metadata } from 'next';
import Link from 'next/link';
import { ClaimControl } from '@/components/ClaimControl';
import { GiftTitle } from '@/components/GiftTitle';
import { getShoppingList } from '@/lib/data';

export const metadata: Metadata = { title: 'My shopping list' };

/** SPEC §4.5: everything I've claimed, grouped by recipient. */
export default async function ShoppingPage() {
  const groups = await getShoppingList();
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <h1 className="text-3xl">My shopping list</h1>
      {total === 0 ? (
        <div className="card space-y-3">
          <p className="text-lg">Nothing here yet. Open someone’s list and tap “I’m getting this”.</p>
          <Link href="/" className="btn-primary">
            See the family
          </Link>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.recipientId ?? 'former'} className="space-y-3" aria-label={`For ${group.recipientName}`}>
            <h2 className="text-2xl">
              For{' '}
              {group.recipientActive ? (
                <Link href={`/people/${group.recipientId}`} className="text-pine underline underline-offset-4">
                  {group.recipientName}
                </Link>
              ) : (
                group.recipientName
              )}
            </h2>
            <ul className="space-y-3">
              {group.items.map((item) => (
                <li
                  key={item.giftId}
                  className={`card space-y-3 ${item.removed ? 'border-2 border-dashed border-cranberry/60 bg-cranberry-light/40' : ''}`}
                  data-testid="shopping-item"
                >
                  <GiftTitle title={item.title} url={item.url} />
                  {item.notes && <p className="text-lg whitespace-pre-line text-muted">{item.notes}</p>}
                  {item.removed ? (
                    <p className="text-lg font-semibold text-cranberry-dark">
                      ⚠️ Removed from list by {item.removedByName}. You may not need to buy this any more.
                    </p>
                  ) : (
                    item.editedAfterClaim && (
                      <p className="text-lg font-semibold text-pine">✏️ Edited after you claimed it: check the details.</p>
                    )
                  )}
                  <ClaimControl giftId={item.giftId} status="mine" removed={item.removed} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
