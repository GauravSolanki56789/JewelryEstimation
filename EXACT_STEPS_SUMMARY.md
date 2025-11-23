# ✅ EXACT STEPS SUMMARY
## Complete Checklist for Running and Installing the App

---

## 🎯 PART 1: YOUR SYSTEM (Developer System)

### ✅ STEP 1: Install Node.js
- Download: https://nodejs.org/ (LTS version)
- Install with "Add to PATH" checked
- Verify: `node --version` (should show v18+)

### ✅ STEP 2: Install PostgreSQL
- Download: https://www.postgresql.org/download/windows/
- Install with default settings
- **Remember the postgres password!**
- Verify: `psql --version`

### ✅ STEP 3: Setup Project
```powershell
cd D:\JewelryEstimation
npm install
```

### ✅ STEP 4: Create Database
```powershell
psql -U postgres
```
Then in PostgreSQL:
```sql
CREATE DATABASE jewelry_master;
\q
```

### ✅ STEP 5: Create .env File
Create `.env` in project root:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD
DB_NAME=jewelry_master
PORT=3000
NODE_ENV=development
MASTER_USERNAME=admin
MASTER_PASSWORD=admin123
```

### ✅ STEP 6: Initialize Database
```powershell
npm run setup-db
```

### ✅ STEP 7: Run Application
```powershell
npm run electron
```

### ✅ STEP 8: Verify
- App opens
- Login: `admin` / `admin123`
- Billing tab loads
- **SUCCESS!**

---

## 🎯 PART 2: BUILD INSTALLER FOR CLIENT

### ✅ STEP 1: Clean Build
```powershell
npm run clean
```

### ✅ STEP 2: Build Installer
```powershell
npm run build:win
```

### ✅ STEP 3: Find Installer
- Location: `dist-build\JP Jewellery Estimations Setup 2.0.0.exe`
- **This is the file for clients!**

---

## 🎯 PART 3: CLIENT INSTALLATION

### ✅ STEP 1: Client Installs PostgreSQL
- Download: https://www.postgresql.org/download/windows/
- Install with default settings
- **Client must remember postgres password!**

### ✅ STEP 2: Client Runs Your Installer
- Give client: `JP Jewellery Estimations Setup 2.0.0.exe`
- Client double-clicks and installs
- Follows installation wizard

### ✅ STEP 3: Client Creates Database
```powershell
psql -U postgres
```
Then:
```sql
CREATE DATABASE jewelry_master;
\q
```

### ✅ STEP 4: Client Creates .env File
- Find installation folder (usually in `AppData\Local\Programs\jewelry-estimation\resources\app`)
- Create `.env` file with:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=CLIENT_POSTGRES_PASSWORD
DB_NAME=jewelry_master
PORT=3000
NODE_ENV=production
```

### ✅ STEP 5: Client Runs Application
- Double-click desktop shortcut
- Or find in Start Menu
- **Server starts automatically!**

### ✅ STEP 6: Client Logs In
- Username: `admin`
- Password: `admin123`
- Tenant Code: (leave empty)

### ✅ STEP 7: Verify Client Installation
- App opens without errors
- Can login
- Billing tab works
- Can create products/customers
- **SUCCESS!**

---

## 📋 CHECKLIST

### Your System:
- [ ] Node.js installed
- [ ] PostgreSQL installed
- [ ] Project dependencies installed
- [ ] Database created
- [ ] .env file created
- [ ] Database initialized
- [ ] App runs successfully

### Installer:
- [ ] Build completed
- [ ] Installer file exists
- [ ] Tested installer on your system

### Client System:
- [ ] PostgreSQL installed
- [ ] Application installed
- [ ] Database created
- [ ] .env file created
- [ ] Application runs
- [ ] Login works
- [ ] All features work

---

## 🎉 SUCCESS CRITERIA

**Your System:**
- ✅ App runs with `npm run electron`
- ✅ No errors
- ✅ Can login and use all features

**Client System:**
- ✅ App opens from Start Menu
- ✅ Server starts automatically
- ✅ No "Server timeout" errors
- ✅ Can login and use all features

---

## 📚 DETAILED GUIDES

For more details, read:
1. `1) YOUR_SYSTEM_SETUP.md` - Complete your system setup
2. `2) CLIENT_INSTALLATION_GUIDE.md` - Complete client installation
3. `3) BUILDING_INSTALLER.md` - Complete installer build guide

---

**Last Updated:** January 2025  
**Version:** 2.0.0

