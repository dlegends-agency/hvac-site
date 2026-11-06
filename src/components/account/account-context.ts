import { useOutletContext } from "react-router-dom";

/** What the signed-in customer's pages get from AccountLayout. */
export interface AccountState {
  email: string;
  name: string;
  phone: string;
  /** Re-read the signed-in user after a change on the settings page. */
  refresh: () => Promise<void>;
}

export const useAccount = () => useOutletContext<AccountState>();
