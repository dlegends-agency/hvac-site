import { AuthPage } from "@/components/contractor/ContractorLoginPage";

/** Sign in or create an account to follow your service requests. */
export default function CustomerLoginPage() {
  return <AuthPage audience="customer" />;
}
