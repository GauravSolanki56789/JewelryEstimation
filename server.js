require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const session = require('express-session');
const passport = require('./config/passport');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const { 
    pool, 
    initDatabase, 
    query,
    getPool
} = require('./config/database');
const { checkRole, checkAuth } = require('./middleware/rbac');
const TallyIntegration = require('./config/tally-integration');
const TallySyncService = require('./config/tally-sync-service');

const app = express();
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
app.use(session({
    secret: process.env.SESSION_SECRET || 'jewelry_estimation_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));
app.use(passport.initialize());
app.use(passport.session());

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
// GOOGLE OAUTH ROUTES
// ==========================================

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/?error=login_failed' }),
    (req, res) => {
        if (req.user.account_status === 'pending') {
            res.redirect('/complete-profile.html');
        } else if (req.user.account_status === 'active') {
            res.redirect('/');
        } else {
            req.logout((err) => {
                if (err) { console.error('Logout error:', err); }
                res.redirect('/?error=account_suspended');
            });
        }
    }
);

app.get('/api/auth/current_user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            isAuthenticated: true, 
            user: req.user 
        });
    } else {
        res.json({ isAuthenticated: false });
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

app.get('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return res.status(500).json({ error: 'Logout failed' }); }
        res.redirect('/');
    });
});

app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return res.status(500).json({ error: 'Logout failed' }); }
        res.json({ success: true });
    });
});

// Static files
app.use(express.static('public'));

