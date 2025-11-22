# 🧪 Testing Guide - Step-by-Step Instructions
## How to Test the Software and Choose Which Client Gets Updates

---

## 🎯 Part 1: Initial Setup & Testing on Your System

### Step 1: Start Your Server

```bash
# Navigate to project folder
cd JewelryEstimation

# Start server
npm start
```

**Expected Output:**
```
✅ Server running at http://localhost:3000
📊 Database API available at http://localhost:3000/api
🔐 Multi-tenant architecture enabled
```

---

### Step 2: Create Test Clients

1. **Open Admin Panel:**
   - Go to: `http://localhost:3000/admin.html`
   - Click **"Clients"** tab

2. **Create Client 1 (Test Client):**
   - Click **"Create New Client"**
   - Tenant Code: `testclient1`
   - Client Name: `Test Client 1`
   - Admin Username: `admin`
   - Admin Password: `test123`
   - Click **"Create"**

3. **Create Client 2 (Another Test):**
   - Tenant Code: `testclient2`
   - Client Name: `Test Client 2`
   - Admin Username: `admin`
   - Admin Password: `test123`
   - Click **"Create"**

**Verify:**
- Both clients appear in the list
- Each has their own database: `jewelry_testclient1` and `jewelry_testclient2`

---

### Step 3: Test Each Client Separately

#### Test Client 1:

1. **Login as Client 1:**
   - Open: `http://localhost:3000`
   - Select Tenant: `testclient1`
   - Username: `admin`
   - Password: `test123`
   - Click **"Sign In"**

2. **Create Test Data:**
   - **Create Customer:**
     - Go to "Customers" tab
     - Click "Add Customer"
     - Name: `John Doe`
     - Mobile: `1111111111`
     - Save
   
   - **Create Product:**
     - Go to "Products" tab
     - Click "Add Product"
     - Barcode: `TEST001`
     - Name: `Test Ring`
     - Weight: `5.5`
     - Save
   
   - **Generate Quotation:**
     - Go to "Billing" tab
     - Select customer: `John Doe`
     - Scan barcode: `TEST001`
     - Click "Generate Quote"
     - Select payment option
     - Generate PDF

3. **Verify in Database:**
   ```sql
   psql -U postgres -d jewelry_testclient1
   
   SELECT * FROM customers;
   SELECT * FROM products;
   SELECT * FROM quotations;
   \q
   ```

#### Test Client 2:

1. **Login as Client 2:**
   - Open: `http://localhost:3000` (or new tab)
   - Select Tenant: `testclient2`
   - Username: `admin`
   - Password: `test123`
   - Click **"Sign In"**

2. **Create Different Test Data:**
   - Create Customer: `Jane Smith` (Mobile: `2222222222`)
   - Create Product: `TEST002` (Name: `Test Necklace`)
   - Generate quotation

3. **Verify Data Isolation:**
   ```sql
   psql -U postgres -d jewelry_testclient2
   
   SELECT * FROM customers;  -- Should show Jane Smith, NOT John Doe
   SELECT * FROM products;   -- Should show TEST002, NOT TEST001
   \q
   ```

**✅ Confirmation:** Each client's data is completely separate!

---

## 🎯 Part 2: Testing Updates - Choosing Which Client Gets Updates

### Scenario: You Made a Code Update and Want to Test It

#### Option A: Test on Specific Client Only

1. **Login to the Client You Want to Test:**
   - Go to: `http://localhost:3000`
   - Select the specific tenant (e.g., `testclient1`)
   - Login

2. **Test the New Feature:**
   - Use the feature you updated
   - Verify it works correctly
   - Check database to confirm data saved

3. **Other Clients Unaffected:**
   - Login to `testclient2`
   - Verify old behavior still works
   - This confirms update only affects the client you tested

#### Option B: Test on All Clients

1. **Test Each Client One by One:**
   - Login to `testclient1` → Test feature → Verify
   - Login to `testclient2` → Test feature → Verify
   - Login to any other clients → Test feature → Verify

2. **Compare Results:**
   - All clients should behave the same way
   - Data should save correctly for all

---

## 🎯 Part 3: Deploying Updates to Specific Clients

### When You Update Code:

1. **Stop Server:**
   ```bash
   # Press Ctrl+C in terminal
   ```

2. **Update Code:**
   - Make your changes to files
   - Save files

3. **Restart Server:**
   ```bash
   npm start
   ```

