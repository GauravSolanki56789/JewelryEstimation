const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const db = new Database('jewelry.db');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    address1 TEXT,
    address2 TEXT,
    city TEXT,
    mobile TEXT
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
`);

// Insert default rates if empty
const rateCheck = db.prepare('SELECT COUNT(*) as count FROM rates').get();
if (rateCheck.count === 0) {
  db.prepare('INSERT INTO rates (id, gold, silver, platinum) VALUES (1, 7500, 156, 3500)').run();
}

// API Routes

// Get all products
app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});

// Get product by barcode
app.get('/api/products/:barcode', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.barcode);
  res.json(product || null);
});

// Add product
app.post('/api/products', (req, res) => {
  const { barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO products (barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update product
app.put('/api/products/:id', (req, res) => {
  const { barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType } = req.body;
  db.prepare(`
    UPDATE products SET barcode=?, sku=?, styleCode=?, shortName=?, size=?, avgWt=?, purity=?, mcRate=?, metalType=?
    WHERE id=?
  `).run(barcode, sku, styleCode, shortName, size, avgWt, purity, mcRate, metalType, req.params.id);
  res.json({ success: true });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get all customers
app.get('/api/customers', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(customers);
});

// Add customer
app.post('/api/customers', (req, res) => {
  const { name, address1, address2, city, mobile } = req.body;
  const result = db.prepare(`
    INSERT INTO customers (name, address1, address2, city, mobile)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, address1, address2, city, mobile);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Get rates
app.get('/api/rates', (req, res) => {
  const rates = db.prepare('SELECT * FROM rates WHERE id = 1').get();
  res.json(rates);
});

// Update rates
app.put('/api/rates', (req, res) => {
  const { gold, silver, platinum } = req.body;
  db.prepare('UPDATE rates SET gold=?, silver=?, platinum=? WHERE id=1').run(gold, silver, platinum);
  res.json({ success: true });
});

// Save quotation
app.post('/api/quotations', (req, res) => {
  const { quotationNo, customerId, date, items, total, gst, netTotal } = req.body;
  const result = db.prepare(`
    INSERT INTO quotations (quotationNo, customerId, date, items, total, gst, netTotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(quotationNo, customerId, date, JSON.stringify(items), total, gst, netTotal);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Get all quotations
app.get('/api/quotations', (req, res) => {
  const quotations = db.prepare('SELECT * FROM quotations ORDER BY id DESC').all();
  res.json(quotations.map(q => ({...q, items: JSON.parse(q.items)})));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Open your browser and go to: http://localhost:3000`);
});