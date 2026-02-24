-- Migration 006: Invoice Settings for Company
-- Stores company details for PDF bills and E-Invoice

CREATE TABLE IF NOT EXISTS invoice_settings (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255),
    company_address TEXT,
    gstin VARCHAR(20),
    bank_name VARCHAR(255),
    account_name VARCHAR(255),
    account_no VARCHAR(50),
    ifsc_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default empty row
INSERT INTO invoice_settings (company_name, company_address, gstin, bank_name, account_name, account_no, ifsc_code)
SELECT 'JP JEWELLERY', '2ND FLOOR,OLD NO.34,NEW NO.21,BOTHRA EMPORIUM VEERAPPAN STREET CHENNAI 600079', '33AADFJ4897R1ZJ', 'HDFC BANK', 'JPJEWELLERY', '50200016402896', 'HDFC0000214'
WHERE NOT EXISTS (SELECT 1 FROM invoice_settings LIMIT 1);