4. **All Clients Get Update:**
   - Since all clients use the same codebase
   - All clients automatically get the update
   - Each client's database remains separate

### If You Want to Roll Out Gradually:

**Method 1: Feature Flags (Recommended)**
- Add a feature flag in code
- Check tenant code to enable/disable feature
- Example:
  ```javascript
  if (currentTenant === 'testclient1') {
      // New feature enabled
  } else {
      // Old feature
  }
  ```

**Method 2: Separate Installations**
- Install updated version on specific client's server
- Keep other clients on old version
- Each client manages their own installation

---

## 🧪 Complete Testing Checklist

### Test 1: Customer Management ✅
- [ ] Create customer in Client 1
- [ ] Verify in database: `jewelry_testclient1`
- [ ] Create customer in Client 2
- [ ] Verify in database: `jewelry_testclient2`
- [ ] Verify customers are separate

### Test 2: Product Management ✅
- [ ] Create product in Client 1
- [ ] Verify in database
- [ ] Create product in Client 2
- [ ] Verify in database
- [ ] Verify products are separate

### Test 3: Quotation Generation ✅
- [ ] Generate quotation in Client 1
- [ ] Verify in database
- [ ] Generate quotation in Client 2
- [ ] Verify in database
- [ ] Verify quotations are separate

### Test 4: Bill Generation ✅
- [ ] Generate bill in Client 1
- [ ] Verify in database
- [ ] Generate bill in Client 2
- [ ] Verify in database

### Test 5: Rates Update ✅
- [ ] Update rates in Client 1
- [ ] Verify in database
- [ ] Update rates in Client 2
- [ ] Verify rates are separate per client

### Test 6: Ledger Transactions ✅
- [ ] Create transaction in Client 1
- [ ] Verify in database
- [ ] Create transaction in Client 2
- [ ] Verify transactions are separate

### Test 7: Purchase Vouchers ✅
- [ ] Create PV in Client 1
- [ ] Verify in database
- [ ] Create PV in Client 2
- [ ] Verify PVs are separate

### Test 8: ROL Data ✅
- [ ] Upload ROL data in Client 1
- [ ] Verify in database
- [ ] Upload ROL data in Client 2
- [ ] Verify ROL data is separate

---

## 🔍 Database Verification Commands

### Check All Clients:
```sql
psql -U postgres

-- List all databases
\l

-- Check master database
\c jewelry_master
SELECT * FROM tenants;

-- Check Client 1 database
\c jewelry_testclient1
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM quotations;

-- Check Client 2 database
\c jewelry_testclient2
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM quotations;

\q
```

---

## 🎯 Testing After Code Updates

### When You Update Code:

1. **Before Testing:**
   ```bash
   # Stop server
   # Make code changes
   # Restart server
   npm start
   ```

2. **Test on One Client First:**
   - Login to `testclient1`
   - Test the updated feature
   - Verify it works
   - Check database

3. **If Successful, Test on Other Clients:**
   - Login to `testclient2`
   - Test the same feature
   - Verify it works
   - All clients should work the same

4. **If Issue Found:**
   - Fix the issue
   - Test again on `testclient1`
   - Once fixed, test on all clients

---

## 📊 Monitoring Updates

### Check Which Clients Are Active:

1. **Via Admin Panel:**
   - Go to: `http://localhost:3000/admin.html`
   - Click **"Monitoring"** tab
   - See all clients and their activity

2. **Via Database:**
   ```sql
   psql -U postgres -d jewelry_master
   SELECT tenant_code, tenant_name, created_at FROM tenants;
   \q
   ```

---

## ✅ Testing Summary

### Quick Test Flow:

1. **Start Server** → `npm start`
2. **Create Test Clients** → Admin Panel
3. **Login to Client 1** → Create test data
4. **Verify Database** → Check `jewelry_testclient1`
5. **Login to Client 2** → Create different test data
6. **Verify Isolation** → Check `jewelry_testclient2`
7. **Make Code Update** → Restart server
8. **Test on Client 1** → Verify update works
9. **Test on Client 2** → Verify update works
10. **Deploy to Production** → All clients get update

---

## 🎯 Key Points

- ✅ **All clients share the same codebase**
- ✅ **Each client has separate database**
- ✅ **Code updates affect all clients**
- ✅ **Data remains completely separate**
- ✅ **Test on one client first, then all**

---

**Ready to test!** Follow the steps above to verify everything works correctly.

