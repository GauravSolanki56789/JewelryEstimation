# 🚀 Client Installation & Testing Guide
## Step-by-Step Instructions for Installing on Client System

---

## 📋 Pre-Installation Checklist

Before starting, ensure you have:
- [ ] Windows/Linux/Mac system
- [ ] Administrator access
- [ ] Internet connection (for initial setup)
- [ ] PostgreSQL installation file (if not installed)

---

## 🎯 PART 1: INSTALLATION (30 minutes)

### Step 1: Install PostgreSQL (10 minutes)

#### Windows:
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. **Important:** Remember the password you set for `postgres` user
4. Default port: `5432` (keep default)
5. Complete installation

**Verify Installation:**
```powershell
# Open PowerShell and test
psql --version
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Verify:**
```bash
sudo systemctl status postgresql
psql --version
```

#### Mac:
```bash
brew install postgresql
brew services start postgresql
```

---

### Step 2: Install Node.js (5 minutes)

1. Download Node.js 18.x or higher from: https://nodejs.org/
2. Run installer
3. Verify installation:
```bash
node --version
npm --version
```

---

### Step 3: Copy Software Files (2 minutes)

1. Copy the entire `JewelryEstimation` folder to client's system
2. Recommended location: `C:\JewelryEstimation` (Windows) or `/opt/jewelry-estimation` (Linux)

---

### Step 4: Install Dependencies (3 minutes)

Open terminal/command prompt in the project folder:

```bash
cd JewelryEstimation
npm install
```

Wait for installation to complete (may take 2-5 minutes).

---

### Step 5: Create Environment File (5 minutes)

Create a file named `.env` in the project root folder:

**Windows (PowerShell):**
```powershell
cd JewelryEstimation
New-Item -Path .env -ItemType File
notepad .env
```

**Linux/Mac:**
```bash
cd JewelryEstimation
touch .env
nano .env
```

**Add this content to `.env`:**
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE
DB_NAME=jewelry_master
PORT=3000

# Master API Key (Generate a secure random string)
MASTER_API_KEY=CHANGE_THIS_TO_RANDOM_STRING
```

**Important:**
- Replace `YOUR_POSTGRES_PASSWORD_HERE` with the password you set during PostgreSQL installation
- Generate Master API Key:
  - **Windows PowerShell:**
    ```powershell
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
    ```
  - **Linux/Mac:**
    ```bash
    openssl rand -hex 32
    ```

---

### Step 6: Create Master Database (3 minutes)

**Windows:**
1. Open "SQL Shell (psql)" from Start Menu
2. Press Enter for all defaults (host, port, database, username)
3. Enter your postgres password when prompted
4. Run:
```sql
CREATE DATABASE jewelry_master;
\q
```

**Linux/Mac:**
```bash
sudo -u postgres psql
CREATE DATABASE jewelry_master;
\q
```

---

### Step 7: Initialize Database (2 minutes)

In the project folder, run:
```bash
npm run setup-db
```

**Expected Output:**
```
✅ Master database initialized
✅ Database setup complete
```

---

### Step 8: Start Server (1 minute)

```bash
npm start
```

**Expected Output:**
```
✅ Server running at http://localhost:3000
📊 Database API available at http://localhost:3000/api
🔐 Multi-tenant architecture enabled
```

**Keep this terminal window open!**

---

## 🎯 PART 2: FIRST-TIME SETUP (10 minutes)

### Step 9: Access Admin Panel

1. Open web browser
2. Go to: `http://localhost:3000/admin.html`
3. You should see the Admin Control Panel

---

### Step 10: Create First Client

1. Click **"Clients"** tab
2. Click **"Create New Client"** button
3. Fill in the form:
   - **Tenant Code:** `client1` (lowercase, no spaces)
   - **Client Name:** `Client Name` (e.g., "JP Jewellery")
   - **Admin Username:** `admin`
   - **Admin Password:** `123456` (change later)
4. Click **"Create"**

**Expected Result:**
- Success message appears
- Client appears in the list
- Database `jewelry_client1` is automatically created

---

### Step 11: Login to Application

1. Open new browser tab
2. Go to: `http://localhost:3000`
3. You'll see login screen
4. Fill in:
   - **Client/Tenant:** Select `client1` (or the tenant code you created)
   - **Username:** `admin`
   - **Password:** `123456`
5. Click **"Sign In"**

**Expected Result:**
- Login successful
- Main application dashboard appears
- All tabs visible

---

## 🧪 PART 3: TESTING (20 minutes)

### Test 1: Create Customer ✅

1. Click **"Customers"** tab
2. Click **"Add Customer"** button
3. Fill in:
   - Name: `Test Customer`
   - Mobile: `1234567890`
   - Address: `123 Test Street`
   - City: `Test City`
4. Click **"Save"**

