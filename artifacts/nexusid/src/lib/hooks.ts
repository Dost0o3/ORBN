import { useClerk } from "@clerk/react";
import { useCallback } from "react";

export function useSignOut() {
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return useCallback(() => {
    signOut({ redirectUrl: basePath || "/" });
  }, [signOut, basePath]);
}
