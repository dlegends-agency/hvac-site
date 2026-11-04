// Live Google data (star rating, review count, opening hours) for a paid listing. Our server asks Google each time; the only
// thing kept here is the answer for the page that is open, so a page that shows both stars and hours asks once.
export interface LiveRating {
  rating: number;
  count: number;
  url: string | null;
}

export interface LiveHours {
  lines: string[];
  openNow: boolean | null;
}

export interface GoogleLive {
  rating: LiveRating | null;
  hours: LiveHours | null;
}

const inFlight = new Map<string, Promise<GoogleLive>>();

export function fetchGoogleLive(slug: string): Promise<GoogleLive> {
  let p = inFlight.get(slug);
  if (!p) {
    p = fetch(`/api/google/rating?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<GoogleLive> | null) => ({ rating: j?.rating ?? null, hours: j?.hours ?? null }))
      .catch(() => ({ rating: null, hours: null }));
    inFlight.set(slug, p);
    // Forget it shortly after so a later visit to the page asks Google again instead of showing an old answer.
    void p.then(() => setTimeout(() => inFlight.delete(slug), 30_000));
  }
  return p;
}
