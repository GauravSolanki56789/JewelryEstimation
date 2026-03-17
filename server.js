require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('./config/passport');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const { 
    pool, 
    initDatabase, 
    query,
    getPool
} = require('./config/database');
const { checkRole, checkAuth, checkAdmin, noCache, securityHeaders, getUserPermissions } = require('./middleware/auth');
const { hasPermission, getPermissionContext } = require('./middleware/checkPermission');
const TallyIntegration = require('./config/tally-integration');
const TallySyncService = require('./config/tally-sync-service');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');

const app = express();

// Trust exactly one proxy hop (Nginx → Node). This makes Express read
// X-Forwarded-Proto so secure cookies work behind SSL-terminating Nginx.
// If your stack is: CDN → Nginx → Node, change this to 2.
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Session and Passport Middleware
// Sessions are persisted in PostgreSQL so they survive PM2 restarts/crashes.
// Without a persistent store, every restart wipes all sessions and causes a
// redirect loop (valid cookie → session not found → isAuthenticated() false → redirect).
const isProduction = process.env.NODE_ENV === 'production';

app.use(session({
    store: new pgSession({
        pool,                           // Reuse the existing pg pool
        tableName: 'session',           // Table created automatically on first run
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60   // Purge expired rows every hour (seconds)
    }),
    secret: process.env.SESSION_SECRET || 'jewelry_estimation_secret_change_me',
    resave: false,
    // false = only write the session when something actually changed;
    // true would create an empty session for every unauthenticated visitor,
    // filling the store and evicting live sessions → redirect loop.
    saveUninitialized: false,
    name: 'jp.sid',
    cookie: {
        // secure:true → browser only sends cookie over HTTPS.
        // Relies on trust proxy + Nginx forwarding X-Forwarded-Proto: https.
        secure: isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000    // 24 hours
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// SECURITY: Apply security headers to all requests
app.use(securityHeaders);

// SECURITY: Middleware to sanitize password fields from logging
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
        if (sanitizedBody.masterPassword) sanitizedBody.masterPassword = '[REDACTED]';
        if (sanitizedBody.adminPassword) sanitizedBody.adminPassword = '[REDACTED]';
        req.sanitizedBody = sanitizedBody;
    }
    next();
});

// Store admin sessions
const adminSessions = new Map();

// Admin panel protection
app.use('/admin.html', async (req, res, next) => {
    const sessionToken = req.query.session || req.headers['x-admin-session'];
    const authQuery = req.query.auth;
    
    if (sessionToken && adminSessions.has(sessionToken)) {
        const session = adminSessions.get(sessionToken);
        if (session.expires > Date.now()) {
            return next();
        } else {
            adminSessions.delete(sessionToken);
        }
    }
    
    if (authQuery) {
        try {
            const credentials = Buffer.from(authQuery, 'base64').toString('utf-8');
            const [username, password] = credentials.split(':');
            
            const admin = await pool.query(
                'SELECT * FROM admin_users WHERE username = $1',
                [username]
            );
            
            if (admin.rows.length > 0) {
                const isValid = await bcrypt.compare(password, admin.rows[0].password_hash);
                if (isValid && admin.rows[0].is_super_admin) {
                    const sessionId = require('crypto').randomBytes(32).toString('hex');
                    adminSessions.set(sessionId, {
                        username,
                        expires: Date.now() + (24 * 60 * 60 * 1000)
                    });
                    return res.redirect(`/admin.html?session=${sessionId}`);
                }
            }
        } catch (error) {
            console.error('Admin auth error:', error);
        }
    }
    
    return res.redirect('/admin-login.html');
});

// Clean expired sessions (every hour)
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of adminSessions.entries()) {
        if (session.expires < now) {
            adminSessions.delete(token);
        }
    }
}, 60 * 60 * 1000);

// ==========================================
// GOOGLE OAUTH ROUTES (WHITELIST-BASED)
// ==========================================

