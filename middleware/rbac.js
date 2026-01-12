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
        if (req.user.role === 'super_admin') {
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

const verifyTenantAccess = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check account status
    if (req.user.account_status !== 'active') {
        return res.status(403).json({ error: 'Account is not active' });
    }

    const { tenant } = req.params;

    // Super admin and Master Admin can access any tenant
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
        return next();
    }

    // Tenant users must match the requested tenant
    if (req.user.tenant_code === tenant) {
        return next();
    }

    // Deny access if no match
    return res.status(403).json({ error: 'Access denied for this tenant' });
};

module.exports = { checkRole, checkAuth, verifyTenantAccess };
