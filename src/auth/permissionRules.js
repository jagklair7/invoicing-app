// src/auth/permissionRules.js

export const PermissionRules = {
  invoice: {
    edit: (role, isOwner, ownerId, userId) =>
      role === "admin" || isOwner || ownerId === userId,

    delete: (role) => role === "owner",

    view: () => true,
  },

  customer: {
    edit: (role) => role !== "viewer",
  },
};