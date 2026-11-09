import { domainHint } from '@/lib/gifts';

/**
 * Gift title, linked when there is a valid http(s) URL (SPEC §7): opens in a
 * new tab with rel="noopener noreferrer", with the shop's domain as a hint.
 */
export function GiftTitle({ title, url }: { title: string; url: string | null }) {
  const domain = domainHint(url);
  if (!url || !domain) {
    return <span className="text-xl font-semibold break-words">{title}</span>;
  }
  return (
    <span className="break-words">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xl font-semibold text-pine underline underline-offset-4 hover:text-pine-dark"
      >
        {title}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>{' '}
      <span className="text-base whitespace-nowrap text-muted">({domain})</span>
    </span>
  );
}
