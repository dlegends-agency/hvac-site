import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { parseAuthLinkError, rememberAuthLinkError } from "@/lib/auth-link";

/**
 * A bad email link brings people back to the site with the problem in the address ("#error=..."). Instead of leaving them on a page that
 * looks normal, remember the problem and send them to the sign-in page, which explains it and offers a new link.
 */
export function AuthLinkErrorHandler() {
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const problem = parseAuthLinkError(hash);
    if (!problem) return;
    rememberAuthLinkError(problem);
    navigate(pathname.startsWith("/contractor") ? "/contractor/login" : "/account/login", { replace: true });
  }, [hash, pathname, navigate]);

  return null;
}
