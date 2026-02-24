-- ============================================
-- Migration 005: ROOT SKU Placeholder
-- Ensures every style has a ROOT SKU so the style
-- never disappears when the last visible SKU is deleted.
-- ============================================

-- Insert ROOT SKU for each style_code that doesn't already have one
INSERT INTO styles (style_code, sku_code, item_name, category, hsn_code, description, created_at, updated_at)
SELECT DISTINCT ON (s.style_code) s.style_code, 'ROOT', NULL, s.category, s.hsn_code, s.description, NOW(), NOW()
FROM styles s
WHERE NOT EXISTS (
    SELECT 1 FROM styles r
    WHERE r.style_code = s.style_code AND UPPER(r.sku_code) = 'ROOT'
)
ON CONFLICT (style_code, sku_code) DO NOTHING;
