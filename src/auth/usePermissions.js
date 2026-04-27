// src/auth/usePermissions.js
import { useOrg } from "./useOrg";
import { useAuth } from "./AuthProvider";

export function usePermissions() {
  const { user } = useAuth();
  const { role } = useOrg();

  const isOwner = role === "owner";
  const isAdmin = role === "admin" || role === "owner";
  const isMember = role === "member" || isAdmin;

  return {
    role,

    // role checks
    isOwner,
    isAdmin,
    isMember,

    // org actions
    canManageOrg: isOwner,
    canManageMembers: isOwner || isAdmin,

    // invoice actions
    canCreateInvoice: true,
    canEditAnyInvoice: isAdmin,
    canDeleteInvoice: isOwner,

    // user
    userId: user?.id,
  };
}