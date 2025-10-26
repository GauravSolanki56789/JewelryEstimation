const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        barcode TEXT UNIQUE,
        sku TEXT,
        styleCode TEXT,
        shortName TEXT,
        size TEXT,
        avgWt REAL,
        purity REAL,
        mcRate REAL,
        metalType TEXT
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT,
        address1 TEXT,
        address2 TEXT,
        city TEXT,
        mobile TEXT
      );

      CREATE TABLE IF NOT EXISTS quotations (
        id SERIAL PRIMARY KEY,
        quotationNo TEXT,
        customerId INTEGER,
        date TEXT,
        items TEXT,
        total REAL,
        gst REAL,
        netTotal REAL
      );

      CREATE TABLE IF NOT EXISTS rates (
        id INTEGER PRIMARY KEY,
        gold REAL,
        silver REAL,
        platinum REAL
      );

      CREATE TABLE IF NOT EXISTS rol_data (
        id SERIAL PRIMARY KEY,
        barcode TEXT UNIQUE,
        styleCode TEXT,
        productName TEXT,
        rol INTEGER,
        available INTEGER DEFAULT 0
      );
    `);

    // Insert default rates if empty
    const rateCheck = await client.query('SELECT COUNT(*) as count FROM rates');
    if (rateCheck.rows[0].count === '0') {
      await client.query('INSERT INTO rates (id, gold, silver, platinum) VALUES (1, 7500, 156, 3500)');
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// ========== API ROUTES ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get product by barcode
app.get('/api/products/:barcode', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [req.params.barcode]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add product
app.post('/api/products', async (req, res) => {
  const { barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  const { barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType } = req.body;
  try {
    await pool.query(
      `UPDATE products SET barcode=$1, sku=$2, styleCode=$3, shortName=$4, size=$5, avgWt=$6, purity=$7, mcRate=$8, metalType=$9
       WHERE id=$10`,
      [barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add customer
app.post('/api/customers', async (req, res) => {
  const { name, address1, address2, city, mobile } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, address1, address2, city, mobile)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, address1, address2, city, mobile]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update customer
app.put('/api/customers/:id', async (req, res) => {
  const { name, address1, address2, city, mobile } = req.body;
  try {
    await pool.query(
      `UPDATE customers SET name=$1, address1=$2, address2=$3, city=$4, mobile=$5 WHERE id=$6`,
      [name, address1, address2, city, mobile, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete customer
app.delete('/api/customers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rates
app.get('/api/rates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rates WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update rates
app.put('/api/rates', async (req, res) => {
  const { gold, silver, platinum } = req.body;
  try {
    await pool.query('UPDATE rates SET gold=$1, silver=$2, platinum=$3 WHERE id=1', [gold, silver, platinum]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save quotation
app.post('/api/quotations', async (req, res) => {
  const { quotationNo, customerId, date, items, total, gst, netTotal } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO quotations (quotationNo, customerId, date, items, total, gst, netTotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [quotationNo, customerId, date, JSON.stringify(items), total, gst, netTotal]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all quotations
app.get('/api/quotations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM quotations ORDER BY id DESC');
    res.json(result.rows.map(q => ({...q, items: JSON.parse(q.items)})));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROL Data endpoints
app.get('/api/rol', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rol_data');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rol', async (req, res) => {
  const { barcode, styleCode, productName, rol, available } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO rol_data (barcode, styleCode, productName, rol, available)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (barcode) DO UPDATE SET
       styleCode = $2, productName = $3, rol = $4, available = $5
       RETURNING id`,
      [barcode, styleCode, productName, rol, available || 0]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rol/:barcode', async (req, res) => {
  const { available } = req.body;
  try {
    await pool.query('UPDATE rol_data SET available=$1 WHERE barcode=$2', [available, req.params.barcode]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});