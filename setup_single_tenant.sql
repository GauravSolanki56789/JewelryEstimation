-- ============================================
-- Single-Tenant Database Setup Script
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Run this script on a fresh PostgreSQL database
-- Usage: psql -U postgres -d jewelry_db -f setup_single_tenant.sql
-- ============================================

-- Drop existing tables if migrating from multi-tenant
DROP TABLE IF EXISTS tally_sync_log CASCADE;
DROP TABLE IF EXISTS sales_returns CASCADE;
DROP TABLE IF EXISTS tally_config CASCADE;
DROP TABLE IF EXISTS rol_data CASCADE;
DROP TABLE IF EXISTS purchase_vouchers CASCADE;
DROP TABLE IF EXISTS ledger_transactions CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS quotations CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS rates CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- Drop old multi-tenant tables if they exist
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS master_admins CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ============================================
-- ADMIN USERS TABLE (Super Admin Management)
-- ============================================
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_super_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USERS TABLE (Google OAuth / Local Auth)
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100),
    password VARCHAR(255),
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'employee',
    account_status VARCHAR(50) DEFAULT 'pending',
    phone_number VARCHAR(20),
    dob DATE,
    company_name VARCHAR(255),
    allowed_tabs TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE products (
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
);

-- ============================================
-- CUSTOMERS TABLE
-- ============================================
CREATE TABLE customers (
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
);

-- ============================================
-- QUOTATIONS TABLE
-- ============================================
CREATE TABLE quotations (
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
);

-- ============================================
-- BILLS TABLE
-- ============================================
CREATE TABLE bills (
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
);

-- ============================================
-- RATES TABLE
-- ============================================
CREATE TABLE rates (
    id SERIAL PRIMARY KEY,
    gold DECIMAL(10,2) DEFAULT 7500,
    silver DECIMAL(10,2) DEFAULT 156,
    platinum DECIMAL(10,2) DEFAULT 3500,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- LEDGER TRANSACTIONS TABLE
-- ============================================
CREATE TABLE ledger_transactions (
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
);

-- ============================================
-- PURCHASE VOUCHERS TABLE
-- ============================================
CREATE TABLE purchase_vouchers (
    id SERIAL PRIMARY KEY,
    pv_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(255),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    items JSONB,
    total DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ROL DATA TABLE
-- ============================================
CREATE TABLE rol_data (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE REFERENCES products(barcode),
    rol INTEGER DEFAULT 0,
    available INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TALLY CONFIG TABLE
-- ============================================
CREATE TABLE tally_config (
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
);

-- ============================================
-- SALES RETURNS TABLE
-- ============================================
CREATE TABLE sales_returns (
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
);

-- ============================================
-- TALLY SYNC LOG TABLE
-- ============================================
CREATE TABLE tally_sync_log (
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
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_style_code ON products(style_code);
CREATE INDEX idx_customers_mobile ON customers(mobile);
CREATE INDEX idx_quotations_date ON quotations(date);
CREATE INDEX idx_bills_date ON bills(date);
CREATE INDEX idx_tally_sync_log_transaction ON tally_sync_log(transaction_type, transaction_id);
CREATE INDEX idx_tally_sync_log_status ON tally_sync_log(sync_status);
CREATE INDEX idx_sales_returns_bill_no ON sales_returns(bill_no);
CREATE INDEX idx_sales_returns_ssr_no ON sales_returns(ssr_no);
CREATE INDEX idx_quotations_is_billed ON quotations(is_billed);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_ledger_customer ON ledger_transactions(customer_id);
CREATE INDEX idx_ledger_date ON ledger_transactions(date);

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Default Rates
INSERT INTO rates (gold, silver, platinum) VALUES (7500, 156, 3500);

-- Default Tally Config
INSERT INTO tally_config (tally_url, company_name, enabled, sync_mode, auto_sync_enabled) 
VALUES ('http://localhost:9000', 'Default Company', false, 'manual', false);

-- Default Super Admin User
-- Password: Change this immediately after setup!
-- Default password hash is for 'admin123' - CHANGE IMMEDIATELY
INSERT INTO admin_users (username, password_hash, is_super_admin) 
VALUES ('Gaurav', '$2b$10$PLACEHOLDER_HASH_CHANGE_THIS', true);

-- Default Super Admin with Google OAuth
-- Email: jaigaurav56789@gmail.com
INSERT INTO users (email, name, role, account_status, allowed_tabs) 
VALUES ('jaigaurav56789@gmail.com', 'Gaurav (Super Admin)', 'admin', 'active', ARRAY['all']);

-- ============================================
-- GRANT PERMISSIONS (if using non-postgres user)
-- ============================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'DATABASE SETUP COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Default Super Admin: jaigaurav56789@gmail.com';
    RAISE NOTICE 'Default Admin User: Gaurav';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Change the admin password immediately!';
    RAISE NOTICE 'Run: npm run change-master-password';
    RAISE NOTICE '';
END $$;
