const express = require('express');
const path = require('path');
const cors = require('cors');
const { 
    masterPool, 
    getTenantPool, 
    initMasterDatabase, 
    createTenantDatabase,
    queryTenant 
} = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize master database on startup
initMasterDatabase();

// ========== TENANT MANAGEMENT ==========

// Create new tenant/client
app.post('/api/tenants', async (req, res) => {
    try {
        const { tenantCode, tenantName, adminUsername, adminPassword } = req.body;
        
        if (!tenantCode || !tenantName || !adminUsername || !adminPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        await createTenantDatabase(tenantCode, tenantName, adminUsername, adminPassword);
        res.json({ success: true, message: `Tenant ${tenantCode} created successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all tenants
app.get('/api/tenants', async (req, res) => {
    try {
        const result = await masterPool.query('SELECT tenant_code, tenant_name, created_at, is_active FROM tenants');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== AUTHENTICATION ==========

// Login (returns tenant info)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, tenantCode } = req.body;
        
        // First check master tenant table
        const tenantResult = await masterPool.query(
            'SELECT * FROM tenants WHERE tenant_code = $1 AND admin_username = $2 AND admin_password = $3',
            [tenantCode, username, password]
        );
        
        if (tenantResult.rows.length > 0) {
            const tenant = tenantResult.rows[0];
            return res.json({
                success: true,
                tenantCode: tenant.tenant_code,
                username: tenant.admin_username,
                role: 'admin',
                allowedTabs: ['all']
            });
        }
        
        // Check tenant users table
        const pool = getTenantPool(tenantCode);
        const userResult = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            return res.json({
                success: true,
                tenantCode: tenantCode,
                username: user.username,
                role: user.role,
                allowedTabs: user.allowed_tabs || ['all']
            });
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== PRODUCTS API ==========

app.get('/api/:tenant/products', async (req, res) => {
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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/products/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM products WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== CUSTOMERS API ==========

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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== QUOTATIONS API ==========

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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== RATES API ==========

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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== DATABASE QUERY INTERFACE ==========

// Execute custom SQL query (for admin access)
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

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`📊 Database API available at http://localhost:${PORT}/api`);
    console.log(`🔐 Multi-tenant architecture enabled`);
});
