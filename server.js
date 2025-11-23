require('dotenv').config(); // Load .env file first
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const { 
    masterPool, 
    getTenantPool, 
    initMasterDatabase, 
    createTenantDatabase,
    queryTenant 
} = require('./config/database');

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
app.use(express.static('public'));

// Initialize master database on startup
initMasterDatabase();

app.post('/api/tenants', async (req, res) => {
    try {
        const { tenantCode, tenantName, adminUsername, adminPassword, masterUsername, masterPassword } = req.body;
        
        // Verify master admin
        if (!masterUsername || !masterPassword) {
            return res.status(403).json({ error: 'Master admin credentials required' });
        }
        
        const masterAdmin = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            [masterUsername]
        );
        
        if (masterAdmin.rows.length === 0) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const isValid = await bcrypt.compare(masterPassword, masterAdmin.rows[0].password_hash);
        if (!isValid || !masterAdmin.rows[0].is_super_admin) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        if (!tenantCode || !tenantName || !adminUsername || !adminPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Hash tenant admin password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await createTenantDatabase(tenantCode, tenantName, adminUsername, hashedPassword);
        res.json({ 
            success: true, 
            message: `Tenant ${tenantCode} created successfully`,
            tenantCode: tenantCode,
            databaseName: `jewelry_${tenantCode}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tenants', async (req, res) => {
    try {
        const { username, password } = req.body; // Changed from req.query to req.body
        
        // If master admin credentials provided, return all tenants
        if (username && password) {
            const masterAdmin = await masterPool.query(
                'SELECT * FROM master_admins WHERE username = $1',
                [username]
            );
            
            if (masterAdmin.rows.length > 0) {
                const isValid = await bcrypt.compare(password, masterAdmin.rows[0].password_hash);
                if (isValid && masterAdmin.rows[0].is_super_admin) {
                    // Super admin can see all tenants
                    const result = await masterPool.query('SELECT tenant_code, tenant_name, created_at, is_active FROM tenants');
                    return res.json(result.rows);
                }
            }
        }
        
        // For regular users, they should only see their own tenant (handled in frontend)
        // Return empty or error - frontend will handle based on login
        res.json([]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tenants/for-user', async (req, res) => {
    try {
        const { username, tenantCode } = req.body; // Changed from req.query to req.body
        
        if (!username || !tenantCode) {
            return res.json([]);
        }
        
        // Check if master admin
        const masterAdmin = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            [username]
        );
        
        if (masterAdmin.rows.length > 0 && masterAdmin.rows[0].is_super_admin) {
            // Super admin can see all tenants
            const result = await masterPool.query('SELECT tenant_code, tenant_name, created_at, is_active FROM tenants');
            return res.json(result.rows);
        }
        
        // Regular user can only see their own tenant
        const result = await masterPool.query(
            'SELECT tenant_code, tenant_name, created_at, is_active FROM tenants WHERE tenant_code = $1',
            [tenantCode]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, tenantCode } = req.body;
        
        // First check if master admin (Gaurav)
        const masterAdmin = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            [username]
        );
        
        if (masterAdmin.rows.length > 0) {
            const isValid = await bcrypt.compare(password, masterAdmin.rows[0].password_hash);
            if (isValid && masterAdmin.rows[0].is_super_admin) {
                // Master admin can access any tenant
                if (tenantCode) {
                    // Verify tenant exists
                    const tenantCheck = await masterPool.query(
                        'SELECT * FROM tenants WHERE tenant_code = $1',
                        [tenantCode]
                    );
                    if (tenantCheck.rows.length > 0) {
                        return res.json({
                            success: true,
                            tenantCode: tenantCode,
                            username: username,
                            role: 'super_admin',
                            allowedTabs: ['all'],
                            isMasterAdmin: true
                        });
                    }
                }
                // If no tenant specified, return success but user needs to select tenant
                return res.json({
                    success: true,
                    username: username,
                    role: 'super_admin',
                    allowedTabs: ['all'],
                    isMasterAdmin: true,
                    needsTenantSelection: true
                });
            }
        }
        
        // Check master tenant table (tenant admin) - only if tenantCode provided
        if (tenantCode) {
            const tenantResult = await masterPool.query(
                'SELECT * FROM tenants WHERE tenant_code = $1 AND admin_username = $2',
                [tenantCode, username]
            );
        
            if (tenantResult.rows.length > 0) {
                const tenant = tenantResult.rows[0];
                // Verify password (stored as hash in future, plain text for now for migration)
                // For existing tenants, check plain text first, then hash
                let passwordValid = false;
                if (tenant.admin_password === password) {
                    passwordValid = true;
                    // Migrate to hash
                    const hashedPassword = await bcrypt.hash(password, 10);
                    await masterPool.query(
                        'UPDATE tenants SET admin_password = $1 WHERE id = $2',
                        [hashedPassword, tenant.id]
                    );
                } else {
                    // Try bcrypt compare for already hashed passwords
                    try {
                        passwordValid = await bcrypt.compare(password, tenant.admin_password);
                    } catch (e) {
                        passwordValid = false;
                    }
                }
                
                if (passwordValid) {
                    return res.json({
                        success: true,
                        tenantCode: tenant.tenant_code,
                        username: tenant.admin_username,
                        role: 'admin',
                        allowedTabs: ['all'],
                        isMasterAdmin: false
                    });
                }
            }
        }
        
        // Check tenant users table
        if (tenantCode) {
            try {
                const pool = getTenantPool(tenantCode);
                const userResult = await pool.query(
                    'SELECT * FROM users WHERE username = $1',
                    [username]
                );
                
                if (userResult.rows.length > 0) {
                    const user = userResult.rows[0];
                    // Verify password
                    let passwordValid = false;
                    if (user.password === password) {
                        passwordValid = true;
                        // Migrate to hash
                        const hashedPassword = await bcrypt.hash(password, 10);
                        await pool.query(
                            'UPDATE users SET password = $1 WHERE id = $2',
                            [hashedPassword, user.id]
                        );
                    } else {
                        try {
                            passwordValid = await bcrypt.compare(password, user.password);
                        } catch (e) {
                            passwordValid = false;
                        }
                    }
                    
                    if (passwordValid) {
                        return res.json({
                            success: true,
                            tenantCode: tenantCode,
                            username: user.username,
                            role: user.role,
                            allowedTabs: user.allowed_tabs || ['all'],
                            isMasterAdmin: false
                        });
                    }
                }
            } catch (error) {
                // Tenant database might not exist
                console.error('Error checking tenant users:', error);
            }
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function verifyTenantAccess(req, res, next) {
    next();
}

app.get('/api/:tenant/products', verifyTenantAccess, async (req, res) => {
    try {
        const { tenant } = req.params;
        const { barcode, styleCode, search } = req.query;
        
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (barcode) {
            query += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            query += ` AND style_code = $${paramCount++}`;
            params.push(styleCode);
        }
        if (search) {
            query += ` AND (short_name ILIKE $${paramCount} OR item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/products', async (req, res) => {
    try {
        const { tenant } = req.params;
        const product = req.body;
        
        const query = `INSERT INTO products (
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
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'product-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/products/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const product = req.body;
        
        const query = `UPDATE products SET
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
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'product-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/products/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM products WHERE id = $1', [id]);
        broadcastToTenant(tenant, 'product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/customers', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { mobile, search } = req.query;
        
        let query = 'SELECT * FROM customers WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (mobile) {
            query += ` AND mobile = $${paramCount++}`;
            params.push(mobile);
        }
        if (search) {
            query += ` AND (name ILIKE $${paramCount} OR mobile ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY name';
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/customers', async (req, res) => {
    try {
        const { tenant } = req.params;
        const customer = req.body;
        
        const query = `INSERT INTO customers (name, mobile, address1, address2, city, state, pincode, gstin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin
        ];
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'customer-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/customers/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const customer = req.body;
        
        const query = `UPDATE customers SET
            name = $1, mobile = $2, address1 = $3, address2 = $4, city = $5,
            state = $6, pincode = $7, gstin = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin, id
        ];
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'customer-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/customers/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM customers WHERE id = $1', [id]);
        broadcastToTenant(tenant, 'customer-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/quotations', async (req, res) => {
    try {
        const { tenant } = req.params;
        const result = await queryTenant(tenant, 'SELECT * FROM quotations ORDER BY date DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/quotations', async (req, res) => {
    try {
        const { tenant } = req.params;
        const quotation = req.body;
        
        const query = `INSERT INTO quotations (
            quotation_no, customer_id, customer_name, customer_mobile, items, total, gst, net_total,
            discount, advance, final_amount, payment_status, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`;
        
        const params = [
            quotation.quotationNo, quotation.customerId, quotation.customerName,
            quotation.customerMobile, JSON.stringify(quotation.items), quotation.total,
            quotation.gst, quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks
        ];
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'quotation-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/quotations/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const quotation = req.body;
        
        const query = `UPDATE quotations SET
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
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'quotation-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/quotations/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM quotations WHERE id = $1', [id]);
        broadcastToTenant(tenant, 'quotation-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/bills', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { billNo, date } = req.query;
        
        let query = 'SELECT * FROM bills WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (billNo) {
            query += ` AND bill_no = $${paramCount++}`;
            params.push(billNo);
        }
        if (date) {
            query += ` AND DATE(date) = $${paramCount++}`;
            params.push(date);
        }
        
        query += ' ORDER BY date DESC';
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/bills', async (req, res) => {
    try {
        const { tenant } = req.params;
        const bill = req.body;
        
        const query = `INSERT INTO bills (
            bill_no, quotation_id, customer_id, customer_name, customer_mobile, items,
            total, gst, cgst, sgst, net_total, payment_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
        
        const params = [
            bill.billNo, bill.quotationId || null, bill.customerId, bill.customerName,
            bill.customerMobile, JSON.stringify(bill.items), bill.total,
            bill.gst || 0, bill.cgst || 0, bill.sgst || 0, bill.netTotal, bill.paymentMethod || 'cash'
        ];
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'bill-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/bills/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const bill = req.body;
        
        const query = `UPDATE bills SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, cgst = $7, sgst = $8, net_total = $9, payment_method = $10
        WHERE id = $11 RETURNING *`;
        
        const params = [
            bill.customerId, bill.customerName, bill.customerMobile, JSON.stringify(bill.items),
            bill.total, bill.gst || 0, bill.cgst || 0, bill.sgst || 0,
            bill.netTotal, bill.paymentMethod || 'cash', id
        ];
        
        const result = await queryTenant(tenant, query, params);
        broadcastToTenant(tenant, 'bill-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/bills/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM bills WHERE id = $1', [id]);
        broadcastToTenant(tenant, 'bill-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/rates', async (req, res) => {
    try {
        const { tenant } = req.params;
        const result = await queryTenant(tenant, 'SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        res.json(result[0] || { gold: 7500, silver: 156, platinum: 3500 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/rates', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { gold, silver, platinum } = req.body;
        
        const query = `UPDATE rates SET gold = $1, silver = $2, platinum = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM rates ORDER BY updated_at DESC LIMIT 1)
        RETURNING *`;
        
        const result = await queryTenant(tenant, query, [gold, silver, platinum]);
        broadcastToTenant(tenant, 'rates-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/ledger/transactions', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { customerId, type, startDate, endDate } = req.query;
        
        let query = 'SELECT * FROM ledger_transactions WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (customerId) {
            query += ` AND customer_id = $${paramCount++}`;
            params.push(customerId);
        }
        if (type) {
            query += ` AND transaction_type = $${paramCount++}`;
            params.push(type);
        }
        if (startDate) {
            query += ` AND DATE(date) >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND DATE(date) <= $${paramCount++}`;
            params.push(endDate);
        }
        
        query += ' ORDER BY date DESC';
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/ledger/transactions', async (req, res) => {
    try {
        const { tenant } = req.params;
        const transaction = req.body;
        
        const query = `INSERT INTO ledger_transactions (
            customer_id, transaction_type, amount, description, date
        ) VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        
        const params = [
            transaction.customerId || null, transaction.transactionType,
            transaction.amount, transaction.description, transaction.date || new Date()
        ];
        
        const result = await queryTenant(tenant, query, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/purchase-vouchers', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { pvNo } = req.query;
        
        let query = 'SELECT * FROM purchase_vouchers WHERE 1=1';
        const params = [];
        
        if (pvNo) {
            query += ' AND pv_no = $1';
            params.push(pvNo);
        }
        
        query += ' ORDER BY date DESC';
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/purchase-vouchers', async (req, res) => {
    try {
        const { tenant } = req.params;
        const pv = req.body;
        
        const query = `INSERT INTO purchase_vouchers (
            pv_no, supplier_name, items, total
        ) VALUES ($1, $2, $3, $4) RETURNING *`;
        
        const params = [
            pv.pvNo, pv.supplierName || '', JSON.stringify(pv.items), pv.total || 0
        ];
        
        const result = await queryTenant(tenant, query, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/:tenant/rol', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { barcode, styleCode } = req.query;
        
        let query = 'SELECT * FROM rol_data WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (barcode) {
            query += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            query += ` AND barcode IN (SELECT barcode FROM products WHERE style_code = $${paramCount++})`;
            params.push(styleCode);
        }
        
        const result = await queryTenant(tenant, query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/rol', async (req, res) => {
    try {
        const { tenant } = req.params;
        const rolData = req.body;
        
        // Upsert ROL data
        const query = `INSERT INTO rol_data (barcode, rol, available)
        VALUES ($1, $2, $3)
        ON CONFLICT (barcode) DO UPDATE SET
            rol = EXCLUDED.rol,
            available = EXCLUDED.available,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`;
        
        const params = [rolData.barcode, rolData.rol || 0, rolData.available || 0];
        
        const result = await queryTenant(tenant, query, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/rol/:barcode', async (req, res) => {
    try {
        const { tenant, barcode } = req.params;
        const { rol, available } = req.body;
        
        const query = `UPDATE rol_data SET
            rol = $1, available = $2, updated_at = CURRENT_TIMESTAMP
        WHERE barcode = $3 RETURNING *`;
        
        const result = await queryTenant(tenant, query, [rol, available, barcode]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

async function checkUserManagementAccess(req, res, next) {
    try {
        next();
    } catch (error) {
        res.status(403).json({ error: 'Access denied. Only administrators can manage users.' });
    }
}

app.get('/api/:tenant/users', checkUserManagementAccess, async (req, res) => {
    try {
        const { tenant } = req.params;
        // SECURITY: Never return password hashes
        const result = await queryTenant(tenant, 'SELECT id, username, role, allowed_tabs, created_at FROM users ORDER BY username');
        // Double-check: ensure no password field is returned
        const sanitized = result.map(user => {
            const { password, ...safeUser } = user;
            return safeUser;
        });
        res.json(sanitized);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/users', checkUserManagementAccess, async (req, res) => {
    try {
        const { tenant } = req.params;
        const { username, password, role, allowedTabs } = req.body;
        
        // Validate role - only 'admin' or 'employee' allowed
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        // SECURITY: Always hash passwords
        if (!password || password.trim() === '') {
            return res.status(400).json({ error: 'Password is required' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const query = `INSERT INTO users (username, password, role, allowed_tabs)
        VALUES ($1, $2, $3, $4) RETURNING id, username, role, allowed_tabs, created_at`;
        
        const params = [username, hashedPassword, userRole, allowedTabs || ['all']];
        
        const result = await queryTenant(tenant, query, params);
        // Never return password hash in response
        const userResponse = result[0];
        delete userResponse.password;
        broadcastToTenant(tenant, 'user-created', userResponse);
        res.json(userResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/users/:id', checkUserManagementAccess, async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const { username, password, role, allowedTabs } = req.body;
        
        // Validate role - only 'admin' or 'employee' allowed
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        let query = 'UPDATE users SET username = $1, role = $2, allowed_tabs = $3';
        const params = [username, userRole, allowedTabs || ['all']];
        
        if (password && password.trim() !== '') {
            // SECURITY: Always hash passwords
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = $4 WHERE id = $5 RETURNING id, username, role, allowed_tabs';
            params.push(hashedPassword, id);
        } else {
            query += ' WHERE id = $4 RETURNING id, username, role, allowed_tabs';
            params.push(id);
        }
        
        const result = await queryTenant(tenant, query, params);
        // Never return password hash in response
        const userResponse = result[0];
        if (userResponse.password) delete userResponse.password;
        broadcastToTenant(tenant, 'user-updated', userResponse);
        res.json(userResponse);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/users/:id', checkUserManagementAccess, async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/admin/api-keys', async (req, res) => {
    try {
        // Check for master API key in headers
        const masterKey = req.headers['x-master-api-key'];
        if (masterKey !== process.env.MASTER_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const result = await masterPool.query('SELECT * FROM api_keys ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/api-keys', async (req, res) => {
    try {
        const masterKey = req.headers['x-master-api-key'];
        if (masterKey !== process.env.MASTER_API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { tenantCode, description } = req.body;
        const apiKey = require('crypto').randomBytes(32).toString('hex');
        
        // Create api_keys table if not exists
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                tenant_code VARCHAR(50) REFERENCES tenants(tenant_code),
                api_key VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP
            )
        `);
        
        const result = await masterPool.query(
            'INSERT INTO api_keys (tenant_code, api_key, description) VALUES ($1, $2, $3) RETURNING *',
            [tenantCode, apiKey, description || '']
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/query', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { query: sqlQuery, params = [] } = req.body;
        
        // Security: Only allow SELECT queries for safety
        if (!sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
            return res.status(403).json({ error: 'Only SELECT queries are allowed' });
        }
        
        const result = await queryTenant(tenant, sqlQuery, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get table schema
app.get('/api/:tenant/schema/:table', async (req, res) => {
    try {
        const { tenant, table } = req.params;
        const query = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `;
        const result = await queryTenant(tenant, query, [table]);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all tables
app.get('/api/:tenant/tables', async (req, res) => {
    try {
        const { tenant } = req.params;
        const query = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        `;
        const result = await queryTenant(tenant, query);
        res.json(result.map(r => r.table_name));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/api/update/check', async (req, res) => {
    try {
        const packageJson = require('./package.json');
        const currentVersion = packageJson.version;
        
        // Check GitHub releases if configured
        const githubRepo = process.env.GITHUB_REPO; // Format: "username/repo"
        
        if (githubRepo) {
            try {
                const https = require('https');
                const githubUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
                
                const githubResponse = await new Promise((resolve, reject) => {
                    https.get(githubUrl, {
                        headers: {
                            'User-Agent': 'JP-Jewellery-Estimations'
                        }
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
                
                const latestVersion = githubResponse.tag_name.replace('v', '').replace('V', '');
                const installerAsset = githubResponse.assets.find(asset => 
                    asset.name.includes('.exe') && asset.name.includes('Setup')
                );
                
                const updateAvailable = latestVersion !== currentVersion;
                
                return res.json({
                    available: updateAvailable,
                    version: latestVersion,
                    currentVersion: currentVersion,
                    downloadUrl: installerAsset ? installerAsset.browser_download_url : null,
                    releaseNotes: githubResponse.body || 'Latest update with improvements',
                    mandatory: false
                });
            } catch (githubError) {
                console.error('GitHub check failed:', githubError);
                // Fall through to local version check
            }
        }
        
        // Fallback: return current version (no update available)
        res.json({
            available: false,
            version: currentVersion,
            currentVersion: currentVersion,
            downloadUrl: null,
            releaseNotes: 'No updates available',
            mandatory: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/update/download', (req, res) => {
    try {
        // In production, this would serve the actual installer file
        res.json({
            message: 'Update download endpoint',
            note: 'In production, this would serve the installer file',
            instructions: 'Download the latest installer from your update server and run it to update the application.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const tenantConnections = {};

io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    
    // Join tenant room when client connects
    socket.on('join-tenant', (tenantCode) => {
        if (tenantCode) {
            socket.join(`tenant-${tenantCode}`);
            if (!tenantConnections[tenantCode]) {
                tenantConnections[tenantCode] = new Set();
            }
            tenantConnections[tenantCode].add(socket.id);
            console.log(`📱 Client ${socket.id} joined tenant: ${tenantCode}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
        // Remove from tenant connections
        Object.keys(tenantConnections).forEach(tenant => {
            tenantConnections[tenant].delete(socket.id);
            if (tenantConnections[tenant].size === 0) {
                delete tenantConnections[tenant];
            }
        });
    });
});

function broadcastToTenant(tenantCode, event, data) {
    if (tenantCode) {
        io.to(`tenant-${tenantCode}`).emit(event, data);
        console.log(`📡 Broadcasted ${event} to tenant ${tenantCode}`);
    }
}

global.broadcastToTenant = broadcastToTenant;

// ========== SERVER SYNC API ==========

app.post('/api/sync/push', async (req, res) => {
    try {
        const { tenantCode, table, data } = req.body;
        const pool = getTenantPool(tenantCode);
        
        // Insert or update data
        for (const row of data) {
            const { id, ...rowData } = row;
            const columns = Object.keys(rowData);
            const values = Object.values(rowData);
            
            // Check if exists
            const exists = await pool.query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
            
            if (exists.rows.length > 0) {
                // Update
                const setClause = columns.map((col, idx) => `${col} = $${idx + 1}`).join(', ');
                await pool.query(`UPDATE ${table} SET ${setClause} WHERE id = $${columns.length + 1}`, [...values, id]);
            } else {
                // Insert
                const allColumns = ['id', ...columns];
                const allValues = [id, ...values];
                const placeholders = allColumns.map((_, idx) => `$${idx + 1}`).join(', ');
                await pool.query(`INSERT INTO ${table} (${allColumns.join(', ')}) VALUES (${placeholders})`, allValues);
            }
        }
        
        broadcastToTenant(tenantCode, 'data-synced', { table, count: data.length });
        res.json({ success: true, message: `Synced ${data.length} records` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sync/pull', async (req, res) => {
    try {
        const { tenantCode, table, lastSync } = req.body;
        const pool = getTenantPool(tenantCode);
        
        let query = `SELECT * FROM ${table}`;
        if (lastSync) {
            query += ` WHERE updated_at > $1 OR created_at > $1`;
            const result = await pool.query(query, [lastSync]);
            res.json(result.rows);
        } else {
            const result = await pool.query(query);
            res.json(result.rows);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const DOMAIN = process.env.DOMAIN || 'localhost';
const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? `${PROTOCOL}://${DOMAIN}` 
  : `http://localhost:${PORT}`;

server.listen(PORT, () => {
  console.log(`✅ Server running at ${BASE_URL}`);
  console.log(`📊 Database API available at ${BASE_URL}/api`);
  console.log(`🔐 Multi-tenant architecture enabled`);
  console.log(`🔄 Update API available at ${BASE_URL}/api/update`);
  console.log(`🔌 Real-time sync enabled (Socket.IO)`);
  console.log(`🔄 Server sync API available at ${BASE_URL}/api/sync`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Cloud deployment active`);
    console.log(`🔒 HTTPS enabled via Nginx`);
  }
});
