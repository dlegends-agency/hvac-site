import { createContext, useContext } from "react";
import type { Listing, ListingBilling, ListingClaim } from "@/lib/types";

export interface ContractorState {
  email: string;
  /** The listing this account manages, once an admin has approved the claim. */
  listing: Listing | null;
  /** Most recent claim request (pending, approved or rejected). */
  claim: ListingClaim | null;
  billing: ListingBilling | null;
  reload: () => Promise<void>;
}

export const ContractorContext = createContext<ContractorState | null>(null);

export function useContractor(): ContractorState {
  const ctx = useContext(ContractorContext);
  if (!ctx) throw new Error("useContractor must be used inside ContractorLayout");
  return ctx;
}
