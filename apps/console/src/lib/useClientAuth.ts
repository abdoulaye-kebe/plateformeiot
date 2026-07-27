"use client";

import { getSession, sessionUser } from "@/lib/auth";
import { canWrite, isPlatformAdmin, isViewerOnly } from "@/lib/api";

export function useClientAuth() {
  const session = getSession();
  const user = sessionUser(session);
  const roles = user?.roles ?? [];
  return {
    user,
    roles,
    write: canWrite(roles),
    viewerOnly: isViewerOnly(roles),
    isAdmin: isPlatformAdmin(roles),
    isTenantAdmin: roles.includes("tenant-admin") || isPlatformAdmin(roles),
  };
}
