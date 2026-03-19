// middleware/permissions.ts

/**
 * ตรวจสอบสิทธิ์ตาม role
 */
function requireRole(roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

/**
 * ตรวจสอบสิทธิ์ตาม permission
 */
function requirePermission(permissions: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ message: 'Forbidden: no permissions' });
    }

    const hasPermission = permissions.every((p) => req.user.permissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
    }

    next();
  };
}

export = {
  requireRole,
  requirePermission
};
