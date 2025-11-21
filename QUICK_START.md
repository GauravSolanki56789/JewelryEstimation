# Quick Start Guide - Multi-Tenant Database Setup

## Step 1: Install PostgreSQL
Download and install PostgreSQL from https://www.postgresql.org/download/

## Step 2: Create Master Database
```bash
# Open terminal/command prompt
psql -U postgres

# In PostgreSQL prompt:
CREATE DATABASE jewelry_master;
\q
```

## Step 3: Configure Environment
Create `.env` file in project root:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=jewelry_master
PORT=3000
```

## Step 4: Install Dependencies
```bash
npm install
```

## Step 5: Initialize Database
```bash
npm run setup-db
```

## Step 6: Start Server
```bash
npm start
```

## Step 7: Create Your First Client/Tenant

### Option A: Using API (Recommended)
```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantCode": "client1",
    "tenantName": "First Client",
    "adminUsername": "admin",
    "adminPassword": "admin123"
  }'
```

### Option B: Using Browser Console
Open browser console and run:
```javascript
fetch('/api/tenants', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantCode: 'client1',
    tenantName: 'First Client',
    adminUsername: 'admin',
    adminPassword: 'admin123'
  })
}).then(r => r.json()).then(console.log);
```

## Step 8: Access Admin Panel
Open: http://localhost:3000/admin.html

Enter tenant code: `client1`
Click "Load Tenant"

## Step 9: Login to Application
1. Go to: http://localhost:3000
2. Enter:
   - Username: `admin`
   - Password: `admin123`
   - Tenant Code: `client1` (you'll need to add tenant code input to login)

## Common Database Queries

### Find Product by Barcode
```sql
SELECT * FROM products WHERE barcode = '00000001';
```

### Find All Products in Style Code
```sql
SELECT * FROM products WHERE style_code = 'emerald idol';
```

### Get Customer by Mobile
```sql
SELECT * FROM customers WHERE mobile = '1234567890';
```

### Get All Quotations for Customer
```sql
SELECT q.*, c.name, c.mobile 
FROM quotations q
JOIN customers c ON q.customer_id = c.id
WHERE c.mobile = '1234567890'
ORDER BY q.date DESC;
```

### Get Sales Summary (Last 30 Days)
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

### Get Products Needing Reorder
```sql
SELECT 
    p.barcode,
    p.short_name,
    p.style_code,
    r.rol,
    r.available,
    (r.rol - r.available) as required
FROM products p
JOIN rol_data r ON p.barcode = r.barcode
WHERE (r.rol - r.available) > 0
ORDER BY required DESC;
```

## Next Steps

1. **Update Frontend**: Modify `public/index.html` to use API calls instead of localStorage
2. **Add Tenant Selection**: Add tenant code input to login page
3. **Deploy**: Choose hosting platform (Railway, Heroku, VPS)
4. **Security**: Implement JWT tokens and password hashing

## Troubleshooting

### Database Connection Error
- Check PostgreSQL is running: `pg_isready`
- Verify credentials in `.env` file
- Check firewall settings

### Tenant Creation Fails
- Ensure PostgreSQL user has CREATE DATABASE permission
- Check database name doesn't already exist
- Review server logs for detailed error

### Can't Access Admin Panel
- Ensure server is running on port 3000
- Check browser console for errors
- Verify tenant code is correct

