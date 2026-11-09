import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClaimControl } from '@/components/ClaimControl';
import { DeleteGiftButton } from '@/components/DeleteGiftButton';
import { EditGift } from '@/components/EditGift';
import { GiftForm } from '@/components/GiftForm';
import { GiftTitle } from '@/components/GiftTitle';
import { getPersonList, type PersonGift } from '@/lib/data';
import { isUuid } from '@/lib/routes';

export const metadata: Metadata = { title: 'Wish list' };

/**
 * Someone else's list (SPEC §4.4): their own wishes plus everyone's secret
 * ideas, with claim status. Opening your own id redirects to /me.
 */
export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const { ctx, person, gifts } = await getPersonList(userId);
  const me = ctx.viewer.id;

  const wishes = gifts.filter((g) => !g.isSecret);
  const ideas = gifts.filter((g) => g.isSecret);

  return (
    <>
      <h1 className="text-3xl break-words">{person.displayName}’s list</h1>

      <section aria-labelledby="wishes-title" className="space-y-3">
        <h2 id="wishes-title" className="text-2xl">
          What {person.displayName} asked for
        </h2>
        {wishes.length === 0 ? (
          <p className="card text-lg">{person.displayName} hasn’t added anything yet.</p>
        ) : (
          <ul className="space-y-3">
            {wishes.map((g) => (
              <GiftCard key={g.id} gift={g} me={me} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ideas-title" className="space-y-3">
        <h2 id="ideas-title" className="text-2xl">
          Secret ideas
        </h2>
        <p className="text-lg text-muted">
          {person.displayName} can’t see these. Add your own idea below.
        </p>
        {ideas.length > 0 && (
          <ul className="space-y-3">
            {ideas.map((g) => (
              <GiftCard key={g.id} gift={g} me={me} />
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4" aria-labelledby="add-idea-title">
        <h2 id="add-idea-title" className="text-2xl">
          Add a secret idea for {person.displayName}
        </h2>
        <GiftForm
          mode="add"
          recipientId={person.id}
          submitLabel="Add secret idea"
          titlePlaceholder="e.g. Something they mentioned"
        />
      </section>
    </>
  );
}

function GiftCard({ gift: g, me }: { gift: PersonGift; me: string }) {
  const status = !g.claim ? 'unclaimed' : g.claim.claimerId === me ? 'mine' : 'other';

  return (
    <li
      className={`card space-y-3 ${g.removed ? 'border-2 border-dashed border-cranberry/60 bg-cranberry-light/40' : ''}`}
      data-testid="person-gift"
    >
      <div className="space-y-1">
        <GiftTitle title={g.title} url={g.url} />
        {g.isSecret && (
          <p className="text-base font-semibold text-pine">
            Secret idea, added by {g.createdBy === me ? 'you' : g.createdByName}
          </p>
        )}
      </div>
      {g.notes && <p className="text-lg whitespace-pre-line text-muted">{g.notes}</p>}

      {g.removed && (
        <p className="text-lg font-semibold text-cranberry-dark">Removed from list by {g.removedByName}.</p>
      )}

      <p className="text-lg" data-testid="claim-status">
        {status === 'unclaimed' && <span className="text-muted">Unclaimed</span>}
        {status === 'mine' && <strong className="text-cranberry">You’re getting this</strong>}
        {status === 'other' && (
          <strong className="text-cranberry">Claimed by {g.claim!.claimerName}</strong>
        )}
        {status === 'mine' && g.claim!.editedAfterClaim && !g.removed && (
          <span className="block text-base text-muted">Edited after you claimed it.</span>
        )}
      </p>

      <div className="flex flex-wrap items-start gap-3">
        <ClaimControl giftId={g.id} status={status} removed={g.removed} />
        {g.isSecret && g.createdBy === me && !g.removed && (
          <>
            <EditGift giftId={g.id} initial={{ title: g.title, url: g.url, notes: g.notes }} />
            <DeleteGiftButton giftId={g.id} title={g.title} />
          </>
        )}
      </div>
    </li>
  );
}
