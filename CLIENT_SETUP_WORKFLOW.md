# Multi-Client Database Setup Workflow

## Current Setup: First Client "JP Jewellery"

### Step 1: Create Tenant for JP Jewellery

**In Cursor Terminal, run:**

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

**Or use PowerShell:**

```powershell
$body = @{
    tenantCode = "jpjewellery"
    tenantName = "JP Jewellery"
    adminUsername = "admin"
    adminPassword = "123456"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tenants" -Method POST -Body $body -ContentType "application/json"
```

This will:
- Create a new database: `jewelry_jpjewellery`
- Set up all tables for this client
- Create admin user for this tenant

### Step 2: Update Frontend to Use Tenant

The frontend needs to be updated to:
1. Store current tenant code (e.g., "jpjewellery")
2. Send tenant code in all API requests
3. Use API endpoints instead of localStorage

**Example API calls:**
- Get products: `GET /api/jpjewellery/products?search=barcode123`
- Add product: `POST /api/jpjewellery/products`
- Get customers: `GET /api/jpjewellery/customers`

---

## Future Client Setup Workflow

### For Each New Client:

#### Step 1: Create Tenant Database

```bash
curl -X POST http://localhost:3000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "tenantCode": "client2code",
    "tenantName": "Client 2 Name",
    "adminUsername": "admin",
    "adminPassword": "their_password"
  }'
```

**Replace:**
- `client2code` - unique code (lowercase, no spaces, e.g., "abcjewellers")
- `Client 2 Name` - full client name
- `their_password` - password for their admin account

#### Step 2: Each Client Gets:
- ✅ Separate database: `jewelry_client2code`
- ✅ Isolated data (products, customers, bills, etc.)
- ✅ Their own admin account
- ✅ Complete data separation

#### Step 3: Access Client Data

**Option A: Through API (Recommended)**
- Frontend sends tenant code with each request
- Server routes to correct database

**Option B: Direct Database Access**
- Connect to specific tenant database
- Query directly using SQL

---

## Database Structure

### Master Database (`jewelry_master`)
- `tenants` table - List of all clients
- Each tenant has: code, name, database_name

### Tenant Databases (`jewelry_tenantcode`)
- `products` - Products for this client
- `customers` - Customers for this client
- `quotations` - Quotations for this client
- `bills` - Sales bills for this client
- `ledger_transactions` - Financial transactions
- All other client-specific data

---

## Quick Commands

### List All Clients:
```bash
curl http://localhost:3000/api/tenants
```

### Get Client Info:
```bash
curl http://localhost:3000/api/tenants/jpjewellery
```

### Query Client Database Directly:
```sql
-- Connect to tenant database
\c jewelry_jpjewellery

-- Query products
SELECT * FROM products LIMIT 10;

-- Query customers
SELECT * FROM customers LIMIT 10;
```

---

## Next Steps for Frontend Integration

1. **Add tenant selection on login**
   - User selects which client they're working with
   - Store tenant code in session/localStorage

2. **Update all data operations to use API**
   - Replace localStorage with API calls
   - Include tenant code in all requests

3. **Multi-tenant UI**
   - Show current tenant name
   - Allow switching between tenants (if user has access)

---

## Current Status

✅ Master database setup complete
✅ Tenant creation API ready
✅ Database schema for tenants ready
⏳ Frontend integration pending (still using localStorage)

