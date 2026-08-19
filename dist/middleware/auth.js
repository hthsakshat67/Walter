import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-anti-gravity-saas';
export function generateToken(user) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        businessId: user.businessId,
    }, JWT_SECRET, { expiresIn: '7d' });
}
export function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }
    else if (req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid authentication token' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.tenantId = decoded.businessId;
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
    }
}
export function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: User authentication required' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges for this role' });
        }
        next();
    };
}
export function getTenantId(req) {
    if (!req.tenantId) {
        throw new Error('Tenant context missing. Tenant-scoped authorization failed.');
    }
    return req.tenantId;
}
