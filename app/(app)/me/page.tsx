import type { Metadata } from 'next';
import { DeleteGiftButton } from '@/components/DeleteGiftButton';
import { EditGift } from '@/components/EditGift';
import { GiftForm } from '@/components/GiftForm';
import { GiftTitle } from '@/components/GiftTitle';
import { getMyList, requireFamily } from '@/lib/data';

export const metadata: Metadata = { title: 'My wish list' };

/**
 * My list (SPEC §4.3): only gifts I added for myself.
 *
 * PRIVACY: this page must never show or receive claim information. Its data
 * comes from getMyList(), which reads only the gifts table (no claims), and
 * RLS hides claims and secret ideas from the recipient regardless.
 * Everything rendered here is the same whether or not a gift is claimed.
 */
export default async function MyListPage() {
  const { viewer, family } = await requireFamily();
  const gifts = await getMyList();

  return (
    <>
      <h1 className="text-3xl">My wish list</h1>
      <p className="text-lg text-muted">
        Your family can see this list. You won’t see who is getting what. That stays a surprise!
      </p>

      {gifts.length === 0 ? (
        <p className="card text-lg">Your list is empty. Add something you’d like!</p>
      ) : (
        <ul className="space-y-3" data-testid="my-list">
          {gifts.map((g) => (
            <li key={g.id} className="card space-y-3" data-testid="my-gift">
              <GiftTitle title={g.title} url={g.url} />
              {g.notes && <p className="text-lg whitespace-pre-line text-muted">{g.notes}</p>}
              <div className="flex flex-wrap items-start gap-3">
                <EditGift giftId={g.id} initial={{ title: g.title, url: g.url, notes: g.notes }} />
                <DeleteGiftButton giftId={g.id} title={g.title} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="card space-y-4" aria-labelledby="add-title">
        <h2 id="add-title" className="text-2xl">
          Add a wish
        </h2>
        <GiftForm mode="add" familyId={family.id} recipientId={viewer.id} />
      </section>
    </>
  );
}
