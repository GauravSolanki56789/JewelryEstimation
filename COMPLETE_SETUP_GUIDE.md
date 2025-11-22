# Complete Setup & Usage Guide
## JP Jewellery Estimations - Multi-Tenant Software

---

## 📋 Table of Contents
1. [What Has Been Completed](#what-has-been-completed)
2. [Next Steps - What You Should Do](#next-steps)
3. [How to Work with the API](#api-usage)
4. [Client Installation Process](#client-installation)
5. [Monitoring & API Keys](#monitoring)
6. [Database Management](#database-management)

---

## ✅ What Has Been Completed

### 1. **Complete API Backend** (`server.js`)
- ✅ Products API (GET, POST, PUT, DELETE)
- ✅ Customers API (GET, POST, PUT, DELETE)
- ✅ Quotations API (GET, POST, PUT, DELETE)
- ✅ Bills API (GET, POST, PUT, DELETE)
- ✅ Rates API (GET, PUT)
- ✅ Ledger Transactions API
- ✅ Purchase Vouchers API
- ✅ ROL Data API
- ✅ Users Management API
- ✅ API Key Management for Monitoring

### 2. **Frontend API Integration**
- ✅ API service layer with all CRUD operations
- ✅ Automatic tenant code handling
- ✅ Error handling and fallback to localStorage
- ✅ Login system with tenant selection

### 3. **Admin Panel** (`public/admin.html`)
- ✅ Client management interface
- ✅ Monitoring dashboard
- ✅ API key generation
- ✅ Database query interface

### 4. **Database Architecture**
- ✅ Multi-tenant database structure
- ✅ Master database for tenant management
- ✅ Separate database per client
- ✅ Complete schema for all tables

---

## ✅ Migration Status

**All frontend operations have been successfully migrated to use the API!**

### Completed Migrations:

1. ✅ **Customer Operations**
   - `saveCustomer()` → uses `api.createCustomer()` / `api.updateCustomer()`
   - `deleteCustomer()` → uses `api.deleteCustomer()`
   - All customer operations save to database

2. ✅ **Quotation Operations**
   - `generateQuotePDFWithPayment()` → saves via `api.createQuotation()`
   - `deleteQuotation()` → uses `api.deleteQuotation()`
   - All quotations saved to database

3. ✅ **Bill Operations**
   - `generateSalesBillPDF()` → saves via `api.createBill()`
   - All bills saved to database

4. ✅ **Ledger Operations**
   - `recordLedgerTransaction()` → uses `api.createLedgerTransaction()`
   - All ledger entries saved to database

5. ✅ **Purchase Vouchers**
   - `confirmPVUpload()` → saves via `api.createPurchaseVoucher()`
   - All PVs saved to database

6. ✅ **ROL Data**
   - ROL upload → uses `api.createROLData()` and `api.updateROLData()`
   - All ROL data saved to database

7. ✅ **Rates Management**
   - `saveRates()` → uses `api.updateRates()`
   - All rate updates saved to database

**Migration Pattern Used:**
```javascript
// OLD (localStorage):
function saveCustomer() {
    customers.push(customer);
    setCachedItem('customers', customers);
}

// NEW (API):
async function saveCustomer() {
    try {
        const saved = await api.createCustomer(customer);
        customers.push({ ...customer, id: saved.id });
        setCachedItem('customers', customers); // Keep cache
        showDialog('Success', 'Customer saved to database!', 'success');
    } catch (error) {
        showDialog('Error', 'Failed to save: ' + error.message, 'error');
        // Fallback to localStorage if API fails
        customers.push(customer);
        setCachedItem('customers', customers);
    }
}
```

### Step 2: Set Up Environment Variables

Create a `.env` file in the project root:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=jewelry_master
PORT=3000

# Master API Key for Monitoring (Generate a secure random string)
MASTER_API_KEY=your_secure_random_string_here
```

**Generate Master API Key:**
```bash
# On Linux/Mac:
openssl rand -hex 32

# On Windows PowerShell:
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### Step 3: Initialize Master Database

```bash
# Install dependencies
npm install

# Initialize master database
npm run setup-db

# Start server
npm start
```

### Step 4: Create Your First Client

**Option A: Using Admin Panel**
1. Open http://localhost:3000/admin.html
2. Go to "Clients" tab
3. Click "Create New Client"
4. Fill in:
   - Tenant Code: `jpjewellery` (lowercase, no spaces)
   - Client Name: `JP Jewellery`
   - Admin Username: `admin`
   - Admin Password: `123456`

**Option B: Using API**
```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantCode": "jpjewellery",
    "tenantName": "JP Jewellery",
    "adminUsername": "admin",
    "adminPassword": "123456"
  }'
```

---

## 🔌 How to Work with the API

### API Base URL
```
http://localhost:3000/api/{tenantCode}
```

### Authentication
All API calls require tenant code in the URL path. No authentication tokens needed for now (you can add JWT later).

### Common API Calls

#### 1. **Products**
```javascript
// Get all products
const products = await api.getProducts();

// Search products
const products = await api.getProducts('barcode123');

// Get by barcode
const product = await api.getProductByBarcode('00000001');

// Create product
const newProduct = await api.createProduct({
    barcode: '00000001',
    sku: 'S',
    styleCode: 'ring001',
    itemName: 'Gold Ring',
    metalType: 'gold',
    weight: 5.5,
    purity: 100,
    rate: 7500,
    // ... other fields
});

// Update product
await api.updateProduct(productId, updatedProduct);

// Delete product
await api.deleteProduct(productId);
```

#### 2. **Customers**
```javascript
// Get all customers
const customers = await api.getCustomers();

// Search customers
const customers = await api.getCustomers('?search=john');

// Create customer
const customer = await api.createCustomer({
    name: 'John Doe',
    mobile: '1234567890',
    address1: '123 Main St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001'
});

// Update customer
await api.updateCustomer(customerId, updatedCustomer);

// Delete customer
await api.deleteCustomer(customerId);
```

#### 3. **Quotations**
```javascript
// Get all quotations
const quotations = await api.getQuotations();

// Create quotation
const quotation = await api.createQuotation({
    quotationNo: 'Q0001',
    customerId: 1,
    customerName: 'John Doe',
    customerMobile: '1234567890',
    items: [...], // Array of items
    total: 10000,
    gst: 300,
    netTotal: 10300,
    discount: 0,
    advance: 0,
    finalAmount: 10300,
    paymentStatus: 'pending',
    remarks: ''
});
```

#### 4. **Bills**
```javascript
// Get all bills
const bills = await api.getBills();

// Create bill
const bill = await api.createBill({
    billNo: 'B0001',
    customerId: 1,
    customerName: 'John Doe',
    customerMobile: '1234567890',
    items: [...],
    total: 10000,
    gst: 300,
    netTotal: 10300,
    paymentMethod: 'cash'
});
```

#### 5. **Ledger Transactions**
```javascript
// Get transactions
const transactions = await api.getLedgerTransactions({
    customerId: 1,
    startDate: '2025-01-01',
    endDate: '2025-12-31'
});

// Create transaction
await api.createLedgerTransaction({
    customerId: 1,
    transactionType: 'payment',
    amount: 5000,
    description: 'Cash payment received',
    date: new Date()
});
```

### Error Handling
Always wrap API calls in try-catch:
```javascript
try {
    const result = await api.createProduct(product);
    // Success
} catch (error) {
    console.error('API Error:', error);
    // Fallback to localStorage or show error
    showDialog('Error', error.message, 'error');
}
```

---

## 🏢 Client Installation Process

### For Each New Client:

#### 1. **Create Client Database**
```bash
# Using Admin Panel (Recommended)
# OR using API:
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantCode": "clientcode",
    "tenantName": "Client Name",
    "adminUsername": "admin",
    "adminPassword": "their_password"
  }'
```

This automatically:
- Creates database: `jewelry_clientcode`
- Sets up all tables
- Creates admin user
- Initializes default rates

#### 2. **Client Access**
- URL: `http://localhost:3000` (or your server URL)
- Username: The admin username you set
- Password: The admin password you set
- Tenant: Select the client code from dropdown

#### 3. **Client Database Location**
Each client's database is completely isolated:
- Database Name: `jewelry_{tenantCode}`
- All data is separate
- No cross-client data access

#### 4. **Client Can:**
- Create users, products, customers
- Generate quotations and bills
- Manage inventory (ROL, PV)
- View ledger and reports
- All data saved to their own database

---

## 📊 Monitoring & API Keys

### Access Admin Panel
```
http://localhost:3000/admin.html
```

### Generate API Key for Monitoring

1. **Set Master API Key in .env:**
```env
MASTER_API_KEY=your_secure_random_string
```

2. **Generate Client API Key:**
   - Go to Admin Panel → API Keys tab
   - Click "Generate API Key"
   - Enter tenant code and description
   - Copy the generated API key

3. **Use API Key for Monitoring:**
```javascript
// Get client data using API key
const response = await fetch('http://localhost:3000/api/jpjewellery/products', {
    headers: {
        'x-api-key': 'your_generated_api_key'
    }
});
```

### Monitoring Dashboard
- View all clients
- See client statistics
- Monitor database activity
- Generate API keys for programmatic access

---

## 🗄️ Database Management

### Direct Database Access

**Connect to Client Database:**
```bash
psql -U postgres -d jewelry_jpjewellery
```

**Common Queries:**
```sql
-- View all products
SELECT * FROM products LIMIT 10;

-- View all customers
SELECT * FROM customers;

-- View quotations
SELECT * FROM quotations ORDER BY date DESC;

-- View bills
SELECT * FROM bills ORDER BY date DESC;

-- Count products by metal type
SELECT metal_type, COUNT(*) FROM products GROUP BY metal_type;
```

### Backup Database
```bash
# Backup client database
pg_dump -U postgres jewelry_jpjewellery > backup_jpjewellery.sql

# Restore database
psql -U postgres jewelry_jpjewellery < backup_jpjewellery.sql
```

### Using Admin Panel Database Tab
1. Go to Admin Panel → Database tab
2. Enter tenant code
3. Click "Load Tenant"
4. Browse tables or run SQL queries

---

## 🔐 Security Recommendations

### For Production:

1. **Password Hashing**
   - Currently passwords are plain text
   - Implement bcrypt in `server.js`:
   ```javascript
   const bcrypt = require('bcrypt');
   const hashedPassword = await bcrypt.hash(password, 10);
   ```

2. **JWT Authentication**
   - Add JWT tokens for API security
   - Store tokens in httpOnly cookies

3. **HTTPS**
   - Use SSL certificates
   - Configure reverse proxy (Nginx)

4. **API Rate Limiting**
   - Add rate limiting middleware
   - Prevent abuse

5. **Input Validation**
   - Validate all inputs
   - Sanitize SQL queries (already using parameterized queries)

---

## 📦 Deployment Options

### Option 1: Single Server (All Clients)
- Install on one server
- All clients access same URL
- Each client has separate database
- You manage all databases

### Option 2: Client-Specific Installation
- Install software on each client's server
- Each client has their own installation
- They manage their own database
- You can access via API for monitoring

### Option 3: Cloud Deployment
- Deploy to Railway, Heroku, or AWS
- Use managed PostgreSQL
- Scale as needed

---

## 🆘 Troubleshooting

### Database Connection Error
```bash
# Check PostgreSQL is running
# Windows:
services.msc → PostgreSQL

# Linux:
sudo systemctl status postgresql

# Check connection
psql -U postgres -d jewelry_master
```

### API Not Working
1. Check server is running: `npm start`
2. Check .env file exists and has correct values
3. Check database is initialized: `npm run setup-db`
4. Check browser console for errors

### Client Can't Login
1. Verify client exists: Check `/api/tenants`
2. Verify credentials in master database
3. Check tenant database exists: `jewelry_{tenantCode}`

---

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review server logs
3. Check database connection
4. Verify API endpoints are accessible

---

## ✅ Checklist for Going Live

- [ ] Complete frontend API migration
- [ ] Set up .env with secure MASTER_API_KEY
- [ ] Initialize master database
- [ ] Create first client
- [ ] Test all features
- [ ] Set up backups
- [ ] Configure HTTPS (for production)
- [ ] Set up monitoring
- [ ] Generate API keys for monitoring
- [ ] Document client-specific setup

---

**Last Updated:** January 2025
**Version:** 2.0.0