app.get('/auth/google', async (req, res, next) => {
    // 🛠️ LOCAL DEV BYPASS
    if (process.env.NODE_ENV === 'development') {
        console.log("🛠️ Local Dev Detected: Attempting Bypass...");
        
        try {
            const email = 'jaigaurav56789@gmail.com'; // Your admin email
            
            // 1. Try to find the user in your LOCAL database
            let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            let user = result.rows[0];

            // 2. If user doesn't exist locally, create a temporary one so you don't crash
            if (!user) {
                console.log("⚠️ Admin not found locally. Creating one...");
                // Note: We let PostgreSQL generate the UUID automatically to avoid syntax errors
                const newUser = await pool.query(`
                    INSERT INTO users (email, name, role, account_status, allowed_tabs, permissions)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [
                    email, 
                    'Local Admin', 
                    'super_admin', 
                    'active', 
                    ['all'], 
                    JSON.stringify({ all: true, modules: ["*"] })
                ]);
                user = newUser.rows[0];
            }

            // 3. Log in with the REAL database user object (has correct UUID)
            req.login(user, (err) => {
                if (err) { 
                    console.error("Login Error:", err);
                    return next(err); 
                }
                return res.redirect('/'); // Success! Go to dashboard
            });

        } catch (error) {
            console.error("Bypass Error:", error);
            res.status(500).send("Local login failed: " + error.message);
        }
    } else {
        // 🔒 PRODUCTION: Strict Google Auth
        passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
    }
});


// Google OAuth Callback - Handle whitelist denial
app.get('/auth/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/unauth.html?reason=ACCESS_DENIED',
        failureMessage: true
    }),
    (req, res) => {
        // User passed whitelist check
        if (!req.user) {
            return res.redirect('/unauth.html?reason=ACCESS_DENIED');
        }
        
        if (req.user.account_status === 'pending') {
            res.redirect('/complete-profile.html');
        } else if (req.user.account_status === 'active') {
            res.redirect('/');
        } else if (req.user.account_status === 'rejected' || req.user.account_status === 'suspended') {
            // Destroy session for suspended users
            req.logout((err) => {
                if (err) { console.error('Logout error:', err); }
                req.session.destroy((err) => {
                    if (err) { console.error('Session destroy error:', err); }
                    res.clearCookie('jp.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: isProduction });
                    res.redirect('/unauth.html?reason=suspended&email=' + encodeURIComponent(req.user?.email || ''));
                });
            });
        } else {
            res.redirect('/');
        }
    }
);  

// Current user endpoint - include full permissions context
app.get('/api/auth/current_user', (req, res) => {
    if (req.isAuthenticated()) {
        // Get both legacy and new permission formats
        const legacyPermissions = getUserPermissions(req.user);
        const permissionContext = getPermissionContext(req.user);
        
        res.json({ 
            isAuthenticated: true, 
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
                account_status: req.user.account_status,
                allowed_tabs: req.user.allowed_tabs || [],
                permissions: req.user.permissions || {}
            },
            // Legacy format for backward compatibility
            permissions: legacyPermissions,
            // New granular permission context
            permissionContext: permissionContext
        });
    } else {
        res.json({ 
            isAuthenticated: false,
            permissions: getUserPermissions(null),
            permissionContext: getPermissionContext(null)
        });
    }
});

// Complete Profile (Update user details after first login)
app.post('/api/users/complete-profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { phone, dob, companyName } = req.body;

    try {
        await pool.query(
            'UPDATE users SET phone_number = $1, dob = $2, company_name = $3, account_status = $4 WHERE id = $5',
            [phone, dob, companyName, 'pending', req.user.id]
        );
        
        req.user.phone_number = phone;
        req.user.dob = dob;
        req.user.company_name = companyName;
        req.user.account_status = 'pending';

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SECURE LOGOUT (Fixes back button bug)
// ==========================================

app.get('/api/auth/logout', (req, res) => {
    // Cookie attributes must exactly match those used when the cookie was set
    // otherwise some browsers silently refuse to delete it.
    const sessionCookieOpts = {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    };

    req.logout((err) => {
        if (err) { console.error('Logout error:', err); }

        req.session.destroy((sessionErr) => {
            if (sessionErr) { console.error('Session destroy error:', sessionErr); }

            res.clearCookie('jp.sid', sessionCookieOpts);
            res.clearCookie('connect.sid', { path: '/' }); // Legacy fallback

            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            res.redirect('/');
        });
    });
});

app.post('/api/auth/logout', (req, res) => {
    const sessionCookieOpts = {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    };

    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) { console.error('Session destroy error:', sessionErr); }

            res.clearCookie('jp.sid', sessionCookieOpts);
            res.clearCookie('connect.sid', { path: '/' });

            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            res.json({ success: true, message: 'Logged out successfully' });
        });
    });
});

// Static files
app.use(express.static('public'));

// ==========================================
// MULTER IMAGE UPLOAD CONFIG
// ==========================================
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E6);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `img_${uniqueSuffix}${ext}`);
    }
});

const imageFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif, webp) are allowed'), false);
    }
};

const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/upload - Single image upload
app.post('/api/upload', checkAuth, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({ success: true, imageUrl, filename: req.file.filename });
});

// POST /api/upload/multiple - Multiple image upload
app.post('/api/upload/multiple', checkAuth, upload.array('images', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image files provided' });
    }
    const images = req.files.map(f => ({
        imageUrl: `/uploads/products/${f.filename}`,
        filename: f.filename
    }));
    res.json({ success: true, images });
});

// POST /api/upload/product-image - Single product edit flow: save image as <barcode>.jpg (overwrites existing)
const productImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const barcode = (req.query.barcode || '').trim();
        if (!barcode || !/^[a-zA-Z0-9_-]+$/.test(barcode)) {
            return cb(new Error('Valid barcode required for product image upload'), null);
        }
        cb(null, `${barcode}.jpg`);
    }
});
const productImageUpload = multer({ storage: productImageStorage, fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/upload/product-image', checkAuth, hasPermission('products'), productImageUpload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = `/uploads/products/${req.file.filename}`;
    res.json({ success: true, imageUrl, filename: req.file.filename });
});

// Bulk barcode images: filename (without ext) = barcode; update products SET image_url WHERE barcode = ?
const bulkBarcodeStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const barcode = path.basename(file.originalname, path.extname(file.originalname)); // e.g. 32074195.jpg -> 32074195
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `${barcode}${ext}`);
    }
});
const bulkBarcodeUpload = multer({ storage: bulkBarcodeStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/upload/bulk-barcode-images', checkAuth, hasPermission('products'), bulkBarcodeUpload.array('images', 200), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No image files provided' });
        }
        let matched = 0;
        for (const f of req.files) {
            const barcode = path.basename(f.originalname, path.extname(f.originalname));
            if (!barcode) continue;
            const imageUrl = `/uploads/products/${f.filename}`;
            const result = await query('UPDATE products SET image_url = $1 WHERE barcode = $2 RETURNING id', [imageUrl, barcode]);
            if (result.length > 0) matched++;
        }
        res.json({ success: true, matched, total: req.files.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// IMAGE CASCADE HELPER
// Resolves the best image for a product by walking up the hierarchy:
//   Product → Item → SKU
// ==========================================
async function resolveProductImage(barcode) {
    const productRows = await query(
        `SELECT p.image_url, p.item_code, p.style_code, p.sku,
                (SELECT pi.image_url FROM product_images pi WHERE pi.product_barcode = p.barcode AND pi.is_primary = true LIMIT 1) as primary_image
         FROM products p WHERE p.barcode = $1`, [barcode]
    );
    if (productRows.length === 0) return null;
    const prod = productRows[0];

    if (prod.primary_image) return prod.primary_image;
    if (prod.image_url) return prod.image_url;

    if (prod.item_code && prod.style_code && prod.sku) {
        const itemRows = await query(
            'SELECT image_url FROM items WHERE style_code = $1 AND sku_code = $2 AND item_code = $3 AND image_url IS NOT NULL LIMIT 1',
            [prod.style_code, prod.sku, prod.item_code]
        );
        if (itemRows.length > 0 && itemRows[0].image_url) return itemRows[0].image_url;
    }

    if (prod.style_code && prod.sku) {
        const skuRows = await query(
            'SELECT image_url FROM styles WHERE style_code = $1 AND sku_code = $2 AND image_url IS NOT NULL LIMIT 1',
            [prod.style_code, prod.sku]
        );
        if (skuRows.length > 0 && skuRows[0].image_url) return skuRows[0].image_url;
    }

    return null;
}

// ==========================================
// SCHEMA CHECK FUNCTION - Ensures products table has required columns
// ==========================================
async function checkAndUpdateProductsSchema() {
    try {
        console.log('🔍 Checking products table schema...');
        
        const dbPool = getPool();
        
        // Check and add 'status' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'status'
                ) THEN
                    ALTER TABLE products ADD COLUMN status VARCHAR(50) DEFAULT 'available';
                    UPDATE products SET status = 'available' WHERE status IS NULL;
                    UPDATE products SET status = 'sold' WHERE is_sold = true;
                    RAISE NOTICE 'Added status column';
                END IF;
            END $$;
        `);
        
        // Check and add 'sold_bill_no' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'sold_bill_no'
                ) THEN
                    ALTER TABLE products ADD COLUMN sold_bill_no VARCHAR(50);
                    RAISE NOTICE 'Added sold_bill_no column';
                END IF;
            END $$;
        `);
        
        // Check and add 'sold_customer_name' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'sold_customer_name'
                ) THEN
                    ALTER TABLE products ADD COLUMN sold_customer_name VARCHAR(255);
                    RAISE NOTICE 'Added sold_customer_name column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE products SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column to quotations table
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'quotations' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE quotations ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE quotations SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column to quotations';
                END IF;
            END $$;
        `);
        
        // Check and add 'item_code' column to products table (required for B2B feature)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'item_code'
                ) THEN
                    ALTER TABLE products ADD COLUMN item_code VARCHAR(100);
                    RAISE NOTICE 'Added item_code column to products';
                END IF;
            END $$;
        `);
        
        console.log('✅ Products table schema verified and updated');
        return true;
    } catch (error) {
        console.error('❌ Schema check failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Check and create styles table if it doesn't exist
async function checkAndCreateStylesTable() {
    try {
        console.log('🔍 Checking styles table...');
        
        const dbPool = getPool();
        
        // Create styles table if it doesn't exist
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS styles (
                id SERIAL PRIMARY KEY,
                style_code VARCHAR(100) NOT NULL,
                sku_code VARCHAR(100) NOT NULL,
                item_name VARCHAR(255),
                category VARCHAR(100),
                metal_type VARCHAR(50),
                purity VARCHAR(50),
                mc_type VARCHAR(50),
                mc_value NUMERIC(10,2),
                hsn_code VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(style_code, sku_code)
            )
        `);
        
        // Create indexes if they don't exist
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_styles_style_code ON styles(style_code)
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_styles_sku_code ON styles(sku_code)
        `);
        
        // Add missing columns if they don't exist (for existing tables)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'purity'
                ) THEN
                    ALTER TABLE styles ADD COLUMN purity VARCHAR(50);
                    RAISE NOTICE 'Added purity column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'metal_type'
                ) THEN
                    ALTER TABLE styles ADD COLUMN metal_type VARCHAR(50);
                    RAISE NOTICE 'Added metal_type column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'item_name'
                ) THEN
                    ALTER TABLE styles ADD COLUMN item_name VARCHAR(255);
                    RAISE NOTICE 'Added item_name column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'mc_type'
                ) THEN
                    ALTER TABLE styles ADD COLUMN mc_type VARCHAR(50);
                    RAISE NOTICE 'Added mc_type column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'mc_value'
                ) THEN
                    ALTER TABLE styles ADD COLUMN mc_value NUMERIC(10,2);
                    RAISE NOTICE 'Added mc_value column';
                END IF;
            END $$;
        `);
        
        console.log('✅ Styles table verified and ready');
        return true;
    } catch (error) {
        console.error('❌ Styles table check failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Check and migrate users table schema (add missing columns)
async function checkAndMigrateUsersTable() {
    try {
        console.log('🔍 Checking users table schema...');
        
        const dbPool = getPool();
        
        // Check and add 'permissions' column (JSONB)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'permissions'
                ) THEN
                    ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';
                    RAISE NOTICE 'Added permissions column';
                END IF;
            END $$;
        `);
        
        // Check and add 'allowed_tabs' column (TEXT[])
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'allowed_tabs'
                ) THEN
                    ALTER TABLE users ADD COLUMN allowed_tabs TEXT[];
                    RAISE NOTICE 'Added allowed_tabs column';
                END IF;
            END $$;
        `);
        
        // Check and add 'account_status' column (VARCHAR)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'account_status'
                ) THEN
                    ALTER TABLE users ADD COLUMN account_status VARCHAR(50) DEFAULT 'pending';
                    UPDATE users SET account_status = 'pending' WHERE account_status IS NULL;
                    RAISE NOTICE 'Added account_status column';
                END IF;
            END $$;
        `);
        
        // Check and add 'role' column (VARCHAR)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'role'
                ) THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'employee';
                    UPDATE users SET role = 'employee' WHERE role IS NULL;
                    RAISE NOTICE 'Added role column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column (BOOLEAN) for soft deletes
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE users SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column';
                END IF;
            END $$;
        `);
        
        // Create indexes for performance (if they don't exist)
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_permissions ON users USING gin(permissions);
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
        `);
        
        // Update existing users with default permissions if needed
        await dbPool.query(`
            UPDATE users 
            SET permissions = COALESCE(permissions, '{}'::jsonb)
            WHERE permissions IS NULL;
        `);
        
        // Set default permissions for super admin
        await dbPool.query(`
            UPDATE users 
            SET permissions = '{"all": true, "modules": ["*"]}'::jsonb,
                allowed_tabs = COALESCE(allowed_tabs, ARRAY['all']),
                role = COALESCE(role, 'admin')
            WHERE email = 'jaigaurav56789@gmail.com'
            AND (permissions IS NULL OR permissions = '{}'::jsonb);
        `);
        
        console.log('✅ Users table schema verified and migrated');
        return true;
    } catch (error) {
        console.error('❌ Users table migration failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Initialize database on startup
initDatabase().then(async success => {
    if (success) {
        console.log('✅ Database ready');
        // Run schema check after database initialization
        await checkAndUpdateProductsSchema();
        await checkAndCreateStylesTable();
        await checkAndMigrateUsersTable();
    } else {
        console.log('⚠️ Server started but database initialization failed.');
        console.log('💡 Please check your PostgreSQL connection and restart the server.');
    }
}).catch(err => {
    console.error('❌ Unexpected error during database initialization:', err);
});

// ==========================================
// LOGIN API (Email/Password - No Tenant Code)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check admin_users table first (super admin)
        const adminResult = await pool.query(
            'SELECT * FROM admin_users WHERE username = $1',
            [username]
        );
        
        if (adminResult.rows.length > 0) {
            const admin = adminResult.rows[0];
            const isValid = await bcrypt.compare(password, admin.password_hash);
            if (isValid) {
                return res.json({
                    success: true,
                    username: admin.username,
                    role: 'super_admin',
                    allowedTabs: ['all'],
                    isMasterAdmin: true
                });
            }
        }
        
        // Check regular users table
        const userResult = await pool.query(
            'SELECT * FROM users WHERE (username = $1 OR email = $1)',
            [username]
        );
        
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Check if password field exists and is hashed
            if (user.password) {
                let passwordValid = false;
                if (user.password.startsWith('$2')) {
                    passwordValid = await bcrypt.compare(password, user.password);
                } else {
                    // Legacy plain text - migrate to hashed
                    if (password === user.password) {
                        const hashedPassword = await bcrypt.hash(password, 10);
                        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
                        passwordValid = true;
                    }
                }
                
                if (passwordValid) {
                    let allowedTabs = user.allowed_tabs || ['all'];
                    if (typeof allowedTabs === 'string') {
                        try {
                            allowedTabs = JSON.parse(allowedTabs);
                        } catch (e) {
                            allowedTabs = allowedTabs.split(',').map(t => t.trim()).filter(t => t);
                        }
                    }
                    
                    return res.json({
                        success: true,
                        username: user.username || user.email,
                        role: user.role || 'employee',
                        allowedTabs: allowedTabs,
                        isMasterAdmin: false
                    });
                }
            }
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SOFTWARE UPDATE API
// ==========================================

app.post('/api/update-software', checkAuth, async (req, res) => {
    console.log("🔄 Update triggered by user...");
    
    // Only allow admin/super_admin to update
    if (req.user && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required', output: 'Access denied: Admin privileges required' });
    }
    
    // Execute the shell script with extended timeout (5 minutes) and capture all output
    exec('bash update.sh 2>&1', { 
        cwd: __dirname, 
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
    }, (error, stdout, stderr) => {
        const fullOutput = stdout + (stderr ? '\n--- STDERR ---\n' + stderr : '');
        
        if (error) {
            console.error(`❌ Update error: ${error.message}`);
            console.error(`Output: ${fullOutput}`);
            
            // Return error but include the output for debugging
            return res.status(500).json({ 
                success: false, 
                message: 'Update failed: ' + (error.message || 'Unknown error'),
                output: fullOutput,
                error: error.message
            });
        }
        
        console.log(`✅ Update Output:\n${fullOutput}`);
        
        // Return success with full output
        res.json({ 
            success: true, 
            message: 'Server updated & restarted successfully!',
            output: fullOutput
        });
    });
});

// Check for updates (version check)
app.get('/api/update/check', async (req, res) => {
    try {
        const packageJson = require('./package.json');
        const currentVersion = packageJson.version;
        
        const githubRepo = process.env.GITHUB_REPO;
        
        if (githubRepo) {
            try {
                const https = require('https');
                const githubUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
                
                const githubResponse = await new Promise((resolve, reject) => {
                    https.get(githubUrl, {
                        headers: { 'User-Agent': 'JP-Jewellery-Estimations' }
                    }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                resolve(JSON.parse(data));
                            } else {
                                reject(new Error(`GitHub API returned ${res.statusCode}`));
                            }
                        });
                    }).on('error', reject);
                });
                
                const latestVersion = githubResponse.tag_name.replace(/^v/i, '');
                const updateAvailable = latestVersion !== currentVersion;
                
                return res.json({
                    available: updateAvailable,
                    version: latestVersion,
                    currentVersion: currentVersion,
                    releaseNotes: githubResponse.body || 'Latest update with improvements',
                    mandatory: false
                });
            } catch (githubError) {
                console.error('GitHub check failed:', githubError);
            }
        }
        
        res.json({
            available: false,
            version: currentVersion,
            currentVersion: currentVersion,
            releaseNotes: 'No updates available',
            mandatory: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PRODUCTS API (Single Tenant - No :tenant prefix)
// Protected by: hasPermission('products')
// ==========================================

app.get('/api/products', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { barcode, styleCode, search, includeDeleted, limit, offset, recent } = req.query;
        
        let queryText = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        // Filter out deleted items by default (unless includeDeleted=true)
        if (includeDeleted !== 'true') {
            queryText += ` AND (is_deleted IS NULL OR is_deleted = false)`;
            queryText += ` AND (status IS NULL OR status != 'deleted')`;
        }
        
        if (barcode) {
            queryText += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            queryText += ` AND style_code = $${paramCount++}`;
            params.push(styleCode);
        }
        if (search) {
            queryText += ` AND (short_name ILIKE $${paramCount} OR item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR sku ILIKE $${paramCount} OR style_code ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        // Order by created_at DESC (most recent first)
        queryText += ' ORDER BY created_at DESC';
        
        // Apply limit (default 20 for no search/limit, 50 for search, 5 for recent)
        // CRITICAL: Default to 20 to prevent browser crash with large datasets
        const limitValue = recent === 'true' ? 5 : (limit ? Math.min(parseInt(limit), 50) : (search ? 50 : 20));
        if (limitValue) {
            queryText += ` LIMIT $${paramCount++}`;
            params.push(limitValue);
        }
        
        // Apply offset for pagination
        if (offset) {
            queryText += ` OFFSET $${paramCount++}`;
            params.push(parseInt(offset));
        }
        
        const result = await query(queryText, params);
        
        // Get total count for pagination (always when limit is applied)
        let totalCount = null;
        if (limitValue) {
            let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
            const countParams = [];
            let countParamCount = 1;
            
            if (includeDeleted !== 'true') {
                countQuery += ` AND (is_deleted IS NULL OR is_deleted = false)`;
                countQuery += ` AND (status IS NULL OR status != 'deleted')`;
            }
            
            if (barcode) {
                countQuery += ` AND barcode = $${countParamCount++}`;
                countParams.push(barcode);
            }
            if (styleCode) {
                countQuery += ` AND style_code = $${countParamCount++}`;
                countParams.push(styleCode);
            }
            if (search) {
                countQuery += ` AND (short_name ILIKE $${countParamCount} OR item_name ILIKE $${countParamCount} OR barcode ILIKE $${countParamCount} OR sku ILIKE $${countParamCount} OR style_code ILIKE $${countParamCount++})`;
                countParams.push(`%${search}%`);
            }
            
            const countResult = await query(countQuery, countParams);
            totalCount = parseInt(countResult[0].total);
        }
        
        // Return results with metadata
        res.json({
            products: result,
            total: totalCount,
            limit: limitValue,
            offset: offset ? parseInt(offset) : 0,
            hasMore: totalCount !== null && (limitValue + (offset ? parseInt(offset) : 0)) < totalCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', checkAuth, hasPermission('products'), async (req, res) => {
    const product = req.body;
    
    try {
        if (product.barcode) {
            const existingCheck = await query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
            if (existingCheck.length > 0) {
                return res.status(409).json({ error: `Barcode ${product.barcode} already exists` });
            }
        }
        
        const attrs = product.attributes && typeof product.attributes === 'object' ? JSON.stringify(product.attributes) : '{}';

        const queryText = `INSERT INTO products (
            barcode, sku, style_code, item_code, short_name, item_name, metal_type, size, weight,
            purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt, status,
            attributes, image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *`;
        
        const params = [
            product.barcode, product.sku, product.styleCode, product.itemCode || null,
            product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight,
            product.status || 'available', attrs, product.imageUrl || null
        ];
        
        const result = await query(queryText, params);
        broadcast('product-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: `Barcode ${product.barcode} already exists` });
        }
        res.status(500).json({ error: error.message });
    }
});

// Bulk Update MC Rate - MUST be before /api/products/:id to avoid "bulk-update" being parsed as id
const bulkUpdateMcHandler = async (req, res) => {
    try {
        const { styleCode, mcRate, boxCharges, stoneCharges } = req.body;
        
        if (!styleCode || !(styleCode || '').trim()) {
            return res.status(400).json({ error: 'Style Code is required' });
        }
        
        const styleCodeTrimmed = String(styleCode).trim();
        const hasMcRate = mcRate !== undefined && mcRate !== null && mcRate !== '';
        const hasBoxCharges = boxCharges !== undefined && boxCharges !== null && boxCharges !== '';
        const hasStoneCharges = stoneCharges !== undefined && stoneCharges !== null && stoneCharges !== '';
        
        if (!hasMcRate && !hasBoxCharges && !hasStoneCharges) {
            return res.status(400).json({ error: 'Please enter at least one value (MC Rate, Box Charges, or Stone Charges)' });
        }
        
        // When MC Rate is provided: validate against Style Master (styles table)
        let styleSkuMcMap = null; // Map: normSku -> { exactSku, mc_value }
        if (hasMcRate) {
            const mcRateNum = parseFloat(mcRate);
            if (isNaN(mcRateNum) || mcRateNum < 0) {
                return res.status(400).json({ error: 'MC Rate must be a valid positive number' });
            }
            
            const stylesResult = await query(
                `SELECT style_code, sku_code, mc_value FROM styles 
                 WHERE UPPER(TRIM(style_code)) = UPPER(TRIM($1)) AND UPPER(TRIM(sku_code)) != 'ROOT'`,
                [styleCodeTrimmed]
            );
            
            if (!stylesResult || stylesResult.length === 0) {
                return res.status(400).json({ error: `Style Code "${styleCodeTrimmed}" not found in Style Master. Please add it first.` });
            }
            
            // Build map: normalized sku -> { exactSku, mc_value }
            styleSkuMcMap = new Map();
            let mcRateFoundInMaster = false;
            for (const s of stylesResult) {
                const nk = (s.sku_code || '').trim().toUpperCase();
                const mcVal = parseFloat(s.mc_value) || 0;
                styleSkuMcMap.set(nk, { exactSku: s.sku_code, mc_value: mcVal });
                if (Math.abs(mcVal - mcRateNum) < 0.01) {
                    mcRateFoundInMaster = true;
                }
            }
            
            if (!mcRateFoundInMaster) {
                const masterRates = [...new Set(stylesResult.map(s => parseFloat(s.mc_value) || 0))].join(', ');
                return res.status(400).json({ 
                    error: `MC Rate ₹${mcRateNum} is not in Style Master for "${styleCodeTrimmed}". Style Master has: ₹${masterRates}. Please update Style Master first.` 
                });
            }
        }
        
        // Fetch products matching style_code (case-insensitive)
        const productsResult = await query(
            `SELECT id, barcode, style_code, sku, mc_rate, box_charges, stone_charges 
             FROM products 
             WHERE UPPER(TRIM(style_code)) = UPPER(TRIM($1)) 
               AND (is_deleted IS NULL OR is_deleted = false) 
               AND (status IS NULL OR status != 'deleted')`,
            [styleCodeTrimmed]
        );
        
        if (!productsResult || productsResult.length === 0) {
            return res.status(404).json({ error: `No products found with Style Code: ${styleCodeTrimmed}` });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        let updatedCount = 0;
        
        try {
            for (const p of productsResult) {
                let newMcRate = p.mc_rate;
                let newBoxCharges = p.box_charges;
                let newStoneCharges = p.stone_charges;
                
                if (hasMcRate && styleSkuMcMap) {
                    const rawSku = (p.sku || '').trim().toUpperCase();
                    const skuEntry = styleSkuMcMap.get(rawSku);
                    if (skuEntry) {
                        newMcRate = skuEntry.mc_value;
                    }
                }
                if (hasBoxCharges) newBoxCharges = parseFloat(boxCharges) || 0;
                if (hasStoneCharges) newStoneCharges = parseFloat(stoneCharges) || 0;
                
                await client.query(
                    `UPDATE products SET mc_rate = $1, box_charges = $2, stone_charges = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
                    [newMcRate, newBoxCharges, newStoneCharges, p.id]
                );
                updatedCount++;
                broadcast('product-updated', { id: p.id, barcode: p.barcode, mc_rate: newMcRate, box_charges: newBoxCharges, stone_charges: newStoneCharges });
            }
            
            res.json({ success: true, updated: updatedCount, styleCode: styleCodeTrimmed });
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

app.post('/api/products/bulk-update', checkAuth, hasPermission('products'), bulkUpdateMcHandler);

app.put('/api/products/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        const product = req.body;
        
        const attrs = product.attributes && typeof product.attributes === 'object' ? JSON.stringify(product.attributes) : undefined;

        const queryText = `UPDATE products SET
            barcode = $1, sku = COALESCE($2, sku), style_code = COALESCE($3, style_code), item_code = COALESCE($4, item_code),
            short_name = $5, item_name = $6,
            metal_type = $7, size = $8, weight = $9, purity = $10, rate = $11,
            mc_rate = $12, mc_type = $13, pcs = $14, box_charges = $15, stone_charges = $16,
            floor = $17, avg_wt = $18, status = COALESCE($19, status),
            attributes = COALESCE($20::jsonb, attributes), image_url = COALESCE($21, image_url),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $22 RETURNING *`;
        
        // Preserve style_code and sku if they are undefined/null/empty (pass null so COALESCE preserves existing value)
        const params = [
            product.barcode, 
            (product.sku && product.sku.trim()) || null, 
            (product.styleCode && product.styleCode.trim()) || null, 
            product.itemCode || null,
            product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight,
            product.status || 'available', attrs || null, product.imageUrl || null, id
        ];
        
        const result = await query(queryText, params);
        broadcast('product-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products/bulk', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { products: productsArray } = req.body;
        
        if (!Array.isArray(productsArray) || productsArray.length === 0) {
            return res.status(400).json({ error: 'Products array is required' });
        }
        
        // Fetch valid style_code + sku_code + purity + mc_type + mc_value (exclude ROOT) - Style Master is source of truth
        const stylesResult = await query(
            'SELECT style_code, sku_code, purity, mc_type, mc_value FROM styles WHERE UPPER(sku_code) != \'ROOT\''
        );
        const styleSkuMap = new Map(); // normStyle -> { exactStyle, skus: Map(normSku -> { exactSku, purity, mc_type, mc_value }) }
        stylesResult.forEach(s => {
            const ns = (s.style_code || '').trim().toUpperCase();
            const nk = (s.sku_code || '').trim().toUpperCase();
            if (!styleSkuMap.has(ns)) {
                styleSkuMap.set(ns, { exactStyle: s.style_code, skus: new Map() });
            }
            styleSkuMap.get(ns).skus.set(nk, {
                exactSku: s.sku_code,
                purity: s.purity,
                mc_type: s.mc_type,
                mc_value: s.mc_value
            });
        });
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            
            const insertedProducts = [];
            const errors = [];
            
            const insertQuery = `INSERT INTO products (
                barcode, sku, style_code, item_code, short_name, item_name, metal_type, size, weight,
                purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt, status,
                attributes, image_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *`;
            
            for (const product of productsArray) {
                try {
                    const existingCheck = await client.query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
                    
                    if (existingCheck.rows.length > 0) {
                        errors.push({ barcode: product.barcode, error: 'Barcode already exists' });
                        continue;
                    }
                    
                    // Strict hierarchy validation: styleCode and sku must exist in DB
                    const rawStyle = (product.styleCode || product.style_code || '').trim().toUpperCase();
                    const rawSku = (product.sku || '').trim().toUpperCase();
                    const styleEntry = styleSkuMap.get(rawStyle);
                    if (!rawStyle || !styleEntry) {
                        errors.push({ barcode: product.barcode, error: 'STYLE_NOT_FOUND: ' + (product.styleCode || product.style_code || '') });
                        continue;
                    }
                    const skuEntry = styleEntry.skus.get(rawSku);
                    if (!rawSku || !skuEntry) {
                        errors.push({ barcode: product.barcode, error: 'SKU_NOT_FOUND: ' + (product.sku || '') + ' under style ' + styleEntry.exactStyle });
                        continue;
                    }
                    // Auto-correct: use exact DB values; OVERRIDE purity/mc from Style Master (ignore Excel columns)
                    product.styleCode = styleEntry.exactStyle;
                    product.sku = skuEntry.exactSku;
                    product.purity = parseFloat(skuEntry.purity) || 91.6;
                    product.mcType = skuEntry.mc_type || 'PER_GRAM';
                    product.mcRate = parseFloat(skuEntry.mc_value) || 0;

                    const attrs = product.attributes && typeof product.attributes === 'object' ? JSON.stringify(product.attributes) : '{}';
                    
                    const params = [
                        product.barcode, product.sku || '', product.styleCode || '',
                        product.itemCode || null,
                        product.shortName, product.itemName || product.shortName,
                        product.metalType || 'gold', product.size || '', 
                        product.weight || 0, product.purity || 100, 
                        product.rate || 0, product.mcRate || 0,
                        product.mcType || 'MC/GM', product.pcs || 1, 
                        product.boxCharges || 0, product.stoneCharges || 0,
                        product.floor || 'Main Floor', product.avgWt || product.weight || 0,
                        product.status || 'available', attrs, product.imageUrl || null
                    ];
                    
                    const result = await client.query(insertQuery, params);
                    insertedProducts.push(result.rows[0]);
                } catch (error) {
                    if (error.message.includes('unique') || error.message.includes('duplicate')) {
                        errors.push({ barcode: product.barcode, error: 'Barcode already exists' });
                    } else {
                        errors.push({ barcode: product.barcode, error: error.message });
                    }
                }
            }
            
            await client.query('COMMIT');
            
            insertedProducts.forEach(product => {
                broadcast('product-created', product);
            });
            
            res.json({
                success: true,
                inserted: insertedProducts.length,
                errors: errors.length,
                errorDetails: errors.slice(0, 10)
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        // Set status to 'deleted' instead of hard delete
        await query('UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['deleted', id]);
        broadcast('product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark products as sold (used when bill is saved)
app.post('/api/products/mark-sold', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { barcodes, billNo, customerName } = req.body;
        
        if (!Array.isArray(barcodes) || barcodes.length === 0) {
            return res.status(400).json({ error: 'Barcodes array is required' });
        }
        
        const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
        const queryText = `UPDATE products 
            SET status = 'sold', 
                sold_bill_no = $${barcodes.length + 1},
                sold_customer_name = $${barcodes.length + 2},
                is_sold = true,
                updated_at = CURRENT_TIMESTAMP 
            WHERE barcode IN (${placeholders}) AND (status IS NULL OR status = 'available')`;
        
        const params = [...barcodes, billNo || null, customerName || null];
        await query(queryText, params);
        
        broadcast('products-sold', { barcodes, billNo });
        res.json({ success: true, updated: barcodes.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// STYLES API (Product Hierarchy)
// ==========================================

// Get all styles (with optional category filter)
app.get('/api/styles', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { category, styleCode } = req.query;
        let queryText = 'SELECT DISTINCT style_code, category FROM styles WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (category) {
            queryText += ` AND category = $${paramIndex++}`;
            params.push(category);
        }
        
        if (styleCode) {
            queryText += ` AND style_code = $${paramIndex++}`;
            params.push(styleCode);
        }
        
        queryText += ' ORDER BY category, style_code';
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all unique categories
app.get('/api/styles/categories', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const result = await query('SELECT DISTINCT category FROM styles WHERE category IS NOT NULL ORDER BY category');
        res.json(result.map(r => r.category));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all styles (full list with all fields)
app.get('/api/styles/all', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const result = await query('SELECT * FROM styles ORDER BY style_code, sku_code');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get SKUs for a specific style code (case-insensitive match for style_code)
app.get('/api/styles/:styleCode/skus', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode } = req.params;
        const result = await query(
            'SELECT sku_code, item_name, metal_type, purity, mc_type, mc_value, hsn_code FROM styles WHERE UPPER(TRIM(style_code)) = UPPER(TRIM($1)) ORDER BY sku_code',
            [styleCode]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get style details by style_code and sku_code
app.get('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const result = await query(
            'SELECT * FROM styles WHERE style_code = $1 AND sku_code = $2',
            [styleCode, skuCode]
        );
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update style by style_code and sku_code
app.put('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const { item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description, image_url } = req.body;
        
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (item_name !== undefined) {
            updates.push(`item_name = $${paramIndex++}`);
            params.push(item_name);
        }
        if (category !== undefined) {
            updates.push(`category = $${paramIndex++}`);
            params.push(category);
        }
        if (metal_type !== undefined) {
            updates.push(`metal_type = $${paramIndex++}`);
            params.push(metal_type);
        }
        if (purity !== undefined) {
            updates.push(`purity = $${paramIndex++}`);
            params.push(purity);
        }
        if (mc_type !== undefined) {
            updates.push(`mc_type = $${paramIndex++}`);
            params.push(mc_type);
        }
        if (mc_value !== undefined) {
            updates.push(`mc_value = $${paramIndex++}`);
            params.push(mc_value);
        }
        if (hsn_code !== undefined) {
            updates.push(`hsn_code = $${paramIndex++}`);
            params.push(hsn_code);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        if (image_url !== undefined) {
            updates.push(`image_url = $${paramIndex++}`);
            params.push(image_url);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(styleCode, skuCode);
        
        const queryText = `UPDATE styles SET ${updates.join(', ')} WHERE style_code = $${paramIndex} AND sku_code = $${paramIndex + 1} RETURNING *`;
        const result = await query(queryText, params);
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete style by style_code and sku_code
app.delete('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        
        // Prevent deletion of ROOT SKU (placeholder that keeps style visible)
        if ((skuCode || '').toUpperCase() === 'ROOT') {
            return res.status(400).json({ error: 'Cannot delete ROOT SKU. This is a system placeholder that ensures the style remains visible.' });
        }
        
        const result = await query(
            'DELETE FROM styles WHERE style_code = $1 AND sku_code = $2 RETURNING *',
            [styleCode, skuCode]
        );
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        
        res.json({ success: true, deleted: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new style
app.post('/api/styles', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { style_code, sku_code, item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description, image_url } = req.body;
        
        if (!style_code || !sku_code) {
            return res.status(400).json({ error: 'style_code and sku_code are required' });
        }
        
        const queryText = `INSERT INTO styles (
            style_code, sku_code, item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description, image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`;
        
        const params = [
            style_code, sku_code, item_name || null, category || null, metal_type || null,
            purity || null, mc_type || null, mc_value || null, hsn_code || null, description || null,
            image_url || null
        ];
        
        const result = await query(queryText, params);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: 'Style with this style_code and sku_code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ITEMS API (Style → SKU → Item hierarchy level)
// ==========================================

// Get all items (optionally filtered by style_code and/or sku_code)
app.get('/api/items', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { style_code, sku_code } = req.query;
        let queryText = 'SELECT * FROM items WHERE is_active = true';
        const params = [];
        let paramCount = 1;

        if (style_code) {
            queryText += ` AND style_code = $${paramCount++}`;
            params.push(style_code);
        }
        if (sku_code) {
            queryText += ` AND sku_code = $${paramCount++}`;
            params.push(sku_code);
        }

        queryText += ' ORDER BY style_code, sku_code, item_code';
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get items for a specific style+SKU pair
app.get('/api/items/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const result = await query(
            'SELECT * FROM items WHERE style_code = $1 AND sku_code = $2 AND is_active = true ORDER BY item_code',
            [styleCode, skuCode]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single item
app.get('/api/items/:styleCode/:skuCode/:itemCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode, itemCode } = req.params;
        const result = await query(
            'SELECT * FROM items WHERE style_code = $1 AND sku_code = $2 AND item_code = $3',
            [styleCode, skuCode, itemCode]
        );
        if (result.length === 0) return res.status(404).json({ error: 'Item not found' });
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create item
app.post('/api/items', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { style_code, sku_code, item_code, item_name, description, image_url } = req.body;
        if (!style_code || !sku_code || !item_code) {
            return res.status(400).json({ error: 'style_code, sku_code, and item_code are required' });
        }
        const result = await query(
            `INSERT INTO items (style_code, sku_code, item_code, item_name, description, image_url)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [style_code, sku_code, item_code, item_name || null, description || null, image_url || null]
        );
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: 'Item with this style_code, sku_code, and item_code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Update item
app.put('/api/items/:styleCode/:skuCode/:itemCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode, itemCode } = req.params;
        const { item_name, description, image_url, is_active } = req.body;

        const updates = [];
        const params = [];
        let idx = 1;

        if (item_name !== undefined) { updates.push(`item_name = $${idx++}`); params.push(item_name); }
        if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
        if (image_url !== undefined) { updates.push(`image_url = $${idx++}`); params.push(image_url); }
        if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); params.push(is_active); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(styleCode, skuCode, itemCode);

        const queryText = `UPDATE items SET ${updates.join(', ')} WHERE style_code = $${idx} AND sku_code = $${idx + 1} AND item_code = $${idx + 2} RETURNING *`;
        const result = await query(queryText, params);

        if (result.length === 0) return res.status(404).json({ error: 'Item not found' });
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete item (soft delete)
app.delete('/api/items/:styleCode/:skuCode/:itemCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode, itemCode } = req.params;
        const result = await query(
            'UPDATE items SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE style_code = $1 AND sku_code = $2 AND item_code = $3 RETURNING *',
            [styleCode, skuCode, itemCode]
        );
        if (result.length === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ success: true, deleted: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PRODUCT IMAGES API
// ==========================================

// Get images for a product barcode
app.get('/api/product-images/:barcode', checkAuth, async (req, res) => {
    try {
        const { barcode } = req.params;
        const result = await query(
            'SELECT * FROM product_images WHERE product_barcode = $1 ORDER BY is_primary DESC, sort_order ASC',
            [barcode]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add image to a product
app.post('/api/product-images', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { product_barcode, image_url, is_primary } = req.body;
        if (!product_barcode || !image_url) {
            return res.status(400).json({ error: 'product_barcode and image_url are required' });
        }

        // If marking as primary, unset other primaries first
        if (is_primary) {
            await query('UPDATE product_images SET is_primary = false WHERE product_barcode = $1', [product_barcode]);
        }

        const result = await query(
            'INSERT INTO product_images (product_barcode, image_url, is_primary) VALUES ($1, $2, $3) RETURNING *',
            [product_barcode, image_url, is_primary || false]
        );

        // Also update products.image_url if this is the primary image
        if (is_primary) {
            await query('UPDATE products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE barcode = $2', [image_url, product_barcode]);
        }

        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Set an image as primary
app.put('/api/product-images/:id/primary', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        const imgRow = await query('SELECT * FROM product_images WHERE id = $1', [id]);
        if (imgRow.length === 0) return res.status(404).json({ error: 'Image not found' });

        const barcode = imgRow[0].product_barcode;
        await query('UPDATE product_images SET is_primary = false WHERE product_barcode = $1', [barcode]);
        await query('UPDATE product_images SET is_primary = true WHERE id = $1', [id]);
        await query('UPDATE products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE barcode = $2', [imgRow[0].image_url, barcode]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a product image
app.delete('/api/product-images/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        const imgRow = await query('SELECT * FROM product_images WHERE id = $1', [id]);
        if (imgRow.length === 0) return res.status(404).json({ error: 'Image not found' });

        await query('DELETE FROM product_images WHERE id = $1', [id]);

        // If deleted image was primary, clear products.image_url too
        if (imgRow[0].is_primary) {
            await query('UPDATE products SET image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE barcode = $1', [imgRow[0].product_barcode]);
        }

        // Try to delete the file from disk
        const filename = imgRow[0].image_url.replace('/uploads/products/', '');
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Resolve best image for a product (cascade: Product → Item → SKU)
app.get('/api/product-image/:barcode', checkAuth, async (req, res) => {
    try {
        const imageUrl = await resolveProductImage(req.params.barcode);
        res.json({ imageUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// B2B EXCEL EXPORT (with embedded images)
// ==========================================

app.post('/api/exports/b2b-excel', checkAuth, async (req, res) => {
    try {
        const { items: exportItems } = req.body;
        if (!Array.isArray(exportItems) || exportItems.length === 0) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Jewellery ERP';
        const sheet = workbook.addWorksheet('B2B Selection', {
            properties: { defaultRowHeight: 80 }
        });

        sheet.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Image', key: 'image', width: 15 },
            { header: 'Style Code', key: 'styleCode', width: 15 },
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Item', key: 'itemName', width: 20 },
            { header: 'Attributes', key: 'attributes', width: 20 },
            { header: 'Size', key: 'size', width: 10 },
            { header: 'Weight (g)', key: 'weight', width: 12 },
            { header: 'Qty', key: 'qty', width: 8 },
            { header: 'Remarks', key: 'remarks', width: 15 },
        ];

        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, size: 11 };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4A853' } };

        for (let i = 0; i < exportItems.length; i++) {
            const entry = exportItems[i];
            const barcode = entry.barcode;
            const qty = entry.qty || 1;

            // Fetch product details
            const prodRows = await query('SELECT * FROM products WHERE barcode = $1', [barcode]);
            if (prodRows.length === 0) continue;
            const prod = prodRows[0];

            const attrs = prod.attributes || {};
            const attrStr = Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(', ');

            const rowNum = i + 2;
            const row = sheet.getRow(rowNum);
            row.height = 80;
            row.alignment = { vertical: 'middle', wrapText: true };

            row.getCell('sno').value = i + 1;
            row.getCell('styleCode').value = prod.style_code || '';
            row.getCell('sku').value = prod.sku || '';
            row.getCell('itemName').value = prod.short_name || prod.item_name || '';
            row.getCell('attributes').value = attrStr;
            row.getCell('size').value = prod.size || '';
            row.getCell('weight').value = prod.weight ? parseFloat(prod.weight) : '';
            row.getCell('qty').value = qty;
            row.getCell('remarks').value = '';

            // Resolve image via cascade
            const imageUrl = await resolveProductImage(barcode);
            if (imageUrl) {
                const imgPath = path.join(__dirname, 'public', imageUrl);
                if (fs.existsSync(imgPath)) {
                    try {
                        const ext = path.extname(imgPath).toLowerCase().replace('.', '');
                        const imgId = workbook.addImage({
                            filename: imgPath,
                            extension: ext === 'jpg' ? 'jpeg' : ext,
                        });
                        sheet.addImage(imgId, {
                            tl: { col: 1, row: rowNum - 1 },
                            ext: { width: 90, height: 75 },
                            editAs: 'oneCell'
                        });
                    } catch (imgErr) {
                        console.warn(`Could not embed image for ${barcode}:`, imgErr.message);
                    }
                }
            }
        }

        // Add borders
        sheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=B2B_Selection_${Date.now()}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('B2B Excel export error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CUSTOMERS API
// ==========================================

app.get('/api/customers', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { mobile, search } = req.query;
        
        let queryText = 'SELECT * FROM customers WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (mobile) {
            queryText += ` AND mobile = $${paramCount++}`;
            params.push(mobile);
        }
        if (search) {
            queryText += ` AND (name ILIKE $${paramCount} OR mobile ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY name';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const customer = req.body;
        
        const queryText = `INSERT INTO customers (name, mobile, address1, address2, city, state, pincode, gstin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin
        ];
        
        const result = await query(queryText, params);
        broadcast('customer-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/customers/:id', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { id } = req.params;
        const customer = req.body;
        
        const queryText = `UPDATE customers SET
            name = $1, mobile = $2, address1 = $3, address2 = $4, city = $5,
            state = $6, pincode = $7, gstin = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin, id
        ];
        
        const result = await query(queryText, params);
        broadcast('customer-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/customers/:id', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM customers WHERE id = $1', [id]);
        broadcast('customer-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// QUOTATIONS API
// ==========================================

app.get('/api/quotations', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { type } = req.query;
        
        let queryText = 'SELECT * FROM quotations WHERE (is_deleted = false OR is_deleted IS NULL)';
        const params = [];
        
        // Filter by bill_type if provided
        if (type) {
            queryText += ' AND bill_type = $1';
            params.push(type);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quotations', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const quotation = req.body;
        const billType = quotation.bill_type || 'TAX'; // Default to 'TAX' if not provided
        
        const queryText = `INSERT INTO quotations (
            quotation_no, customer_id, customer_name, customer_mobile, items, total, gst, net_total,
            discount, advance, final_amount, payment_status, remarks, bill_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`;
        
        const params = [
            quotation.quotationNo, quotation.customerId, quotation.customerName,
            quotation.customerMobile, JSON.stringify(quotation.items), quotation.total,
            quotation.gst, quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks, billType
        ];
        
        const result = await query(queryText, params);
        
        // CRUCIAL: When quotation is saved, mark products as 'sold' in products table
        // This ensures physical stock decreases regardless of bill type
        if (quotation.items && Array.isArray(quotation.items)) {
            const barcodes = quotation.items
                .map(item => item.barcode)
                .filter(barcode => barcode); // Filter out null/undefined barcodes
            
            if (barcodes.length > 0) {
                try {
                    const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
                    const markSoldQuery = `UPDATE products 
                        SET status = 'sold', 
                            sold_bill_no = $${barcodes.length + 1},
                            sold_customer_name = $${barcodes.length + 2},
                            is_sold = true,
                            updated_at = CURRENT_TIMESTAMP 
                        WHERE barcode IN (${placeholders}) AND (status IS NULL OR status = 'available')`;
                    
                    const markSoldParams = [...barcodes, quotation.quotationNo || null, quotation.customerName || null];
                    await query(markSoldQuery, markSoldParams);
                    
                    broadcast('products-sold', { barcodes, billNo: quotation.quotationNo });
                } catch (markSoldError) {
                    // Log error but don't fail the quotation creation
                    console.error('Error marking products as sold:', markSoldError);
                }
            }
        }
        
        broadcast('quotation-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/quotations/:id', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { id } = req.params;
        const quotation = req.body;
        
        const queryText = `UPDATE quotations SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, net_total = $7, discount = $8, advance = $9,
            final_amount = $10, payment_status = $11, remarks = $12, bill_type = COALESCE($13, bill_type)
        WHERE id = $14 RETURNING *`;
        
        const params = [
            quotation.customerId, quotation.customerName, quotation.customerMobile,
            JSON.stringify(quotation.items), quotation.total, quotation.gst,
            quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks, 
            quotation.bill_type || null, id
        ];
        
        const result = await query(queryText, params);
        broadcast('quotation-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/quotations/:id', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete: Set is_deleted = true instead of hard delete
        await query('UPDATE quotations SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        broadcast('quotation-deleted', { id: parseInt(id) });
        res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// RECYCLE QUOTATION (Professional Version with Audit Timestamp)
// ==========================================
app.post('/api/quotations/:id/recycle', checkAuth, hasPermission('quotations'), async (req, res) => {
    const dbPool = getPool(); 
    const client = await dbPool.connect(); 
    
    try {
        const { id } = req.params;
        await client.query('BEGIN'); // Start Transaction

        // 1. Get current items
        const quotationResult = await client.query('SELECT items FROM quotations WHERE id = $1', [id]);
        if (quotationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quotation not found' });
        }

        const quotation = quotationResult.rows[0];
        let items = [];
        try {
            items = typeof quotation.items === 'string' ? JSON.parse(quotation.items) : quotation.items;
        } catch (e) { items = []; }

        // 2. Revert Stock (Un-sell products)
        if (items && Array.isArray(items) && items.length > 0) {
            const barcodes = items.map(item => item.barcode).filter(b => b);
            if (barcodes.length > 0) {
                const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
                
                // Keep updated_at here for audit trail
                await client.query(
                    `UPDATE products SET 
                        status = 'available', 
                        sold_bill_no = NULL, 
                        sold_customer_name = NULL, 
                        is_sold = false,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE barcode IN (${placeholders})`,
                    barcodes
                );
            }
        }

        // 3. Reset Quotation Record
        // Keep updated_at here for audit trail
        const resetResult = await client.query(
            `UPDATE quotations SET 
                customer_id = NULL, customer_name = '', customer_mobile = '', 
                items = '[]', total = 0, gst = 0, net_total = 0, 
                discount = 0, advance = 0, final_amount = 0, 
                payment_status = NULL, remarks = NULL, is_deleted = false,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id]
        );

        await client.query('COMMIT'); 
        
        if (items.length > 0) {
             const barcodes = items.map(item => item.barcode).filter(b => b);
             if(typeof broadcast === 'function') broadcast('products-reverted', { barcodes, quotationId: id });
        }
        if(typeof broadcast === 'function') broadcast('quotation-recycled', resetResult.rows[0]);

        res.json({ success: true, message: 'Quotation reset successfully', quotation: resetResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recycling quotation:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ==========================================
// BILLS API
// Protected by: hasPermission('billing')
// ==========================================

app.get('/api/bills', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { billNo, date } = req.query;
        
        let queryText = 'SELECT * FROM bills WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (billNo) {
            queryText += ` AND bill_no = $${paramCount++}`;
            params.push(billNo);
        }
        if (date) {
            queryText += ` AND DATE(date) = $${paramCount++}`;
            params.push(date);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/bills/by-number/:billNo', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { billNo } = req.params;
        const result = await query('SELECT * FROM bills WHERE bill_no = $1', [billNo]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/bills', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const bill = req.body;
        
        const queryText = `INSERT INTO bills (
            bill_no, quotation_id, customer_id, customer_name, customer_mobile, items,
            total, gst, cgst, sgst, net_total, payment_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
        
        const params = [
            bill.billNo, bill.quotationId || null, bill.customerId, bill.customerName,
            bill.customerMobile, JSON.stringify(bill.items), bill.total,
            bill.gst || 0, bill.cgst || 0, bill.sgst || 0, bill.netTotal, bill.paymentMethod || 'cash'
        ];
        
        const result = await query(queryText, params);
        broadcast('bill-created', result[0]);
        
        // Update quotation to mark as billed
        if (bill.quotationId) {
            await query(
                `UPDATE quotations SET is_billed = true, bill_no = $1, bill_date = CURRENT_TIMESTAMP WHERE id = $2`,
                [bill.billNo, bill.quotationId]
            );
        }
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncSalesBill(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/bills/:id', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { id } = req.params;
        const bill = req.body;
        
        const queryText = `UPDATE bills SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, cgst = $7, sgst = $8, net_total = $9, payment_method = $10
        WHERE id = $11 RETURNING *`;
        
        const params = [
            bill.customerId, bill.customerName, bill.customerMobile, JSON.stringify(bill.items),
            bill.total, bill.gst || 0, bill.cgst || 0, bill.sgst || 0,
            bill.netTotal, bill.paymentMethod || 'cash', id
        ];
        
        const result = await query(queryText, params);
        broadcast('bill-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/bills/:id', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM bills WHERE id = $1', [id]);
        broadcast('bill-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// INVOICE SETTINGS API (Company Details)
// ==========================================
app.get('/api/invoice-settings', checkAuth, async (req, res) => {
    try {
        let result;
        try {
            result = await query('SELECT * FROM invoice_settings ORDER BY id DESC LIMIT 1');
        } catch (err) {
            if (err.message && err.message.includes('invoice_settings')) {
                return res.json({ companyName: '', companyAddress: '', gstin: '', bankName: '', accountName: '', accountNo: '', ifscCode: '' });
            }
            throw err;
        }
        if (!result || result.length === 0) {
            return res.json({ companyName: '', companyAddress: '', gstin: '', bankName: '', accountName: '', accountNo: '', ifscCode: '' });
        }
        const row = result[0];
        res.json({
            companyName: row.company_name || '',
            companyAddress: row.company_address || '',
            gstin: row.gstin || '',
            bankName: row.bank_name || '',
            accountName: row.account_name || '',
            accountNo: row.account_no || '',
            ifscCode: row.ifsc_code || ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/invoice-settings', checkAuth, async (req, res) => {
    try {
        const { companyName, companyAddress, gstin, bankName, accountName, accountNo, ifscCode } = req.body;
        let result = await query('SELECT id FROM invoice_settings LIMIT 1');
        if (!result || result.length === 0) {
            await query(`INSERT INTO invoice_settings (company_name, company_address, gstin, bank_name, account_name, account_no, ifsc_code)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [companyName || '', companyAddress || '', gstin || '', bankName || '', accountName || '', accountNo || '', ifscCode || '']);
        } else {
            await query(`UPDATE invoice_settings SET company_name=$1, company_address=$2, gstin=$3, bank_name=$4, account_name=$5, account_no=$6, ifsc_code=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$8`,
                [companyName || '', companyAddress || '', gstin || '', bankName || '', accountName || '', accountNo || '', ifscCode || '', result[0].id]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// E-INVOICE API (GSP Mock - Awaiting API Key)
// ==========================================
app.post('/api/einvoice/generate/:billNo', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { billNo } = req.params;
        const billResult = await query('SELECT * FROM bills WHERE bill_no = $1', [billNo]);
        if (!billResult || billResult.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        const bill = billResult[0];
        const items = typeof bill.items === 'string' ? JSON.parse(bill.items) : (bill.items || []);
        const aggregatedItems = aggregateBillItems(items);

        const invoiceSettings = await (async () => {
            try {
                const r = await query('SELECT * FROM invoice_settings ORDER BY id DESC LIMIT 1');
                return r && r.length ? r[0] : {};
            } catch (_) { return {}; }
        })();

        const eInvoiceJson = {
            Version: '1.1',
            TranDtls: { TaxSch: 'GST', SupTyp: 'B2C' },
            DocDtls: { Typ: 'INV', No: billNo, Dt: (bill.date || new Date()).toISOString().split('T')[0] },
            SellerDtls: {
                Gstin: invoiceSettings.gstin || '',
                LglNm: invoiceSettings.company_name || '',
                Addr1: (invoiceSettings.company_address || '').split(',')[0] || '',
                Addr2: (invoiceSettings.company_address || '').split(',').slice(1).join(',') || '',
                Loc: '',
                Stcd: '33',
                Ph: '',
                Em: ''
            },
            BuyerDtls: {
                Gstin: '',
                LglNm: bill.customer_name || 'Cash Customer',
                Addr1: '',
                Addr2: '',
                Loc: '',
                Stcd: '',
                Ph: bill.customer_mobile || '',
                Em: ''
            },
            ItemList: aggregatedItems.map((it, i) => ({
                SlNo: String(i + 1),
                PrdDesc: it.Name,
                HsnCd: it.HSN,
                Qty: it.totalPcs,
                Unit: 'PCS',
                UnitPrice: it.averageRate,
                TotAmt: it.totalAmount,
                GstRt: 3,
                Txval: it.totalAmount,
                IaGstRt: 0,
                IaGstAmt: 0,
                CgstRt: 1.5,
                CgstAmt: (it.totalAmount * 0.015),
                SgstRt: 1.5,
                SgstAmt: (it.totalAmount * 0.015)
            }))
        };

        res.json({
            success: true,
            message: 'GSP API Setup Ready. Payload generated. Awaiting API Key activation.',
            payload: eInvoiceJson
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper: aggregate bill items for GST (used by E-Invoice and Tally)
function aggregateBillItems(items) {
    const HSN = { gold: '7113', silver: '7114', platinum: '7112', diamond: '7113', imitation: '7117' };
    const metalMap = {};
    (items || []).forEach(item => {
        const metal = (item.metalType || 'silver').toLowerCase();
        const isManual = item.isManual === true || !item.barcode;
        const name = isManual ? `${metal.charAt(0).toUpperCase() + metal.slice(1)} Article` : `${metal.charAt(0).toUpperCase() + metal.slice(1)} Jewellery`;
        const purity = parseFloat(item.purity) || 100;
        const hsn = item.hsn || HSN[metal] || '7114';
        const key = `${name}|${purity}|${hsn}`;
        if (!metalMap[key]) {
            metalMap[key] = { Name: name, Purity: purity, HSN: hsn, totalPcs: 0, totalWeight: 0, totalAmount: 0 };
        }
        metalMap[key].totalPcs += (item.pcs || 1);
        metalMap[key].totalWeight += parseFloat(item.weight || item.net_wt || 0);
        metalMap[key].totalAmount += parseFloat(item.amount || (item.rate || 0) * (item.weight || item.net_wt || 0));
    });
    return Object.values(metalMap).map(m => ({
        ...m,
        averageRate: m.totalWeight > 0 ? m.totalAmount / m.totalWeight : 0
    }));
}

// ==========================================
// ADMIN PANEL API
// ==========================================

// Get all users (for admin panel)
app.get('/api/admin/users', checkRole('admin'), async (req, res) => {
    try {
        // Try query with is_deleted filter first, fallback to query without it if column doesn't exist
        let result;
        try {
            result = await query(`
                SELECT id, google_id, email, name, role, allowed_tabs, permissions, 
                       account_status, phone_number, created_at, updated_at 
                FROM users 
                WHERE COALESCE(is_deleted, false) = false
                ORDER BY 
                    CASE WHEN email = 'jaigaurav56789@gmail.com' THEN 0 ELSE 1 END,
                    role ASC,
                    created_at DESC
            `);
        } catch (colError) {
            // If is_deleted column doesn't exist, query without it
            if (colError.message && colError.message.includes('is_deleted')) {
                console.warn('is_deleted column not found, querying all users');
                result = await query(`
                    SELECT id, google_id, email, name, role, allowed_tabs, permissions, 
                           account_status, phone_number, created_at, updated_at 
                    FROM users 
                    ORDER BY 
                        CASE WHEN email = 'jaigaurav56789@gmail.com' THEN 0 ELSE 1 END,
                        role ASC,
                        created_at DESC
                `);
            } else {
                throw colError;
            }
        }
        
        // Handle NULL or undefined result - return empty array instead of crashing
        if (!result || !Array.isArray(result)) {
            return res.json([]);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching users:', error);
        // Return empty array on error instead of crashing (prevents 500 error)
        res.json([]);
    }
});

// Update user status/role (for admin panel)
app.post('/api/admin/users/:id/status', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, role } = req.body;
        
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            updates.push(`account_status = $${paramIndex++}`);
            params.push(status);
        }
        if (role) {
            updates.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }
        
        params.push(id);
        const result = await query(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
            params
        );
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin SQL query endpoint (SELECT only)
app.post('/api/admin/query', checkRole('admin'), async (req, res) => {
    try {
        const { query: sqlQuery } = req.body;
        
        if (!sqlQuery || typeof sqlQuery !== 'string') {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Security: Only allow SELECT statements
        const trimmedQuery = sqlQuery.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            return res.status(403).json({ error: 'Only SELECT queries are allowed' });
        }
        
        // Block dangerous keywords
        const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
        for (const keyword of dangerousKeywords) {
            if (trimmedQuery.includes(keyword)) {
                return res.status(403).json({ error: `Query contains forbidden keyword: ${keyword}` });
            }
        }
        
        const result = await pool.query(sqlQuery);
        res.json({ rows: result.rows, rowCount: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change admin password
app.post('/api/admin/change-password', checkRole('admin'), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const bcrypt = require('bcrypt');
        
        // Get current admin user
        const adminUser = await query('SELECT * FROM admin_users WHERE username = $1', ['Gaurav']);
        
        if (adminUser.length === 0) {
            return res.status(404).json({ error: 'Admin user not found' });
        }
        
        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, adminUser[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Hash and save new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hashedPassword, 'Gaurav']);
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// USER WHITELIST MANAGEMENT (Admin Only)
// Granular Permissions System v2.0
// ==========================================

// Available permission modules
const PERMISSION_MODULES = [
    'billing',      // Billing tab
    'products',     // Products & Stock tab
    'customers',    // CRM / Customers tab
    'rol',          // ROL Management tab
    'quotations',   // Quotations tab
    'salesbill',    // Sales Bill tab
    'salesreturn',  // Sales Return tab
    'billhistory',  // Bill History tab
    'ledger',       // Ledger tab
    'styles',       // Style Master tab
    'pv',           // Purchase Voucher / Stock-In tab
    'tagsplit',     // Tag Split/Merge tab
    'tagsearch',    // Tag Search tab
    'floor',        // Floor Management tab
    'reports'       // Reports tab
];

// Get available permission modules (for frontend)
app.get('/api/admin/permission-modules', checkRole('admin'), (req, res) => {
    res.json({
        modules: PERMISSION_MODULES,
        moduleGroups: {
            'Sales & Billing': ['billing', 'salesbill', 'salesreturn', 'quotations', 'billhistory'],
            'Inventory': ['products', 'pv', 'tagsplit', 'tagsearch', 'floor'],
            'CRM & Finance': ['customers', 'ledger'],
            'Management': ['rol', 'styles', 'reports']
        }
    });
});

// Add user to whitelist (pre-approve email) with permissions
app.post('/api/admin/add-user', checkRole('admin'), async (req, res) => {
    try {
        const { email, name, role, allowed_tabs, permissions: requestPermissions } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Check if user already exists
        const existingUser = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        
        // Validate role
        const validRoles = ['employee', 'admin'];
        const userRole = validRoles.includes(role) ? role : 'employee';
        
        // Set default permissions based on role
        let userAllowedTabs = allowed_tabs;
        if (!userAllowedTabs || !Array.isArray(userAllowedTabs) || userAllowedTabs.length === 0) {
            // Default: Admin gets all, Employee gets billing only
            userAllowedTabs = userRole === 'admin' ? ['all'] : ['billing'];
        }
        
        // Validate allowed_tabs values
        const validTabs = ['all', ...PERMISSION_MODULES];
        userAllowedTabs = userAllowedTabs.filter(tab => validTabs.includes(tab));
        if (userAllowedTabs.length === 0) {
            userAllowedTabs = ['billing']; // Fallback to billing
        }
        
        // Build permissions JSON - merge with request permissions (for no2_access)
        const permissions = {
            all: userAllowedTabs.includes('all'),
            modules: userAllowedTabs.includes('all') ? ['*'] : userAllowedTabs,
            ...(requestPermissions || {}) // Merge custom permissions like no2_access
        };
        
        // Insert new user with permissions
        const result = await query(
            `INSERT INTO users (email, name, role, account_status, allowed_tabs, permissions, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
            [email.toLowerCase(), name || 'New User', userRole, 'active', userAllowedTabs, JSON.stringify(permissions)]
        );
        
        console.log(`✅ User whitelisted by admin: ${email} (Role: ${userRole}, Tabs: ${userAllowedTabs.join(', ')})`);
        
        res.json({ 
            success: true, 
            message: `User ${email} added to whitelist successfully`,
            user: result[0]
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update existing user (full edit)
app.put('/api/admin/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, account_status, allowed_tabs, permissions } = req.body;
        
        // Check if user exists
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = existingUser[0];
        
        // Prevent modifying super admin's role or permissions
        if (user.email === 'jaigaurav56789@gmail.com') {
            // Only allow name update for super admin
            if (role && role !== 'admin') {
                return res.status(403).json({ error: 'Cannot change Super Admin role' });
            }
            if (allowed_tabs && !allowed_tabs.includes('all')) {
                return res.status(403).json({ error: 'Cannot restrict Super Admin permissions' });
            }
        }
        
        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        
        if (role !== undefined) {
            const validRoles = ['employee', 'admin'];
            if (validRoles.includes(role)) {
                updates.push(`role = $${paramIndex++}`);
                params.push(role);
            }
        }
        
        if (account_status !== undefined) {
            const validStatuses = ['active', 'pending', 'suspended', 'rejected'];
            if (validStatuses.includes(account_status)) {
                updates.push(`account_status = $${paramIndex++}`);
                params.push(account_status);
            }
        }
        
        // Handle permissions update - merge logic to avoid duplicate column assignment
        let finalPermissions = user.permissions || {};
        
        if (allowed_tabs !== undefined && Array.isArray(allowed_tabs)) {
            // Validate allowed_tabs values
            const validTabs = ['all', ...PERMISSION_MODULES];
            const cleanTabs = allowed_tabs.filter(tab => validTabs.includes(tab));
            
            if (cleanTabs.length > 0) {
                updates.push(`allowed_tabs = $${paramIndex++}`);
                params.push(cleanTabs);
                
                // Merge permissions instead of overwriting (preserve no2_access and other custom permissions)
                finalPermissions = {
                    ...finalPermissions, // Preserve existing permissions (like no2_access)
                    all: cleanTabs.includes('all'),
                    modules: cleanTabs.includes('all') ? ['*'] : cleanTabs
                };
            }
        }
        
        // Handle explicit permissions update separately (for no2_access and other custom permissions)
        if (permissions !== undefined && typeof permissions === 'object') {
            // Merge with existing permissions instead of overwriting
            finalPermissions = {
                ...finalPermissions,
                ...permissions // Merge new permissions (preserves no2_access if sent)
            };
        }
        
        // Only add permissions to SET clause once if it was modified
        if (allowed_tabs !== undefined || (permissions !== undefined && typeof permissions === 'object')) {
            updates.push(`permissions = $${paramIndex++}`);
            params.push(JSON.stringify(finalPermissions));
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);
        
        const queryText = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await query(queryText, params);
        
        console.log(`📝 User updated: ${user.email} (ID: ${id})`);
        
        res.json({ success: true, user: result[0] });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove user from whitelist (revoke access)
app.delete('/api/admin/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID is a number
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // Check if user exists and get details
        const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (userResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult[0];
        
        // Prevent deleting super admin
        if (user.email === 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot delete Super Admin account' });
        }
        
        // Prevent admin from deleting themselves
        if (req.user && req.user.id === userId) {
            return res.status(403).json({ error: 'Cannot delete your own account' });
        }
        
        // Delete the user
        await query('DELETE FROM users WHERE id = $1', [userId]);
        
        console.log(`🗑️ User removed from whitelist: ${user.email} (ID: ${userId})`);
        res.json({ success: true, message: `User ${user.email} removed successfully` });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user allowed tabs (legacy endpoint, kept for compatibility)
app.put('/api/admin/users/:id/tabs', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { allowedTabs } = req.body;
        
        if (!Array.isArray(allowedTabs)) {
            return res.status(400).json({ error: 'allowedTabs must be an array' });
        }
        
        // Check if user exists
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent restricting super admin
        if (existingUser[0].email === 'jaigaurav56789@gmail.com' && !allowedTabs.includes('all')) {
            return res.status(403).json({ error: 'Cannot restrict Super Admin permissions' });
        }
        
        // Validate and clean tabs
        const validTabs = ['all', ...PERMISSION_MODULES];
        const cleanTabs = allowedTabs.filter(tab => validTabs.includes(tab));
        
        // Build permissions JSON
        const permissions = {
            all: cleanTabs.includes('all'),
            modules: cleanTabs.includes('all') ? ['*'] : cleanTabs
        };
        
        const result = await query(
            'UPDATE users SET allowed_tabs = $1, permissions = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [cleanTabs, JSON.stringify(permissions), id]
        );
        
        res.json({ success: true, user: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// RATES API
// ==========================================

app.get('/api/rates', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        res.json(result[0] || { gold: 7500, silver: 156, platinum: 3500 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rates', checkAuth, async (req, res) => {
    try {
        const { gold, silver, platinum } = req.body;
        
        const queryText = `UPDATE rates SET gold = $1, silver = $2, platinum = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM rates ORDER BY updated_at DESC LIMIT 1)
        RETURNING *`;
        
        const result = await query(queryText, [gold, silver, platinum]);
        broadcast('rates-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT route for rates (same as POST, for RESTful API compatibility)
app.put('/api/rates', checkAuth, async (req, res) => {
    try {
        const { gold, silver, platinum } = req.body;
        
        const queryText = `UPDATE rates SET gold = $1, silver = $2, platinum = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM rates ORDER BY updated_at DESC LIMIT 1)
        RETURNING *`;
        
        const result = await query(queryText, [gold, silver, platinum]);
        broadcast('rates-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// LEDGER TRANSACTIONS API
// ==========================================

app.get('/api/ledger/transactions', checkAuth, hasPermission('ledger'), async (req, res) => {
    try {
        const { customerId, type, startDate, endDate } = req.query;
        
        let queryText = 'SELECT * FROM ledger_transactions WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (customerId) {
            queryText += ` AND customer_id = $${paramCount++}`;
            params.push(customerId);
        }
        if (type) {
            queryText += ` AND transaction_type = $${paramCount++}`;
            params.push(type);
        }
        if (startDate) {
            queryText += ` AND DATE(date) >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            queryText += ` AND DATE(date) <= $${paramCount++}`;
            params.push(endDate);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ledger/transactions', checkAuth, hasPermission('ledger'), async (req, res) => {
    try {
        const transaction = req.body;
        
        const queryText = `INSERT INTO ledger_transactions (
            customer_id, transaction_type, amount, description, date, cash_type, is_restricted, payment_method, reference, customer_name, customer_mobile, bill_no
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
        
        const params = [
            transaction.customerId || null, transaction.transactionType,
            transaction.amount, transaction.description, transaction.date || new Date(),
            transaction.cashType || null, transaction.isRestricted || false,
            transaction.paymentMethod || 'Cash', transaction.reference || '',
            transaction.customerName || '', transaction.customerMobile || '',
            transaction.billNo || ''
        ];
        
        const result = await query(queryText, params);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                const transactionType = transaction.transactionType;
                if (['Cash Received', 'Cash Paid', 'Cash Transfer'].includes(transactionType)) {
                    await tallyService.syncCashEntry(result[0], true);
                } else if (['Payment Received', 'Payment Made', 'Receipt', 'Payment'].includes(transactionType)) {
                    await tallyService.syncPaymentReceipt(result[0], true);
                }
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PURCHASE VOUCHERS API
// ==========================================

app.get('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { pvNo } = req.query;
        
        let queryText = 'SELECT * FROM purchase_vouchers WHERE 1=1';
        const params = [];
        
        if (pvNo) {
            queryText += ' AND pv_no = $1';
            params.push(pvNo);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const pv = req.body;
        
        const queryText = `INSERT INTO purchase_vouchers (
            pv_no, supplier_name, items, total
        ) VALUES ($1, $2, $3, $4) RETURNING *`;
        
        const params = [
            pv.pvNo, pv.supplierName || '', JSON.stringify(pv.items), pv.total || 0
        ];
        
        const result = await query(queryText, params);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncPurchaseVoucher(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ROL DATA API
// ==========================================

app.get('/api/rol', checkAuth, async (req, res) => {
    try {
        const { barcode, styleCode } = req.query;
        
        let queryText = 'SELECT * FROM rol_data WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (barcode) {
            queryText += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            queryText += ` AND barcode IN (SELECT barcode FROM products WHERE style_code = $${paramCount++})`;
            params.push(styleCode);
        }
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rol', checkAuth, async (req, res) => {
    try {
        const rolData = req.body;
        
        const queryText = `INSERT INTO rol_data (barcode, rol, available)
        VALUES ($1, $2, $3)
        ON CONFLICT (barcode) DO UPDATE SET
            rol = EXCLUDED.rol,
            available = EXCLUDED.available,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`;
        
        const params = [rolData.barcode, rolData.rol || 0, rolData.available || 0];
        
        const result = await query(queryText, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/rol/:barcode', checkAuth, async (req, res) => {
    try {
        const { barcode } = req.params;
        const { rol, available } = req.body;
        
        const queryText = `UPDATE rol_data SET
            rol = $1, available = $2, updated_at = CURRENT_TIMESTAMP
        WHERE barcode = $3 RETURNING *`;
        
        const result = await query(queryText, [rol, available, barcode]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SALES RETURNS API
// ==========================================

app.get('/api/sales-returns', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT * FROM sales_returns ORDER BY date DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sales-returns/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM sales_returns WHERE id = $1', [id]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Sales return not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sales-returns', checkAuth, async (req, res) => {
    try {
        const salesReturn = req.body;
        
        const queryText = `INSERT INTO sales_returns (
            ssr_no, bill_id, bill_no, quotation_id, customer_id, customer_name, customer_mobile,
            items, total, gst, cgst, sgst, net_total, reason, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`;
        
        const params = [
            salesReturn.ssrNo, salesReturn.billId, salesReturn.billNo, salesReturn.quotationId,
            salesReturn.customerId, salesReturn.customerName, salesReturn.customerMobile,
            JSON.stringify(salesReturn.items), salesReturn.total,
            salesReturn.gst || 0, salesReturn.cgst || 0, salesReturn.sgst || 0,
            salesReturn.netTotal, salesReturn.reason || '', salesReturn.remarks || ''
        ];
        
        const result = await query(queryText, params);
        broadcast('sales-return-created', result[0]);
        
        // Add to ledger as negative transaction
        await query(`
            INSERT INTO ledger_transactions (
                customer_id, transaction_type, amount, description, date,
                customer_name, customer_mobile, reference, bill_no
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8)
        `, [
            salesReturn.customerId,
            'Sales Return',
            -Math.abs(salesReturn.netTotal),
            `Sales Return ${salesReturn.ssrNo} - ${salesReturn.reason || 'Product Return'}`,
            salesReturn.customerName,
            salesReturn.customerMobile,
            salesReturn.ssrNo,
            salesReturn.billNo
        ]);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncSalesReturn(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// USER MANAGEMENT API (Whitelist-Based - No Passwords)
// Users authenticate via Google OAuth only
// ==========================================

// Get all whitelisted users
app.get('/api/users', checkRole('admin'), async (req, res) => {
    try {
        const result = await query(`
            SELECT id, email, name, role, allowed_tabs, account_status, created_at, updated_at 
            FROM users 
            ORDER BY created_at DESC
        `);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add user to whitelist (Google OAuth - no password)
app.post('/api/users', checkRole('admin'), async (req, res) => {
    try {
        const { email, name, role, allowedTabs } = req.body;
        
        // Validate email
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const emailLower = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailLower)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Check if user already exists
        const existing = await query('SELECT * FROM users WHERE email = $1', [emailLower]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        
        // Validate role
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        // Insert new whitelisted user (no password - Google OAuth only)
        const result = await query(`
            INSERT INTO users (email, name, role, allowed_tabs, account_status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
            RETURNING id, email, name, role, allowed_tabs, account_status, created_at
        `, [emailLower, name || 'New User', userRole, allowedTabs || ['all']]);
        
        console.log(`✅ User whitelisted: ${emailLower} (Role: ${userRole})`);
        broadcast('user-created', result[0]);
        res.json({ success: true, user: result[0] });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user (role, name, tabs, status)
app.put('/api/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { email, name, role, allowedTabs, accountStatus } = req.body;
        
        // Prevent editing super admin email
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (existingUser[0].email === 'jaigaurav56789@gmail.com' && email && email !== 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot change super admin email' });
        }
        
        // Validate role
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : existingUser[0].role;
        
        const result = await query(`
            UPDATE users SET 
                name = COALESCE($1, name),
                role = $2,
                allowed_tabs = COALESCE($3, allowed_tabs),
                account_status = COALESCE($4, account_status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 
            RETURNING id, email, name, role, allowed_tabs, account_status
        `, [name, userRole, allowedTabs, accountStatus, id]);
        
        broadcast('user-updated', result[0]);
        res.json({ success: true, user: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove user from whitelist
app.delete('/api/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting super admin
        const user = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (user.length > 0 && user[0].email === 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot delete super admin' });
        }
        
        await query('DELETE FROM users WHERE id = $1', [id]);
        console.log(`🗑️ User removed from whitelist: ID ${id}`);
        broadcast('user-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// TALLY INTEGRATION API
// ==========================================

app.get('/api/tally/config', checkAuth, async (req, res) => {
    try {
        const tallyService = new TallySyncService();
        const result = await tallyService.getConfig();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tally/config', checkAuth, async (req, res) => {
    try {
        const config = req.body;
        const tallyService = new TallySyncService();
        const result = await tallyService.updateConfig(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tally/test', checkAuth, async (req, res) => {
    try {
        const tallyService = new TallySyncService();
        const result = await tallyService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tally/sync-logs', checkAuth, async (req, res) => {
    try {
        const { limit = 100, status } = req.query;
        const tallyService = new TallySyncService();
        const logs = await tallyService.getSyncLogs(parseInt(limit), status || null);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// STYLES MASTER API (Enterprise Feature)
// ==========================================

app.get('/api/styles', checkAuth, async (req, res) => {
    try {
        const { search, category, active_only } = req.query;
        let queryText = 'SELECT * FROM styles WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (search) {
            queryText += ` AND (style_code ILIKE $${idx} OR item_name ILIKE $${idx++})`;
            params.push(`%${search}%`);
        }
        if (category) {
            queryText += ` AND category = $${idx++}`;
            params.push(category);
        }
        if (active_only === 'true') {
            queryText += ' AND is_active = true';
        }
        queryText += ' ORDER BY style_code';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/styles/:code', checkAuth, async (req, res) => {
    try {
        const { code } = req.params;
        const result = await query('SELECT * FROM styles WHERE style_code = $1', [code.toUpperCase()]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/styles', checkRole('admin'), async (req, res) => {
    try {
        const { style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description } = req.body;
        
        if (!style_code || !item_name) {
            return res.status(400).json({ error: 'style_code and item_name are required' });
        }
        
        const result = await query(`
            INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [
            style_code.toUpperCase().trim(),
            item_name,
            category || '',
            metal_type || 'gold',
            parseFloat(default_purity) || 91.6,
            default_mc_type || 'PER_GRAM',
            parseFloat(default_mc_value) || 0,
            hsn_code || '7113',
            description || ''
        ]);
        
        broadcast('style-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: 'Style code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/styles/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description, is_active } = req.body;
        
        const result = await query(`
            UPDATE styles SET
                item_name = COALESCE($1, item_name),
                category = COALESCE($2, category),
                metal_type = COALESCE($3, metal_type),
                default_purity = COALESCE($4, default_purity),
                default_mc_type = COALESCE($5, default_mc_type),
                default_mc_value = COALESCE($6, default_mc_value),
                hsn_code = COALESCE($7, hsn_code),
                description = COALESCE($8, description),
                is_active = COALESCE($9, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10 RETURNING *
        `, [item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description, is_active, id]);
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        broadcast('style-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/styles/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('UPDATE styles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get style categories
app.get('/api/styles/meta/categories', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT DISTINCT category FROM styles WHERE category IS NOT NULL AND category != \'\' ORDER BY category');
        res.json(result.map(r => r.category));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// VENDORS MASTER API
// ==========================================

app.get('/api/vendors', checkAuth, async (req, res) => {
    try {
        const { search, active_only } = req.query;
        let queryText = 'SELECT * FROM vendors WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (search) {
            queryText += ` AND (vendor_code ILIKE $${idx} OR name ILIKE $${idx++})`;
            params.push(`%${search}%`);
        }
        if (active_only === 'true') {
            queryText += ' AND is_active = true';
        }
        queryText += ' ORDER BY name';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vendors', checkRole('admin'), async (req, res) => {
    try {
        const { vendor_code, name, contact_person, mobile, email, address, city, state, pincode, gstin } = req.body;
        
        if (!vendor_code || !name) {
            return res.status(400).json({ error: 'vendor_code and name are required' });
        }
        
        const result = await query(`
            INSERT INTO vendors (vendor_code, name, contact_person, mobile, email, address, city, state, pincode, gstin)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `, [vendor_code.toUpperCase(), name, contact_person, mobile, email, address, city, state, pincode, gstin]);
        
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique')) {
            return res.status(409).json({ error: 'Vendor code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PURCHASE VOUCHER API (Stock-In)
// ==========================================

app.get('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { status, vendor_code, from_date, to_date } = req.query;
        let queryText = 'SELECT * FROM purchase_vouchers WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (status) {
            queryText += ` AND status = $${idx++}`;
            params.push(status);
        }
        if (vendor_code) {
            queryText += ` AND vendor_code = $${idx++}`;
            params.push(vendor_code);
        }
        if (from_date) {
            queryText += ` AND DATE(date) >= $${idx++}`;
            params.push(from_date);
        }
        if (to_date) {
            queryText += ` AND DATE(date) <= $${idx++}`;
            params.push(to_date);
        }
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Validate PV rows before saving
app.post('/api/purchase-vouchers/validate', checkAuth, async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows)) {
            return res.status(400).json({ error: 'rows array required' });
        }
        
        // Get current rates
        const ratesResult = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        const rates = ratesResult[0] || { gold: 7500, silver: 156 };
        
        // Get valid style_code + sku_code + purity + mc_type + mc_value (exclude ROOT) - Style Master is source of truth
        const stylesResult = await query(
            'SELECT style_code, sku_code, purity, mc_type, mc_value FROM styles WHERE UPPER(sku_code) != \'ROOT\''
        );
        const styleSkuMap = new Map();
        stylesResult.forEach(s => {
            const ns = (s.style_code || '').trim().toUpperCase();
            const nk = (s.sku_code || '').trim().toUpperCase();
            if (!styleSkuMap.has(ns)) {
                styleSkuMap.set(ns, { exactStyle: s.style_code, skus: new Map() });
            }
            styleSkuMap.get(ns).skus.set(nk, {
                exactSku: s.sku_code,
                purity: s.purity,
                mc_type: s.mc_type,
                mc_value: s.mc_value
            });
        });
        const validStyles = new Set(stylesResult.map(s => (s.style_code || '').toUpperCase()));
        
        // Get existing tags
        const tagsResult = await query('SELECT tag_no FROM products WHERE tag_no IS NOT NULL');
        const existingTags = new Set(tagsResult.map(t => t.tag_no?.toUpperCase()));
        
        const batchTags = new Set();
        
        const validatedRows = rows.map((row, index) => {
            const errors = [];
            let status = 'VALID';
            
            let styleCode = (row.style_code || row.styleCode || '').trim().toUpperCase();
            const skuRaw = (row.sku || row.sku_code || '').trim().toUpperCase();
            let finalStyleCode = styleCode;
            let finalSku = (row.sku || row.sku_code || '').trim();
            let purity = parseFloat(row.purity) || 91.6;
            let mcValue = parseFloat(row.mc_value) || 0;
            let mcType = row.mc_type || 'PER_GRAM';
            const tagNo = (row.tag_no || '').toUpperCase().trim();
            const grossWt = parseFloat(row.gross_wt) || 0;
            const netWt = parseFloat(row.net_wt) || grossWt;
            const cost = parseFloat(row.cost) || 0;
            const metalType = (row.metal_type || 'gold').toLowerCase();
            
            // Style validation
            if (styleCode && !validStyles.has(styleCode)) {
                errors.push(`Style '${styleCode}' not found`);
                status = 'STYLE_NOT_FOUND';
            }
            // SKU validation and auto-correct; OVERRIDE purity/mc from Style Master (ignore Excel columns)
            if (styleCode && skuRaw) {
                const styleEntry = styleSkuMap.get(styleCode);
                if (styleEntry) {
                    const skuEntry = styleEntry.skus.get(skuRaw);
                    if (!skuEntry) {
                        errors.push(`SKU '${skuRaw}' not found under style '${styleEntry.exactStyle}'`);
                        status = 'SKU_NOT_FOUND';
                    } else {
                        finalStyleCode = styleEntry.exactStyle;
                        finalSku = skuEntry.exactSku;
                        purity = parseFloat(skuEntry.purity) || 91.6;
                        mcValue = parseFloat(skuEntry.mc_value) || 0;
                        mcType = skuEntry.mc_type || 'PER_GRAM';
                    }
                }
            }
            
            // Tag duplicate check
            if (tagNo) {
                if (existingTags.has(tagNo)) {
                    errors.push(`Tag '${tagNo}' already exists`);
                    status = 'DUPLICATE_TAG';
                } else if (batchTags.has(tagNo)) {
                    errors.push(`Tag '${tagNo}' duplicated in batch`);
                    status = 'DUPLICATE_TAG';
                }
                batchTags.add(tagNo);
            }
            
            // Weight validation
            if (grossWt <= 0) {
                errors.push('Gross weight must be > 0');
                if (status === 'VALID') status = 'INVALID_DATA';
            }
            if (netWt > grossWt) {
                errors.push('Net weight cannot exceed gross weight');
                if (status === 'VALID') status = 'INVALID_DATA';
            }
            
            // Cost mismatch check
            if (cost > 0 && grossWt > 0) {
                const metalRate = metalType === 'gold' ? rates.gold : rates.silver;
                const metalValue = netWt * metalRate * (purity / 100);
                const mcAmount = mcType === 'FIXED' ? mcValue : (netWt * mcValue);
                const expectedCost = metalValue + mcAmount;
                
                if (cost < expectedCost * 0.8 || cost > expectedCost * 1.3) {
                    errors.push(`Cost mismatch (Expected ~₹${Math.round(expectedCost)})`);
                    if (status === 'VALID') status = 'COST_MISMATCH';
                }
            }
            
            return {
                row_index: index,
                status,
                errors,
                style_found: validStyles.has(styleCode),
                data: { ...row, style_code: finalStyleCode, sku: finalSku, tag_no: tagNo, gross_wt: grossWt, net_wt: netWt, purity, mc_value: mcValue, mc_type: mcType, cost }
            };
        });
        
        res.json({
            valid: validatedRows.filter(r => r.status === 'VALID').length,
            invalid: validatedRows.filter(r => r.status !== 'VALID').length,
            rows: validatedRows,
            rates
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save Purchase Voucher with items
app.post('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, items, total } = req.body;
        
        if (!pv_no || !items || items.length === 0) {
            return res.status(400).json({ error: 'PV number and items required' });
        }
        
        // Fetch valid style_code + sku_code + purity + mc_type + mc_value (exclude ROOT) - Style Master is source of truth
        const stylesResult = await query(
            'SELECT style_code, sku_code, purity, mc_type, mc_value FROM styles WHERE UPPER(sku_code) != \'ROOT\''
        );
        const styleSkuMap = new Map(); // normStyle -> { exactStyle, skus: Map(normSku -> { exactSku, purity, mc_type, mc_value }) }
        stylesResult.forEach(s => {
            const ns = (s.style_code || '').trim().toUpperCase();
            const nk = (s.sku_code || '').trim().toUpperCase();
            if (!styleSkuMap.has(ns)) {
                styleSkuMap.set(ns, { exactStyle: s.style_code, skus: new Map() });
            }
            styleSkuMap.get(ns).skus.set(nk, {
                exactSku: s.sku_code,
                purity: s.purity,
                mc_type: s.mc_type,
                mc_value: s.mc_value
            });
        });
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Calculate totals
            const totalGrossWt = items.reduce((sum, i) => sum + (parseFloat(i.gross_wt) || 0), 0);
            const totalNetWt = items.reduce((sum, i) => sum + (parseFloat(i.net_wt) || 0), 0);
            const totalPcs = items.length;
            
            // Insert PV
            const pvResult = await client.query(`
                INSERT INTO purchase_vouchers (pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, items, total, total_gross_wt, total_net_wt, total_pcs, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed') RETURNING *
            `, [pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, JSON.stringify(items), total || 0, totalGrossWt, totalNetWt, totalPcs]);
            
            const pvId = pvResult.rows[0].id;
            
            // Insert products
            for (const item of items) {
                const tagNo = item.tag_no || `${pv_no}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
                const barcode = item.barcode || tagNo;
                
                const pvAttrs = item.attributes && typeof item.attributes === 'object' ? JSON.stringify(item.attributes) : '{}';

                // Auto-fetch purity & MC from Style Master (ignore Excel values)
                let finalPurity = item.purity || 91.6;
                let finalMcValue = item.mc_value || 0;
                let finalMcType = item.mc_type || 'PER_GRAM';
                
                const rawStyle = (item.style_code || '').trim().toUpperCase();
                const rawSku = (item.sku || item.sku_code || '').trim().toUpperCase();
                const styleEntry = styleSkuMap.get(rawStyle);
                if (styleEntry) {
                    const skuEntry = styleEntry.skus.get(rawSku);
                    if (skuEntry) {
                        // OVERRIDE with Style Master values (absolute source of truth)
                        finalPurity = parseFloat(skuEntry.purity) || 91.6;
                        finalMcValue = parseFloat(skuEntry.mc_value) || 0;
                        finalMcType = skuEntry.mc_type || 'PER_GRAM';
                    }
                }

                await client.query(`
                    INSERT INTO products (barcode, tag_no, style_code, item_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, purchase_cost, vendor_code, pv_id, bin_location, attributes, image_url)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                `, [
                    barcode, tagNo, item.style_code, item.item_code || null,
                    item.item_name || item.style_code, item.item_name || item.style_code,
                    item.metal_type || 'gold', item.gross_wt, item.net_wt || item.gross_wt, item.net_wt || item.gross_wt,
                    finalPurity, item.rate || 0, finalMcValue, finalMcType,
                    item.cost || 0, vendor_code, pvId, item.bin_location || '',
                    pvAttrs, item.image_url || null
                ]);
            }
            
            await client.query('COMMIT');
            
            broadcast('pv-created', pvResult.rows[0]);
            res.json({ success: true, pv: pvResult.rows[0], products_created: items.length });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// TAG SPLIT / MERGE OPERATIONS
// ==========================================

// Split a tag into multiple
app.post('/api/tags/split', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { source_tag, split_into, weights, notes } = req.body;
        
        if (!source_tag || !split_into || split_into < 2) {
            return res.status(400).json({ error: 'source_tag and split_into (min 2) required' });
        }
        
        // Get source product
        const sourceResult = await query('SELECT * FROM products WHERE tag_no = $1 AND tag_status = $2', [source_tag.toUpperCase(), 'active']);
        if (sourceResult.length === 0) {
            return res.status(404).json({ error: 'Source tag not found or not active' });
        }
        
        const source = sourceResult[0];
        const sourceWt = parseFloat(source.net_wt || source.weight);
        
        // Validate weights sum
        let splitWeights = weights;
        if (!Array.isArray(weights) || weights.length !== split_into) {
            // Auto-split equally
            const equalWt = Math.round((sourceWt / split_into) * 1000) / 1000;
            splitWeights = Array(split_into).fill(equalWt);
            splitWeights[split_into - 1] = Math.round((sourceWt - (equalWt * (split_into - 1))) * 1000) / 1000;
        }
        
        const totalSplitWt = splitWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(totalSplitWt - sourceWt) > 0.001) {
            return res.status(400).json({ error: `Split weights (${totalSplitWt}g) must equal source weight (${sourceWt}g)` });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            const newTags = [];
            
            for (let i = 0; i < split_into; i++) {
                const newTag = `${source_tag}-${String.fromCharCode(65 + i)}`;
                const newWt = splitWeights[i];
                
                await client.query(`
                    INSERT INTO products (barcode, tag_no, style_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, floor, split_from_tag, tag_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
                `, [
                    newTag, newTag, source.style_code, source.short_name, source.item_name, source.metal_type,
                    newWt, newWt, newWt, source.purity, source.rate, source.mc_rate, source.mc_type, source.floor, source_tag
                ]);
                
                newTags.push(newTag);
            }
            
            // Deactivate source tag
            await client.query('UPDATE products SET tag_status = $1, updated_at = CURRENT_TIMESTAMP WHERE tag_no = $2', ['split', source_tag.toUpperCase()]);
            
            // Log operation
            await client.query(`
                INSERT INTO tag_operations (operation_type, source_tags, result_tags, source_total_wt, result_total_wt, notes, performed_by)
                VALUES ('SPLIT', $1, $2, $3, $4, $5, $6)
            `, [[source_tag], newTags, sourceWt, totalSplitWt, notes || '', req.user?.email || 'system']);
            
            await client.query('COMMIT');
            
            res.json({ success: true, source_tag, new_tags: newTags, weights: splitWeights });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Merge multiple tags into one
app.post('/api/tags/merge', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { source_tags, new_tag_prefix, notes } = req.body;
        
        if (!Array.isArray(source_tags) || source_tags.length < 2) {
            return res.status(400).json({ error: 'At least 2 source_tags required' });
        }
        
        // Get source products
        const placeholders = source_tags.map((_, i) => `$${i + 1}`).join(',');
        const sourceResult = await query(`SELECT * FROM products WHERE tag_no IN (${placeholders}) AND tag_status = 'active'`, source_tags.map(t => t.toUpperCase()));
        
        if (sourceResult.length !== source_tags.length) {
            return res.status(400).json({ error: 'Some tags not found or not active' });
        }
        
        // Validate same metal type
        const metalTypes = [...new Set(sourceResult.map(p => p.metal_type))];
        if (metalTypes.length > 1) {
            return res.status(400).json({ error: 'Cannot merge different metal types' });
        }
        
        const totalWt = sourceResult.reduce((sum, p) => sum + parseFloat(p.net_wt || p.weight || 0), 0);
        const avgPurity = sourceResult.reduce((sum, p) => sum + parseFloat(p.purity || 0), 0) / sourceResult.length;
        const first = sourceResult[0];
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            const newTag = new_tag_prefix ? `${new_tag_prefix}-MERGED-${Date.now()}` : `MERGED-${Date.now()}`;
            
            // Create merged product
            await client.query(`
                INSERT INTO products (barcode, tag_no, style_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, floor, tag_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')
            `, [
                newTag, newTag, first.style_code, `Merged (${source_tags.length} items)`, `Merged Stock`,
                first.metal_type, totalWt, totalWt, totalWt, avgPurity, first.rate, first.mc_rate, first.mc_type, first.floor
            ]);
            
            // Deactivate source tags
            await client.query(`UPDATE products SET tag_status = 'merged', merged_into_tag = $1, updated_at = CURRENT_TIMESTAMP WHERE tag_no IN (${placeholders})`, [newTag, ...source_tags.map(t => t.toUpperCase())]);
            
            // Log operation
            await client.query(`
                INSERT INTO tag_operations (operation_type, source_tags, result_tags, source_total_wt, result_total_wt, notes, performed_by)
                VALUES ('MERGE', $1, $2, $3, $4, $5, $6)
            `, [source_tags, [newTag], totalWt, totalWt, notes || '', req.user?.email || 'system']);
            
            await client.query('COMMIT');
            
            res.json({ success: true, source_tags, new_tag: newTag, total_weight: totalWt });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tag operations history
app.get('/api/tags/operations', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { limit = 50, type } = req.query;
        let queryText = 'SELECT * FROM tag_operations WHERE 1=1';
        const params = [];
        
        if (type) {
            queryText += ' AND operation_type = $1';
            params.push(type.toUpperCase());
        }
        queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ENTERPRISE REPORTS API
// ==========================================

// ROL Analysis Report
app.get('/api/reports/rol-analysis', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { category, show_all } = req.query;
        
        let queryText = `
            SELECT p.*, s.category, s.item_name as style_name,
                   COALESCE(p.rol_limit, 0) as rol_limit,
                   1 as current_stock,
                   CASE WHEN COALESCE(p.rol_limit, 0) > 1 THEN COALESCE(p.rol_limit, 0) - 1 ELSE 0 END as shortage
            FROM products p
            LEFT JOIN styles s ON p.style_code = s.style_code
            WHERE p.tag_status = 'active' 
              AND p.is_sold = false
              AND COALESCE(p.is_deleted, false) = false
        `;
        const params = [];
        
        if (!show_all) {
            queryText += ' AND COALESCE(p.rol_limit, 0) > 1';
        }
        if (category) {
            queryText += ` AND s.category = $${params.length + 1}`;
            params.push(category);
        }
        
        queryText += ' ORDER BY shortage DESC, s.category, p.style_code';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json({
                summary: {
                    total_styles: 0,
                    total_shortage: 0
                },
                data: []
            });
        }
        
        // Group by style_code for aggregation
        const grouped = {};
        result.forEach(row => {
            const key = row.style_code || 'UNKNOWN';
            if (!grouped[key]) {
                grouped[key] = {
                    style_code: key,
                    style_name: row.style_name || row.short_name,
                    category: row.category || '',
                    current_stock: 0,
                    rol_limit: row.rol_limit,
                    shortage: 0,
                    items: []
                };
            }
            grouped[key].current_stock += 1;
            grouped[key].items.push(row);
        });
        
        // Calculate shortage
        const analysis = Object.values(grouped).map(g => ({
            ...g,
            shortage: Math.max(0, g.rol_limit - g.current_stock)
        })).filter(g => show_all || g.shortage > 0);
        
        res.json({
            summary: {
                total_styles: analysis.length,
                total_shortage: analysis.reduce((sum, a) => sum + a.shortage, 0)
            },
            data: analysis
        });
    } catch (error) {
        console.error('ROL Analysis Report Error:', error);
        // Return empty result instead of 500 error
        res.json({
            summary: {
                total_styles: 0,
                total_shortage: 0
            },
            data: []
        });
    }
});

// GST Tax Report
app.get('/api/reports/gst', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { from_date, to_date, gst_rate } = req.query;
        
        let queryText = `
            SELECT 
                bill_no, 
                DATE(date) as bill_date,
                customer_name,
                COALESCE(taxable_value, total) as taxable_value,
                COALESCE(cgst, ROUND(COALESCE(taxable_value, total) * 0.015, 2)) as cgst_amount,
                COALESCE(sgst, ROUND(COALESCE(taxable_value, total) * 0.015, 2)) as sgst_amount,
                COALESCE(gst, ROUND(COALESCE(taxable_value, total) * 0.03, 2)) as total_tax,
                net_total as total_amount,
                gst_rate
            FROM bills 
            WHERE COALESCE(is_deleted, false) = false
        `;
        const params = [];
        let idx = 1;
        
        if (from_date) {
            queryText += ` AND DATE(date) >= $${idx++}`;
            params.push(from_date);
        }
        if (to_date) {
            queryText += ` AND DATE(date) <= $${idx++}`;
            params.push(to_date);
        }
        if (gst_rate) {
            queryText += ` AND gst_rate = $${idx++}`;
            params.push(gst_rate);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json({
                bills: [],
                totals: {
                    taxable_value: 0,
                    cgst_amount: 0,
                    sgst_amount: 0,
                    total_tax: 0,
                    total_amount: 0
                },
                count: 0
            });
        }
        
        // Calculate totals
        const totals = {
            taxable_value: 0,
            cgst_amount: 0,
            sgst_amount: 0,
            total_tax: 0,
            total_amount: 0
        };
        
        result.forEach(row => {
            totals.taxable_value += parseFloat(row.taxable_value) || 0;
            totals.cgst_amount += parseFloat(row.cgst_amount) || 0;
            totals.sgst_amount += parseFloat(row.sgst_amount) || 0;
            totals.total_tax += parseFloat(row.total_tax) || 0;
            totals.total_amount += parseFloat(row.total_amount) || 0;
        });
        
        res.json({
            bills: result,
            totals: {
                taxable_value: Math.round(totals.taxable_value * 100) / 100,
                cgst_amount: Math.round(totals.cgst_amount * 100) / 100,
                sgst_amount: Math.round(totals.sgst_amount * 100) / 100,
                total_tax: Math.round(totals.total_tax * 100) / 100,
                total_amount: Math.round(totals.total_amount * 100) / 100
            },
            count: result.length
        });
    } catch (error) {
        console.error('GST Report Error:', error);
        // Return empty result instead of 500 error
        res.json({
            bills: [],
            totals: {
                taxable_value: 0,
                cgst_amount: 0,
                sgst_amount: 0,
                total_tax: 0,
                total_amount: 0
            },
            count: 0
        });
    }
});

// Stock Summary Report
app.get('/api/reports/stock-summary', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { category, metal_type } = req.query;
        
        let queryText = `
            SELECT 
                COALESCE(s.category, 'Uncategorized') as category,
                p.metal_type,
                COUNT(*) as total_items,
                SUM(COALESCE(p.net_wt, p.weight, 0)) as total_weight,
                SUM(COALESCE(p.purchase_cost, 0)) as total_cost,
                AVG(COALESCE(p.purity, 91.6)) as avg_purity
            FROM products p
            LEFT JOIN styles s ON p.style_code = s.style_code
            WHERE p.tag_status = 'active' 
              AND p.is_sold = false
              AND COALESCE(p.is_deleted, false) = false
        `;
        const params = [];
        let idx = 1;
        
        if (category) {
            queryText += ` AND s.category = $${idx++}`;
            params.push(category);
        }
        if (metal_type) {
            queryText += ` AND p.metal_type = $${idx++}`;
            params.push(metal_type);
        }
        
        queryText += ' GROUP BY COALESCE(s.category, \'Uncategorized\'), p.metal_type ORDER BY category, metal_type';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json([]);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Stock Summary Report Error:', error);
        // Return empty result instead of 500 error
        res.json([]);
    }
});

// ==========================================
// LABEL PRINTING API
// ==========================================

const labelPrinter = require('./scripts/label-printer');

app.post('/api/print/label', async (req, res) => {
    try {
        const { itemData, printerConfig } = req.body;
        
        if (!itemData) {
            return res.status(400).json({ error: 'itemData is required' });
        }
        
        if (!printerConfig) {
            return res.status(400).json({ error: 'printerConfig is required' });
        }
        
        if (!printerConfig.type || !printerConfig.address) {
            return res.status(400).json({ error: 'printerConfig must have type and address' });
        }
        
        const success = await labelPrinter.printLabel(itemData, printerConfig);
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Label printed successfully',
                tspl: labelPrinter.generateTSPLLabel(itemData)
            });
        } else {
            res.status(500).json({ error: 'Failed to print label' });
        }
    } catch (error) {
        console.error('Label printing error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/print/label/tspl', async (req, res) => {
    try {
        const { itemData } = req.body;
        
        if (!itemData) {
            return res.status(400).json({ error: 'itemData is required' });
        }
        
        const tspl = labelPrinter.generateTSPLLabel(itemData);
        res.json({ tspl, itemData });
    } catch (error) {
        console.error('TSPL generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BACKWARD COMPATIBLE ROUTES (for existing frontend)
// These routes accept :tenant param but ignore it
// ==========================================

// Redirect old tenant routes to new routes
const oldRoutes = [
    'products', 'customers', 'quotations', 'bills', 'rates',
    'ledger/transactions', 'purchase-vouchers', 'rol', 'sales-returns',
    'users', 'tally/config', 'tally/test', 'tally/sync-logs'
];

oldRoutes.forEach(route => {
    // GET with tenant prefix
    app.get(`/api/:tenant/${route}`, (req, res, next) => {
        req.url = `/api/${route}`;
        next('route');
    });
    
    // POST with tenant prefix
    app.post(`/api/:tenant/${route}`, (req, res, next) => {
        req.url = `/api/${route}`;
        next('route');
    });
});

// Also handle individual resource routes
// IMPORTANT: products/bulk-update must be before products/:id to prevent "bulk-update" being parsed as id
app.post('/api/:tenant/products/bulk-update', checkAuth, hasPermission('products'), bulkUpdateMcHandler);
app.get('/api/:tenant/products/:id', (req, res) => res.redirect(`/api/products/${req.params.id}`));
app.put('/api/:tenant/products/:id', checkAuth, async (req, res) => {
    req.params.tenant = undefined;
    // Forward to main route handler
    const { id } = req.params;
    const product = req.body;
    try {
        const queryText = `UPDATE products SET
            barcode = $1, sku = $2, style_code = $3, short_name = $4, item_name = $5,
            metal_type = $6, size = $7, weight = $8, purity = $9, rate = $10,
            mc_rate = $11, mc_type = $12, pcs = $13, box_charges = $14, stone_charges = $15,
            floor = $16, avg_wt = $17, updated_at = CURRENT_TIMESTAMP
        WHERE id = $18 RETURNING *`;
        const params = [
            product.barcode, product.sku, product.styleCode, product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight, id
        ];
        const result = await query(queryText, params);
        broadcast('product-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/:tenant/products/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM products WHERE id = $1', [id]);
        broadcast('product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/:tenant/bills/by-number/:billNo', checkAuth, async (req, res) => {
    try {
        const { billNo } = req.params;
        const result = await query('SELECT * FROM bills WHERE bill_no = $1', [billNo]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SOCKET.IO FOR REAL-TIME SYNC
// ==========================================

const connectedClients = new Set();

io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    connectedClients.add(socket.id);
    
    socket.on('join-tenant', (tenantCode) => {
        // In single-tenant mode, all clients join the same room
        socket.join('main');
        console.log(`📱 Client ${socket.id} joined main room`);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });
    
    socket.on('barcode-print-request', (data) => {
        const { barcode, product } = data;
        socket.to('main').emit('barcode-printed', { barcode, product });
        console.log(`📡 Barcode print sync: ${barcode}`);
    });
});

function broadcast(event, data) {
    io.to('main').emit(event, data);
    console.log(`📡 Broadcasted ${event}`);
}

global.broadcast = broadcast;

// ==========================================
// FLOORS API
// ==========================================

app.get('/api/floors', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        // Ensure floors table exists first
        await query(`
            CREATE TABLE IF NOT EXISTS floors (
                id SERIAL PRIMARY KEY,
                floor_name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Add updated_at column if it doesn't exist (for existing tables)
        await query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'floors' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE floors ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                    RAISE NOTICE 'Added updated_at column to floors table';
                END IF;
            END $$;
        `);
        
        // Insert default floor if it doesn't exist
        await query(`
            INSERT INTO floors (floor_name, description) 
            VALUES ('estimation floor', 'Default floor for products')
            ON CONFLICT (floor_name) DO NOTHING
        `);
        
        // Get all floors with dynamic product count calculation
        // Only select columns that exist, handle updated_at gracefully
        const result = await query(`
            SELECT 
                f.id,
                f.floor_name,
                f.description,
                f.created_at,
                COALESCE(COUNT(p.id), 0) as product_count
            FROM floors f
            LEFT JOIN products p ON p.floor = f.floor_name AND (p.is_deleted IS NULL OR p.is_deleted = false) AND (p.status IS NULL OR p.status != 'deleted')
            GROUP BY f.id, f.floor_name, f.description, f.created_at
            ORDER BY f.floor_name
        `);
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching floors:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/floors', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { floor_name, description } = req.body;
        
        if (!floor_name || !floor_name.trim()) {
            return res.status(400).json({ error: 'Floor name is required' });
        }
        
        // Ensure floors table exists
        await query(`
            CREATE TABLE IF NOT EXISTS floors (
                id SERIAL PRIMARY KEY,
                floor_name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const result = await query(
            'INSERT INTO floors (floor_name, description) VALUES ($1, $2) RETURNING *',
            [floor_name.trim(), description || null]
        );
        
        broadcast('floor-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            res.status(409).json({ error: `Floor "${req.body.floor_name}" already exists` });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.delete('/api/floors/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get floor details first
        const floorResult = await query('SELECT * FROM floors WHERE id = $1', [id]);
        
        if (floorResult.length === 0) {
            return res.status(404).json({ error: 'Floor not found' });
        }
        
        const floorName = floorResult[0].floor_name;
        
        // Prevent deletion of default floor
        if (floorName.toLowerCase() === 'estimation floor') {
            return res.status(400).json({ error: 'Cannot delete estimation floor' });
        }
        
        // Move all products from this floor to estimation floor
        await query(`
            UPDATE products 
            SET floor = 'estimation floor' 
            WHERE floor = $1
        `, [floorName]);
        
        // Delete the floor
        await query('DELETE FROM floors WHERE id = $1', [id]);
        
        broadcast('floor-deleted', { id: parseInt(id), floor_name: floorName });
        res.json({ success: true, message: `Floor "${floorName}" deleted. Products moved to estimation floor.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ERROR HANDLING
// ==========================================

// ==========================================
// KC JEWELLERS WEBSITE SYNC ROUTES
// ==========================================

// GET /api/sync/pending — Returns un-synced products that have a local image
app.get('/api/sync/pending', checkAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.barcode, p.item_name, p.weight, p.avg_wt,
                p.purity, p.metal_type, p.style_code, p.sku,
                p.is_web_synced
            FROM products p
            WHERE (p.is_deleted = false OR p.is_deleted IS NULL)
              AND (p.status = 'available' OR p.status IS NULL)
              AND (p.is_web_synced = false OR p.is_web_synced IS NULL)
            ORDER BY p.style_code, p.sku, p.barcode
        `);

        // Filter to only products that have a local image on disk
        // Use resolveProductImage to support cascade (product → item → style) and any extension
        const productsWithImages = [];
        for (const p of result.rows) {
            const imageUrl = await resolveProductImage(p.barcode);
            let imgPath = null;
            if (imageUrl) {
                imgPath = path.join(__dirname, 'public', imageUrl.replace(/^\//, ''));
            }
            if (!imgPath || !fs.existsSync(imgPath)) {
                imgPath = path.join(__dirname, 'public', 'uploads', 'products', `${p.barcode}.jpg`);
            }
            if (fs.existsSync(imgPath)) {
                productsWithImages.push(p);
            }
        }

        // Group into hierarchy: styleCode -> sku -> [products]
        const hierarchy = {};
        for (const p of productsWithImages) {
            const style = p.style_code || 'UNKNOWN';
            const sku   = p.sku        || 'UNKNOWN';
            if (!hierarchy[style]) hierarchy[style] = {};
            if (!hierarchy[style][sku]) hierarchy[style][sku] = [];
            hierarchy[style][sku].push({
                barcode:     p.barcode,
                name:        p.item_name,
                netWeight:   p.weight,        // DB col: weight  → API key: netWeight
                grossWeight: p.avg_wt,        // DB col: avg_wt  → API key: grossWeight
                purity:      p.purity,
                metalType:   p.metal_type
            });
        }

        res.json({ success: true, hierarchy, totalCount: productsWithImages.length });
    } catch (error) {
        console.error('GET /api/sync/pending error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/sync/execute — Syncs selected barcodes to KC Jewellers website
app.post('/api/sync/execute', checkAuth, async (req, res) => {
    const { barcodes } = req.body;
    if (!Array.isArray(barcodes) || barcodes.length === 0) {
        return res.status(400).json({ success: false, error: 'No barcodes provided.' });
    }

    try {
        // Fetch full product details for the requested barcodes
        const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(
            `SELECT barcode, item_name, weight, avg_wt, purity, metal_type, style_code, sku, mc_rate
             FROM products
             WHERE barcode IN (${placeholders})
               AND (is_deleted = false OR is_deleted IS NULL)`,
            barcodes
        );

        // Build payload — compress with sharp, keep raw buffers for multipart/form-data
        const products = [];
        const MAX_IMAGE_WIDTH = 1200;   // web-optimized; sharp preserves aspect ratio
        const JPEG_QUALITY = 85;

        for (const p of result.rows) {
            let imageUrl = await resolveProductImage(p.barcode);
            let imgPath = imageUrl
                ? path.join(__dirname, 'public', imageUrl.replace(/^\//, ''))
                : path.join(__dirname, 'public', 'uploads', 'products', `${p.barcode}.jpg`);
            if (!fs.existsSync(imgPath)) {
                imgPath = path.join(__dirname, 'public', 'uploads', 'products', `${p.barcode}.jpg`);
            }
            if (!fs.existsSync(imgPath)) {
                console.warn(`KC Sync: no image for barcode ${p.barcode}, skipping.`);
                continue;
            }

            let compressedBuffer;
            try {
                compressedBuffer = await sharp(imgPath)
                    .trim()  // crop out plain white/transparent borders
                    .resize(MAX_IMAGE_WIDTH, null, { withoutEnlargement: true })  // shrink only, no upscale
                    .webp({ quality: 80 })
                    .toBuffer();
                console.log(`KC Sync: ${p.barcode} compressed ${fs.statSync(imgPath).size} → ${compressedBuffer.length} bytes`);
            } catch (sharpErr) {
                console.warn(`KC Sync: sharp failed for ${p.barcode}, skipping:`, sharpErr.message);
                continue;
            }

            const productInfo = {
                styleCode:   p.style_code          || '',
                sku:         p.sku                 || '',
                barcode:     p.barcode,
                name:        p.item_name           || '',
                netWeight:   parseFloat(p.weight)  || 0,
                grossWeight: parseFloat(p.avg_wt)   || 0,
                purity:      p.purity              || '',
                metalType:   p.metal_type         || '',
                mcRate:      parseFloat(p.mc_rate) || 0
            };
            products.push({ productInfo, compressedBuffer, barcode: p.barcode });
        }

        if (products.length === 0) {
            return res.status(400).json({ success: false, error: 'No products with valid images found.' });
        }

        // Chunk into batches of 10 — compressed images are smaller; axios handles large payloads
        const CHUNK_SIZE = 10;
        const chunks = [];
        for (let i = 0; i < products.length; i += CHUNK_SIZE) {
            chunks.push(products.slice(i, i + CHUNK_SIZE));
        }

        const KC_API_KEY  = process.env.KC_API_KEY  || 'PASTE_YOUR_API_KEY_HERE';
        const KC_SYNC_URL = process.env.KC_SYNC_URL || 'https://api.kc.gauravsoftwares.tech/api/sync/receive';

        const syncedBarcodes = [];

        for (let ci = 0; ci < chunks.length; ci++) {
            const chunk = chunks[ci];
            const chunkProducts = chunk.map(({ productInfo }) => productInfo);
            const form = new FormData();

            form.append('payload', JSON.stringify(chunkProducts));

            for (const { compressedBuffer, barcode } of chunk) {
                form.append('images', compressedBuffer, { filename: `${barcode}.webp` });
            }

            const payloadSize = Buffer.byteLength(JSON.stringify(chunkProducts), 'utf8');
            const totalImages = chunk.length;
            console.log(`KC Sync: sending chunk ${ci + 1}/${chunks.length} — ${chunk.length} product(s), payload ${payloadSize} bytes, ${totalImages} image(s)`);

            let response;
            try {
                response = await axios.post(KC_SYNC_URL, form, {
                    headers: {
                        ...form.getHeaders(),
                        'x-api-key': KC_API_KEY
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    timeout: 60000
                });
            } catch (netErr) {
                const msg = netErr.response ? `${netErr.response.status}: ${JSON.stringify(netErr.response.data)}` : netErr.message;
                throw new Error(`Could not reach KC Jewellers server: ${msg}`);
            }

            if (response.status >= 200 && response.status < 300) {
                chunk.forEach(({ barcode }) => syncedBarcodes.push(barcode));
                console.log(`KC Sync: chunk ${ci + 1} accepted — ${chunk.map(({ barcode }) => barcode).join(', ')}`);
            } else {
                throw new Error(`KC server returned ${response.status}: ${JSON.stringify(response.data)}`);
            }
        }

        // Mark successfully synced barcodes
        if (syncedBarcodes.length > 0) {
            const syncPlaceholders = syncedBarcodes.map((_, i) => `$${i + 1}`).join(',');
            await pool.query(
                `UPDATE products SET is_web_synced = true WHERE barcode IN (${syncPlaceholders})`,
                syncedBarcodes
            );
        }

        res.json({
            success: true,
            syncedCount: syncedBarcodes.length,
            message:     `Successfully pushed ${syncedBarcodes.length} product(s) to KC Jewellers website.`
        });
    } catch (error) {
        console.error('POST /api/sync/execute error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.use((err, req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.error('API Error:', err);
        res.status(err.status || 500).json({ 
            error: err.message || 'Internal server error',
            success: false 
        });
    } else {
        next(err);
    }
});

// Catch-all route (MUST BE LAST)
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found', success: false });
    }
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ==========================================
// START SERVER
// ==========================================

const DOMAIN = process.env.DOMAIN || 'localhost';
const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? `${PROTOCOL}://${DOMAIN}` 
  : `http://localhost:${PORT}`;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 URL: ${BASE_URL}`);
    console.log(`📊 API available at ${BASE_URL}/api`);
    console.log(`🔄 Self-Update API: ${BASE_URL}/api/update-software`);
    console.log(`🔌 Real-time sync enabled (Socket.IO)`);
    if (process.env.NODE_ENV === 'production') {
        console.log(`☁️ Production mode active`);
    }
});
