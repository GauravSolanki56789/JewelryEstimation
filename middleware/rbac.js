// Role-Based Access Control Middleware (Single-Tenant Version)

const checkRole = (roles) => {
    return (req, res, next) => {
        // If roles is a string, convert to array
        if (typeof roles === 'string') {
            roles = [roles];
        }

        if (!req.isAuthenticated()) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Super admin bypasses all checks
        if (req.user.role === 'super_admin' || req.user.role === 'admin') {
            return next();
        }

        if (req.user.account_status !== 'active') {
            return res.status(403).json({ error: 'Account is not active. Please wait for admin approval.' });
        }

        if (roles.includes(req.user.role)) {
            next();
        } else {
            res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
    };
};

const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        next();
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
};

// For backward compatibility - just calls checkAuth in single-tenant mode
const verifyTenantAccess = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.account_status !== 'active') {
        return res.status(403).json({ error: 'Account is not active' });
    }

    // In single-tenant mode, all authenticated users have access
    return next();
};

module.exports = { checkRole, checkAuth, verifyTenantAccess };