// Initialize database on startup
initDatabase().then(success => {
    if (success) {
        console.log('✅ Database ready');
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
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    // Execute the shell script
    exec('bash update.sh', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Update error: ${error}`);
            return res.status(500).json({ success: false, message: 'Update failed', error: error.message });
        }
        console.log(`✅ Update Output: ${stdout}`);
        if (stderr) console.log(`Update Stderr: ${stderr}`);
        res.json({ success: true, message: 'Server updated & restarted successfully!' });
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
// ==========================================

app.get('/api/products', checkAuth, async (req, res) => {
    try {
        const { barcode, styleCode, search } = req.query;
        
        let queryText = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (barcode) {
            queryText += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            queryText += ` AND style_code = $${paramCount++}`;
            params.push(styleCode);
        }
        if (search) {
            queryText += ` AND (short_name ILIKE $${paramCount} OR item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY created_at DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', checkAuth, async (req, res) => {
    const product = req.body;
    
    try {
        if (product.barcode) {
            const existingCheck = await query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
            if (existingCheck.length > 0) {
                return res.status(409).json({ error: `Barcode ${product.barcode} already exists` });
            }
        }
        
        const queryText = `INSERT INTO products (
            barcode, sku, style_code, short_name, item_name, metal_type, size, weight,
            purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`;
        
        const params = [
            product.barcode, product.sku, product.styleCode, product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight
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

app.put('/api/products/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const product = req.body;
        
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

app.post('/api/products/bulk', checkAuth, async (req, res) => {
    try {
        const { products: productsArray } = req.body;
        
        if (!Array.isArray(productsArray) || productsArray.length === 0) {
            return res.status(400).json({ error: 'Products array is required' });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            
            const insertedProducts = [];
            const errors = [];
            
            const insertQuery = `INSERT INTO products (
                barcode, sku, style_code, short_name, item_name, metal_type, size, weight,
                purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`;
            
            for (const product of productsArray) {
                try {
                    const existingCheck = await client.query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
                    
                    if (existingCheck.rows.length > 0) {
                        errors.push({ barcode: product.barcode, error: 'Barcode already exists' });
                        continue;
                    }
                    
                    const params = [
                        product.barcode, product.sku || '', product.styleCode || '', 
                        product.shortName, product.itemName || product.shortName,
                        product.metalType || 'gold', product.size || '', 
                        product.weight || 0, product.purity || 100, 
                        product.rate || 0, product.mcRate || 0,
                        product.mcType || 'MC/GM', product.pcs || 1, 
                        product.boxCharges || 0, product.stoneCharges || 0,
                        product.floor || 'Main Floor', product.avgWt || product.weight || 0
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

app.delete('/api/products/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM products WHERE id = $1', [id]);
        broadcast('product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CUSTOMERS API
// ==========================================

app.get('/api/customers', checkAuth, async (req, res) => {
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

app.post('/api/customers', checkAuth, async (req, res) => {
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

app.put('/api/customers/:id', checkAuth, async (req, res) => {
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

app.delete('/api/customers/:id', checkAuth, async (req, res) => {
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

app.get('/api/quotations', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT * FROM quotations ORDER BY date DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quotations', checkAuth, async (req, res) => {
    try {
        const quotation = req.body;
        
        const queryText = `INSERT INTO quotations (
            quotation_no, customer_id, customer_name, customer_mobile, items, total, gst, net_total,
            discount, advance, final_amount, payment_status, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`;
        
        const params = [
            quotation.quotationNo, quotation.customerId, quotation.customerName,
            quotation.customerMobile, JSON.stringify(quotation.items), quotation.total,
            quotation.gst, quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks
        ];
        
        const result = await query(queryText, params);
        broadcast('quotation-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/quotations/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const quotation = req.body;
        
        const queryText = `UPDATE quotations SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, net_total = $7, discount = $8, advance = $9,
            final_amount = $10, payment_status = $11, remarks = $12
        WHERE id = $13 RETURNING *`;
        
        const params = [
            quotation.customerId, quotation.customerName, quotation.customerMobile,
            JSON.stringify(quotation.items), quotation.total, quotation.gst,
            quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks, id
        ];
        
        const result = await query(queryText, params);
        broadcast('quotation-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/quotations/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM quotations WHERE id = $1', [id]);
        broadcast('quotation-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BILLS API
// ==========================================

app.get('/api/bills', checkAuth, async (req, res) => {
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

app.get('/api/bills/by-number/:billNo', checkAuth, async (req, res) => {
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

app.post('/api/bills', checkAuth, async (req, res) => {
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

app.put('/api/bills/:id', checkAuth, async (req, res) => {
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

app.delete('/api/bills/:id', checkAuth, async (req, res) => {
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
// ADMIN PANEL API
// ==========================================

// Get all users (for admin panel)
app.get('/api/admin/users', checkRole('admin'), async (req, res) => {
    try {
        const result = await query('SELECT id, google_id, email, name, role, allowed_tabs, account_status, phone_number, created_at FROM users ORDER BY created_at DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
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

// ==========================================
// LEDGER TRANSACTIONS API
// ==========================================

app.get('/api/ledger/transactions', checkAuth, async (req, res) => {
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

app.post('/api/ledger/transactions', checkAuth, async (req, res) => {
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
// USER MANAGEMENT API
// ==========================================

app.get('/api/users', checkRole('admin'), async (req, res) => {
    try {
        const result = await query('SELECT id, username, email, name, role, allowed_tabs, account_status, created_at FROM users ORDER BY created_at DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', checkRole('admin'), async (req, res) => {
    try {
        const { username, email, password, name, role, allowedTabs } = req.body;
        
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        if (!password || password.trim() === '') {
            return res.status(400).json({ error: 'Password is required' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const queryText = `INSERT INTO users (username, email, password, name, role, allowed_tabs, account_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id, username, email, name, role, allowed_tabs, created_at`;
        
        const params = [username, email || `${username}@local.user`, hashedPassword, name || username, userRole, allowedTabs || ['all']];
        
        const result = await query(queryText, params);
        broadcast('user-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, name, role, allowedTabs, accountStatus } = req.body;
        
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        let queryText = 'UPDATE users SET username = $1, email = $2, name = $3, role = $4, allowed_tabs = $5, account_status = $6';
        const params = [username, email, name, userRole, allowedTabs || ['all'], accountStatus || 'active'];
        
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            queryText += ', password = $7 WHERE id = $8 RETURNING id, username, email, name, role, allowed_tabs';
            params.push(hashedPassword, id);
        } else {
            queryText += ' WHERE id = $7 RETURNING id, username, email, name, role, allowed_tabs';
            params.push(id);
        }
        
        const result = await query(queryText, params);
        broadcast('user-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', checkRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM users WHERE id = $1', [id]);
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
// ERROR HANDLING
// ==========================================

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