**Verify:**
- Customer appears in list
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM customers;
  \q
  ```

---

### Test 2: Create Product ✅

1. Click **"Products"** tab
2. Click **"Add Product"** button
3. Fill in:
   - Barcode: `TEST001`
   - SKU: `S`
   - Style Code: `TEST-STYLE`
   - Item Name: `Test Gold Ring`
   - Metal Type: `gold`
   - Weight: `5.5`
   - Purity: `100`
   - Rate: `7500`
   - MC Rate: `100`
4. Click **"Save"**

**Verify:**
- Product appears in search results
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM products WHERE barcode = 'TEST001';
  \q
  ```

---

### Test 3: Generate Quotation ✅

1. Click **"Billing"** tab
2. Select customer: `Test Customer`
3. Scan/enter barcode: `TEST001`
4. Click **"Generate Quote"**
5. Select payment option (Cash or Credit)
6. Click **"Generate PDF"**

**Verify:**
- PDF downloads
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM quotations ORDER BY date DESC LIMIT 1;
  \q
  ```

---

### Test 4: Generate Sales Bill ✅

1. Click **"Sales Bill"** tab
2. Select a quotation
3. Click **"Generate PDF Bill"**

**Verify:**
- PDF downloads
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM bills ORDER BY date DESC LIMIT 1;
  \q
  ```

---

### Test 5: Update Rates ✅

1. Click **"Billing"** tab
2. Click **"Update"** button in Current Rates section
3. Change rates:
   - Gold: `8000`
   - Silver: `160`
   - Platinum: `3600`
4. Click **"Save"**

**Verify:**
- Rates update in display
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1;
  \q
  ```

---

### Test 6: Ledger Transactions ✅

1. Click **"Ledger"** tab
2. Click **"Cash Entry"**
3. Fill in:
   - Type: `Cash In`
   - Amount: `5000`
   - Category: `Sales`
   - Description: `Test transaction`
4. Click **"Save Entry"**

**Verify:**
- Transaction appears in ledger
- Check database:
  ```sql
  psql -U postgres -d jewelry_client1
  SELECT * FROM ledger_transactions ORDER BY date DESC LIMIT 1;
  \q
  ```

---

## ✅ Verification Checklist

After testing, verify all data is in database:

```sql
-- Connect to client database
psql -U postgres -d jewelry_client1

-- Check all tables
\dt

-- Count records
SELECT 'customers' as table_name, COUNT(*) as count FROM customers
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'quotations', COUNT(*) FROM quotations
UNION ALL
SELECT 'bills', COUNT(*) FROM bills
UNION ALL
SELECT 'ledger_transactions', COUNT(*) FROM ledger_transactions
UNION ALL
SELECT 'rates', COUNT(*) FROM rates;

\q
```

**Expected:** All tables should have data from your tests.

---

## 🔧 Troubleshooting

### Problem: "Cannot connect to database"

**Solution:**
1. Check PostgreSQL is running:
   - Windows: Open Services (`services.msc`), find PostgreSQL
   - Linux: `sudo systemctl status postgresql`
2. Verify password in `.env` file
3. Test connection:
   ```bash
   psql -U postgres -d jewelry_master
   ```

---

### Problem: "Port 3000 already in use"

**Solution:**
1. Change PORT in `.env`:
   ```env
   PORT=3001
   ```
2. Restart server
3. Access at `http://localhost:3001`

---

### Problem: "Database does not exist"

**Solution:**
```bash
# Create manually
psql -U postgres
CREATE DATABASE jewelry_master;
\q

# Then run setup
npm run setup-db
```

---

### Problem: "Module not found"

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

---

## 🎯 Production Deployment

### For Production Use:

1. **Change Default Passwords**
   - Change admin password for each client
   - Use strong passwords

2. **Set Up Auto-Start (Windows)**
   - Create a batch file to start server
   - Add to Windows Startup

3. **Set Up Auto-Start (Linux)**
   ```bash
   # Create systemd service
   sudo nano /etc/systemd/system/jewelry-estimation.service
   ```
   Add:
   ```ini
   [Unit]
   Description=Jewelry Estimation Software
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/opt/jewelry-estimation
   ExecStart=/usr/bin/node server.js
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   Then:
   ```bash
   sudo systemctl enable jewelry-estimation
   sudo systemctl start jewelry-estimation
   ```

4. **Set Up Backups**
   ```bash
   # Backup script
   pg_dump -U postgres jewelry_client1 > backup_$(date +%Y%m%d).sql
   ```

---

## 📊 Monitoring

### Check Server Status:
```bash
# Check if server is running
curl http://localhost:3000/api/tenants
```

### Check Database:
```sql
-- List all client databases
psql -U postgres
\l
\q
```

### View Logs:
- Server logs appear in terminal where `npm start` was run
- Check for errors or warnings

---

## ✅ Installation Complete!

Your software is now installed and tested. The client can:
- ✅ Create users, products, customers
- ✅ Generate quotations and bills
- ✅ Manage inventory
- ✅ Track ledger
- ✅ All data saved to database

**Next Steps:**
- Train client users
- Set up regular backups
- Configure auto-start
- Monitor via Admin Panel

---

**Installation Date:** _______________  
**Client Name:** _______________  
**Database Name:** jewelry________________  
**Status:** ✅ Complete

---

**Need Help?** Check [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md) or [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)

