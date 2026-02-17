// middleware/permissions.js

/**
 * ตรวจสอบสิทธิ์ตาม role
 */
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
  };
}

/**
 * ตรวจสอบสิทธิ์ตาม permission
 */
function requirePermission(permissions) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ message: "Forbidden: no permissions" });
    }

    const hasPermission = permissions.every(p =>
      req.user.permissions.includes(p)
    );

    if (!hasPermission) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }

    next();
  };
}

module.exports = {
  requireRole,
  requirePermission,
};
