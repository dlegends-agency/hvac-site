import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Current year, resolved on the client so the page can stay statically prerendered. */
export function CopyrightYear() {
  const year = useSyncExternalStore(subscribe, () => String(new Date().getFullYear()), () => "");
  return <>{year}</>;
}
