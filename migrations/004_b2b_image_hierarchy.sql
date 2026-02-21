-- ============================================
-- Migration 004: B2B Image & Hierarchy Upgrade
-- Gaurav Softwares - Jewelry Estimation
-- ============================================
-- Adds: items table (Style→SKU→Item hierarchy level),
--        product attributes (JSONB), image support,
--        product_images table, hierarchy image cascading
-- ============================================

-- ============================================
-- 1. ITEMS TABLE (new hierarchy level: Style → SKU → Item)
--    Each Item belongs to a Style+SKU combination.
--    Products link to Items via item_code.
-- ============================================
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    style_code VARCHAR(100) NOT NULL,
    sku_code VARCHAR(100) NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(255),
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(style_code, sku_code, item_code)
);

-- ============================================
-- 2. PRODUCT_IMAGES TABLE (multiple images per product)
--    Cascades on product barcode delete.
-- ============================================
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_barcode VARCHAR(100) NOT NULL,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_images_barcode
        FOREIGN KEY (product_barcode)
        REFERENCES products(barcode)
        ON DELETE CASCADE
);

-- ============================================
-- 3. ADD COLUMNS TO products TABLE
--    - attributes: flexible key-value pairs (Color, Size, etc.)
--    - image_url: primary image shortcut
--    - item_code: links product to items table hierarchy
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='products' AND column_name='attributes') THEN
        ALTER TABLE products ADD COLUMN attributes JSONB DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='products' AND column_name='image_url') THEN
        ALTER TABLE products ADD COLUMN image_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='products' AND column_name='item_code') THEN
        ALTER TABLE products ADD COLUMN item_code VARCHAR(100);
    END IF;
END $$;

-- ============================================
-- 4. ADD image_url AND is_active TO styles TABLE
--    SKU-level image for hierarchy cascade fallback.
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='styles' AND column_name='image_url') THEN
        ALTER TABLE styles ADD COLUMN image_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='styles' AND column_name='is_active') THEN
        ALTER TABLE styles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================
-- 5. INDEXES for query performance
-- ============================================

-- Products: GIN index for JSONB attribute queries (e.g., WHERE attributes->>'color' = 'Rose')
CREATE INDEX IF NOT EXISTS idx_products_attributes ON products USING GIN (attributes);

-- Products: fast lookup by item_code
CREATE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code);

-- Products: fast lookup by image presence
CREATE INDEX IF NOT EXISTS idx_products_image_url ON products(image_url) WHERE image_url IS NOT NULL;

-- Product images: lookup by barcode
CREATE INDEX IF NOT EXISTS idx_product_images_barcode ON product_images(product_barcode);

-- Product images: find primary image fast
CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_barcode, is_primary) WHERE is_primary = true;

-- Items: lookup by style+sku pair
CREATE INDEX IF NOT EXISTS idx_items_style_sku ON items(style_code, sku_code);

-- Items: lookup by item_code alone
CREATE INDEX IF NOT EXISTS idx_items_item_code ON items(item_code);
