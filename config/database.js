// Database Configuration for Multi-Tenant Architecture
require('dotenv').config(); // Load .env file
const { Pool } = require('pg');

// Store tenant database connections
const tenantPools = {};

// Master database connection (for tenant management)
const masterPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jewelry_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Initialize master database
async function initMasterDatabase() {
    try {
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id SERIAL PRIMARY KEY,
                tenant_code VARCHAR(50) UNIQUE NOT NULL,
                tenant_name VARCHAR(255) NOT NULL,
                database_name VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT true,
                admin_username VARCHAR(100) NOT NULL,
                admin_password VARCHAR(255) NOT NULL
            )
        `);
        
        // Create master admin users table
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS master_admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                is_super_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const bcrypt = require('bcrypt');
        const masterAdminCheck = await masterPool.query('SELECT * FROM master_admins WHERE username = $1', ['Gaurav']);
        if (masterAdminCheck.rows.length === 0) {
            const tempPassword = await bcrypt.hash('CHANGE_ME_' + Date.now(), 10);
            await masterPool.query(
                'INSERT INTO master_admins (username, password_hash, is_super_admin) VALUES ($1, $2, $3)',
                ['Gaurav', tempPassword, true]
            );
            console.log('⚠️ Master admin user created with temporary password. Run "npm run fix-gaurav-password" to set the correct password.');
        } else {
            const existingAdmin = masterAdminCheck.rows[0];
            if (existingAdmin.password_hash && !existingAdmin.password_hash.startsWith('$2')) {
                console.log('⚠️ Master admin password needs to be hashed. Run "npm run fix-gaurav-password" to fix it.');
            }
        }
        
        console.log('✅ Master database initialized');
    } catch (error) {
        console.error('❌ Error initializing master database:', error);
    }
}

// Get or create tenant database connection
function getTenantPool(tenantCode) {
    if (!tenantPools[tenantCode]) {
        tenantPools[tenantCode] = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            database: `jewelry_${tenantCode}`,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: 20,
        });
    }
    return tenantPools[tenantCode];
}

// Create tenant database and schema
async function createTenantDatabase(tenantCode, tenantName, adminUsername, adminPasswordHash) {
    // Need to connect to 'postgres' database to create new database
    const postgresPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: 'postgres', // Connect to postgres database to create new DB
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
    });
    
    const postgresClient = await postgresPool.connect();
    const masterClient = await masterPool.connect();
    
    try {
        // CREATE DATABASE cannot run inside a transaction, so do it first
        await postgresClient.query(`CREATE DATABASE jewelry_${tenantCode}`);
        console.log(`✅ Database created: jewelry_${tenantCode}`);
        
        // Now create tenant record in master database (password is already hashed)
        await masterClient.query('BEGIN');
        await masterClient.query(
            `INSERT INTO tenants (tenant_code, tenant_name, database_name, admin_username, admin_password)
             VALUES ($1, $2, $3, $4, $5)`,
            [tenantCode, tenantName, `jewelry_${tenantCode}`, adminUsername, adminPasswordHash]
        );
        await masterClient.query('COMMIT');
        
        // Initialize tenant database schema (connect to new database)
        const tenantPool = getTenantPool(tenantCode);
        await initTenantSchema(tenantPool);
        
        console.log(`✅ Tenant database initialized: jewelry_${tenantCode}`);
        return true;
    } catch (error) {
        try {
            await masterClient.query('ROLLBACK');
        } catch (rollbackError) {
            // Ignore rollback errors
        }
        console.error(`❌ Error creating tenant database:`, error);
        throw error;
    } finally {
        postgresClient.release();
        masterClient.release();
        await postgresPool.end();
    }
}

// Initialize tenant database schema
async function initTenantSchema(pool) {
    const queries = [
        // Products table
        `CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(100) UNIQUE,
            sku VARCHAR(100),
            style_code VARCHAR(100),
            short_name VARCHAR(255),
            item_name VARCHAR(255),
            metal_type VARCHAR(50),
            size VARCHAR(50),
            weight DECIMAL(10,3),
            purity DECIMAL(5,2),
            rate DECIMAL(10,2),
            mc_rate DECIMAL(10,2),
            mc_type VARCHAR(50),
            pcs INTEGER DEFAULT 1,
            box_charges DECIMAL(10,2) DEFAULT 0,
            stone_charges DECIMAL(10,2) DEFAULT 0,
            floor VARCHAR(100),
            avg_wt DECIMAL(10,3),
            split_from VARCHAR(100),
            split_date TIMESTAMP,
            is_sold BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Customers table
        `CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            mobile VARCHAR(20),
            address1 VARCHAR(255),
            address2 VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(100),
            pincode VARCHAR(20),
            gstin VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Quotations table
        `CREATE TABLE IF NOT EXISTS quotations (
            id SERIAL PRIMARY KEY,
            quotation_no VARCHAR(50) UNIQUE NOT NULL,
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            discount DECIMAL(10,2) DEFAULT 0,
            advance DECIMAL(10,2) DEFAULT 0,
            final_amount DECIMAL(10,2),
            payment_status VARCHAR(50),
            remarks VARCHAR(255),
            is_billed BOOLEAN DEFAULT false,
            bill_no VARCHAR(50),
            bill_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Bills table
        `CREATE TABLE IF NOT EXISTS bills (
            id SERIAL PRIMARY KEY,
            bill_no VARCHAR(50) UNIQUE NOT NULL,
            quotation_id INTEGER REFERENCES quotations(id),
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            cgst DECIMAL(10,2),
            sgst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            payment_method VARCHAR(50),
            cash_type VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Rates table
        `CREATE TABLE IF NOT EXISTS rates (
            id SERIAL PRIMARY KEY,
            gold DECIMAL(10,2) DEFAULT 7500,
            silver DECIMAL(10,2) DEFAULT 156,
            platinum DECIMAL(10,2) DEFAULT 3500,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Users table (passwords will be hashed)
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            allowed_tabs TEXT[],
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Ledger transactions
        `CREATE TABLE IF NOT EXISTS ledger_transactions (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            transaction_type VARCHAR(50),
            amount DECIMAL(10,2),
            description TEXT,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            cash_type VARCHAR(20),
            is_restricted BOOLEAN DEFAULT false,
            payment_method VARCHAR(50),
            reference VARCHAR(100),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            bill_no VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Purchase vouchers
        `CREATE TABLE IF NOT EXISTS purchase_vouchers (
            id SERIAL PRIMARY KEY,
            pv_no VARCHAR(50) UNIQUE NOT NULL,
            supplier_name VARCHAR(255),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // ROL data
        `CREATE TABLE IF NOT EXISTS rol_data (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(100) UNIQUE REFERENCES products(barcode),
            rol INTEGER DEFAULT 0,
            available INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Tally sync configuration (with encrypted API key)
        `CREATE TABLE IF NOT EXISTS tally_config (
            id SERIAL PRIMARY KEY,
            tally_url VARCHAR(255) DEFAULT 'http://localhost:9000',
            company_name VARCHAR(255),
            api_key_encrypted TEXT,
            api_secret_encrypted TEXT,
            connection_type VARCHAR(50) DEFAULT 'gateway',
            enabled BOOLEAN DEFAULT false,
            sync_mode VARCHAR(50) DEFAULT 'manual',
            auto_sync_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Sales Returns table
        `CREATE TABLE IF NOT EXISTS sales_returns (
            id SERIAL PRIMARY KEY,
            ssr_no VARCHAR(50) UNIQUE NOT NULL,
            bill_id INTEGER REFERENCES bills(id),
            bill_no VARCHAR(50) NOT NULL,
            quotation_id INTEGER REFERENCES quotations(id),
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            cgst DECIMAL(10,2),
            sgst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            reason TEXT,
            remarks VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Tally sync log
        `CREATE TABLE IF NOT EXISTS tally_sync_log (
            id SERIAL PRIMARY KEY,
            transaction_type VARCHAR(50) NOT NULL,
            transaction_id INTEGER NOT NULL,
            transaction_ref VARCHAR(100),
            sync_status VARCHAR(50) DEFAULT 'pending',
            sync_attempts INTEGER DEFAULT 0,
            last_sync_at TIMESTAMP,
            last_error TEXT,
            tally_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
        `CREATE INDEX IF NOT EXISTS idx_products_style_code ON products(style_code)`,
        `CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile)`,
        `CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date)`,
        `CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)`,
        `CREATE INDEX IF NOT EXISTS idx_tally_sync_log_transaction ON tally_sync_log(transaction_type, transaction_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tally_sync_log_status ON tally_sync_log(sync_status)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_returns_bill_no ON sales_returns(bill_no)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_returns_ssr_no ON sales_returns(ssr_no)`,
        `CREATE INDEX IF NOT EXISTS idx_quotations_is_billed ON quotations(is_billed)`,
    ];
    
    for (const query of queries) {
        await pool.query(query);
    }
    
    // Insert default rates if not exists
    const ratesCheck = await pool.query('SELECT COUNT(*) FROM rates');
    if (parseInt(ratesCheck.rows[0].count) === 0) {
        await pool.query('INSERT INTO rates (gold, silver, platinum) VALUES (7500, 156, 3500)');
    }
    
    // Insert default Tally config if not exists
    const tallyConfigCheck = await pool.query('SELECT COUNT(*) FROM tally_config');
    if (parseInt(tallyConfigCheck.rows[0].count) === 0) {
        await pool.query(`INSERT INTO tally_config (tally_url, company_name, enabled, sync_mode, auto_sync_enabled) 
            VALUES ('http://localhost:9000', 'Default Company', false, 'manual', false)`);
    }
}

// Query helper function
async function queryTenant(tenantCode, query, params = []) {
    const pool = getTenantPool(tenantCode);
    try {
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error(`Database query error for tenant ${tenantCode}:`, error);
        throw error;
    }
}

module.exports = {
    masterPool,
    getTenantPool,
    initMasterDatabase,
    createTenantDatabase,
    initTenantSchema,
    queryTenant,
};

