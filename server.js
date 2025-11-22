require('dotenv').config(); // Load .env file first
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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/customers/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM customers WHERE id = $1', [id]);
        res.json({ success: true });
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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/quotations/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM quotations WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== BILLS API ==========

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
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/bills/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM bills WHERE id = $1', [id]);
        res.json({ success: true });
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

// ========== LEDGER TRANSACTIONS API ==========

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

// ========== PURCHASE VOUCHERS API ==========

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

// ========== ROL DATA API ==========

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

// ========== USERS MANAGEMENT API ==========

app.get('/api/:tenant/users', async (req, res) => {
    try {
        const { tenant } = req.params;
        const result = await queryTenant(tenant, 'SELECT id, username, role, allowed_tabs, created_at FROM users ORDER BY username');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/:tenant/users', async (req, res) => {
    try {
        const { tenant } = req.params;
        const { username, password, role, allowedTabs } = req.body;
        
        const query = `INSERT INTO users (username, password, role, allowed_tabs)
        VALUES ($1, $2, $3, $4) RETURNING id, username, role, allowed_tabs, created_at`;
        
        const params = [username, password, role || 'user', allowedTabs || ['all']];
        
        const result = await queryTenant(tenant, query, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/:tenant/users/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        const { username, password, role, allowedTabs } = req.body;
        
        let query = 'UPDATE users SET username = $1, role = $2, allowed_tabs = $3';
        const params = [username, role || 'user', allowedTabs || ['all']];
        
        if (password) {
            query += ', password = $4 WHERE id = $5 RETURNING id, username, role, allowed_tabs';
            params.push(password, id);
        } else {
            query += ' WHERE id = $4 RETURNING id, username, role, allowed_tabs';
            params.push(id);
        }
        
        const result = await queryTenant(tenant, query, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/:tenant/users/:id', async (req, res) => {
    try {
        const { tenant, id } = req.params;
        await queryTenant(tenant, 'DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API KEY MANAGEMENT (for monitoring) ==========

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
