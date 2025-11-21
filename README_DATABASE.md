# Multi-Tenant Database Architecture

## Overview
This application now supports multi-tenant architecture where each client gets their own separate database.

## Architecture

### Master Database
- **Database Name**: `jewelry_master`
- **Purpose**: Manages all tenants/clients
- **Table**: `tenants` - stores tenant information

### Tenant Databases
- **Database Name Pattern**: `jewelry_{tenant_code}`
- **Purpose**: Each client has their own isolated database
- **Tables**: products, customers, quotations, bills, rates, users, etc.

## Setup Instructions

### 1. Install PostgreSQL
```bash
# Download and install PostgreSQL from https://www.postgresql.org/download/
```

### 2. Create Master Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create master database
CREATE DATABASE jewelry_master;

# Exit
\q
```

### 3. Configure Environment Variables
Create a `.env` file:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=jewelry_master
PORT=3000
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Initialize Master Database
```bash
npm run setup-db
```

### 6. Start Server
```bash
npm start
```

## Creating a New Tenant/Client

### Using API
```bash
POST http://localhost:3000/api/tenants
Content-Type: application/json

{
  "tenantCode": "client1",
  "tenantName": "Client 1 Name",
  "adminUsername": "admin",
  "adminPassword": "password123"
}
```

This will:
1. Create a new database: `jewelry_client1`
2. Initialize all tables in that database
3. Create admin user
4. Set up default rates

## API Endpoints

### Authentication
```
POST /api/auth/login
Body: { username, password, tenantCode }
```

### Products
```
GET    /api/:tenant/products          # List all products
GET    /api/:tenant/products?barcode=xxx  # Get by barcode
GET    /api/:tenant/products?styleCode=xxx # Get by style code
POST   /api/:tenant/products          # Create product
PUT    /api/:tenant/products/:id      # Update product
DELETE /api/:tenant/products/:id     # Delete product
```

### Customers
```
GET  /api/:tenant/customers
POST /api/:tenant/customers
```

### Quotations
```
GET  /api/:tenant/quotations
POST /api/:tenant/quotations
```

### Rates
```
GET /api/:tenant/rates
PUT /api/:tenant/rates
```

### Database Query Interface
```
POST /api/:tenant/query
Body: { query: "SELECT * FROM products WHERE...", params: [] }
Note: Only SELECT queries allowed for security

GET /api/:tenant/tables              # List all tables
GET /api/:tenant/schema/:table       # Get table schema
```

## Database Commands

### Access Tenant Database Directly
```bash
psql -U postgres -d jewelry_client1
```

### Common Queries

#### Find product by barcode
```sql
SELECT * FROM products WHERE barcode = '00000001';
```

#### Find all products in a style code
```sql
SELECT * FROM products WHERE style_code = 'emerald idol';
```

#### Get customer ledger
```sql
SELECT c.name, lt.* 
FROM ledger_transactions lt
JOIN customers c ON lt.customer_id = c.id
WHERE c.mobile = '1234567890'
ORDER BY lt.date DESC;
```

#### Get all quotations for a date range
```sql
SELECT * FROM quotations 
WHERE date BETWEEN '2025-01-01' AND '2025-12-31'
ORDER BY date DESC;
```

#### Get products needing reorder (ROL)
```sql
SELECT p.*, r.rol, r.available, (r.rol - r.available) as required
FROM products p
JOIN rol_data r ON p.barcode = r.barcode
WHERE (r.rol - r.available) > 0;
```

#### Get sales summary
```sql
SELECT 
    DATE(date) as sale_date,
    COUNT(*) as total_bills,
    SUM(net_total) as total_amount
FROM bills
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(date)
ORDER BY sale_date DESC;
```

## Frontend Integration

The frontend needs to be updated to use API calls instead of localStorage. Example:

```javascript
// Instead of:
let products = JSON.parse(localStorage.getItem('products') || '[]');

// Use:
async function loadProducts(tenantCode) {
    const response = await fetch(`/api/${tenantCode}/products`);
    const products = await response.json();
    return products;
}
```

## Deployment

### Option 1: Railway
1. Push code to GitHub
2. Connect Railway to GitHub repo
3. Add PostgreSQL service
4. Set environment variables
5. Deploy

### Option 2: Heroku
1. Create Heroku app
2. Add Heroku Postgres addon
3. Set config vars
4. Deploy

### Option 3: VPS (DigitalOcean, AWS, etc.)
1. Install Node.js and PostgreSQL
2. Set up reverse proxy (Nginx)
3. Use PM2 for process management
4. Configure SSL

## Security Notes

1. **Password Hashing**: Currently passwords are stored in plain text. Implement bcrypt for production.
2. **JWT Tokens**: Add JWT authentication for API security.
3. **Query Restrictions**: The query endpoint only allows SELECT queries.
4. **Tenant Isolation**: Each tenant's data is completely isolated in separate databases.

## Migration from localStorage

To migrate existing localStorage data to database:

1. Export data from browser console:
```javascript
JSON.stringify({
    products: JSON.parse(localStorage.getItem('products')),
    customers: JSON.parse(localStorage.getItem('customers')),
    // ... etc
})
```

2. Use API endpoints to import data into tenant database.

