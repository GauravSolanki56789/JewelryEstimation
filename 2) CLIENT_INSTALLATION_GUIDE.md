# 2) CLIENT INSTALLATION GUIDE
## Complete Step-by-Step Guide for Installing on Client Systems

---

## 📋 WHAT CLIENT NEEDS

Before installation, client must have:
- ✅ Windows 10/11 computer
- ✅ Administrator access
- ✅ Internet connection (for initial setup)
- ✅ PostgreSQL installed (we'll guide them)

---

## 🎯 INSTALLATION PROCESS (30-45 minutes)

### STEP 1: Install PostgreSQL on Client System (15 minutes)

1. **Download PostgreSQL:**
   - Go to: https://www.postgresql.org/download/windows/
   - Download PostgreSQL 12 or higher
   - Run installer

2. **Installation Settings:**
   - Port: **5432** (keep default)
   - Username: **postgres**
   - **Password:** Client should set a strong password
   - **IMPORTANT:** Client must remember this password!

3. **Verify Installation:**
   - Open PowerShell
   - Run: `psql --version`
   - Should show version number

---

### STEP 2: Install Your Application (5 minutes)

1. **Give Client the Installer:**
   - File: `JP Jewellery Estimations Setup 2.0.0.exe`
   - Location: `dist-build` folder in your project

2. **Client Runs Installer:**
   - Double-click the `.exe` file
   - Follow installation wizard
   - Choose installation location (default is fine)
   - Complete installation

3. **Application Installed:**
   - Client can find it in Start Menu
   - Or desktop shortcut

---

### STEP 3: Configure Database (10 minutes)

1. **Create Database:**
   - Client opens PowerShell
   - Run: `psql -U postgres`
   - Enter postgres password
   - Run:
     ```sql
     CREATE DATABASE jewelry_master;
     \q
     ```

2. **Create .env File:**
   - Navigate to installation folder (usually `C:\Users\[Username]\AppData\Local\Programs\jewelry-estimation\resources\app`)
   - Or find `.exe` file location
   - Create file named `.env` in the `app` folder
   - Add:
     ```env
     DB_HOST=localhost
     DB_PORT=5432
     DB_USER=postgres
     DB_PASSWORD=CLIENT_POSTGRES_PASSWORD
     DB_NAME=jewelry_master
     PORT=3000
     NODE_ENV=production
     ```
   - **Replace `CLIENT_POSTGRES_PASSWORD` with client's PostgreSQL password**

---

### STEP 4: First Run (5 minutes)

1. **Client Opens Application:**
   - Double-click desktop shortcut
   - Or find in Start Menu: "JP Jewellery Estimations"

2. **Application Starts:**
   - Server starts automatically
   - Window opens with login screen

3. **First Login:**
   - Username: `admin`
   - Password: `admin123` (client should change this)
   - Tenant Code: Leave empty (for master admin)

4. **Create Client Account:**
   - Go to Admin Panel (if available)
   - Or use master admin to create tenant

---

## ✅ VERIFICATION CHECKLIST

After installation, verify:

- [ ] Application opens without errors
- [ ] Login screen appears
- [ ] Can login with admin credentials
- [ ] Billing tab loads
- [ ] No "Server timeout" errors
- [ ] Can create products
- [ ] Can create customers
- [ ] Database connection works

---

## 🔧 TROUBLESHOOTING FOR CLIENT

### Problem: "Server timeout" error
**Solution:**
- Check PostgreSQL is running
- Verify `.env` file exists and has correct password
- Check port 3000 is not in use

### Problem: "Cannot connect to database"
**Solution:**
- Verify PostgreSQL is installed and running
- Check `.env` file has correct password
- Test: `psql -U postgres -d jewelry_master`

### Problem: Application won't start
**Solution:**
- Check Windows Event Viewer for errors
- Verify Node.js is not required (it's bundled)
- Reinstall application

### Problem: "Port 3000 already in use"
**Solution:**
- Close other applications using port 3000
- Or change PORT in `.env` file

---

## 📞 SUPPORT FOR CLIENT

If client has issues:
1. Check PostgreSQL is running
2. Verify `.env` file configuration
3. Check application logs
4. Contact you for support

---

## 🎉 SUCCESS!

If client can:
- ✅ Open application
- ✅ Login successfully
- ✅ Use billing tab
- ✅ Create products/customers

**Installation is complete!**

---

## 📝 POST-INSTALLATION

### Security Recommendations:
1. **Change Default Passwords:**
   - Master admin password
   - PostgreSQL postgres password

2. **Create Client-Specific Users:**
   - Don't share admin credentials
   - Create separate users for each staff member

3. **Regular Backups:**
   - Backup PostgreSQL database regularly
   - Store backups securely

---

## 🔄 Multi-Device Setup (For Multiple Computers)

If your company has multiple computers and you want all of them to share the same data:

**📖 See:** `4) MULTI_DEVICE_SETUP.md` for complete instructions

**Quick Overview:**
- One computer acts as the server (has PostgreSQL + application)
- Other computers connect to the server's database
- All data automatically syncs in real-time across all devices
- When one computer creates a product/customer, it appears on all other computers instantly!

---

**Last Updated:** January 2025  
**Version:** 2.0.0

