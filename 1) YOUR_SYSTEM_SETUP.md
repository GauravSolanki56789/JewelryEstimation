# 1) YOUR SYSTEM SETUP GUIDE
## Complete Step-by-Step Guide to Run the App on Your System

---

## 📋 PREREQUISITES

Before starting, ensure you have:
- ✅ Windows 10/11 (or Linux/Mac)
- ✅ Administrator access
- ✅ Internet connection
- ✅ Node.js 18.x or higher
- ✅ PostgreSQL 12.x or higher

---

## 🚀 STEP 1: Install Node.js (5 minutes)

1. **Download Node.js:**
   - Go to: https://nodejs.org/
   - Download **LTS version** (18.x or higher)
   - Run the installer
   - **Important:** Check "Add to PATH" during installation

2. **Verify Installation:**
   ```powershell
   node --version
   npm --version
   ```
   Should show version numbers (e.g., v18.17.0)

---

## 🗄️ STEP 2: Install PostgreSQL (10 minutes)

### Windows:
1. **Download:**
   - Go to: https://www.postgresql.org/download/windows/
   - Download PostgreSQL 12 or higher
   - Run the installer

2. **Installation Settings:**
   - Port: **5432** (keep default)
   - Username: **postgres** (default)
   - **Password:** Set a strong password and **REMEMBER IT!**
   - Complete installation

3. **Verify Installation:**
   ```powershell
   psql --version
   ```

### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Mac:
```bash
brew install postgresql
brew services start postgresql
```

---

## 📦 STEP 3: Setup Project (5 minutes)

1. **Navigate to Project Folder:**
   ```powershell
   cd D:\JewelryEstimation
   ```

2. **Install Dependencies:**
   ```powershell
   npm install
   ```
   Wait for installation to complete (2-5 minutes)

---

## ⚙️ STEP 4: Configure Database (10 minutes)

1. **Create Master Database:**
   ```powershell
   # Open PostgreSQL command line
   psql -U postgres
   ```
   
   Enter your postgres password when prompted.

2. **Create Database:**
   ```sql
   CREATE DATABASE jewelry_master;
   \q
   ```

3. **Create .env File:**
   Create a file named `.env` in the project root with:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=YOUR_POSTGRES_PASSWORD
   DB_NAME=jewelry_master
   
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   
   # Master Admin (for creating clients)
   MASTER_USERNAME=admin
   MASTER_PASSWORD=admin123
   ```

   **Replace `YOUR_POSTGRES_PASSWORD` with your actual PostgreSQL password!**

4. **Initialize Database:**
   ```powershell
   npm run setup-db
   ```
   This creates all necessary tables.

---

## 🎯 STEP 5: Run the Application (2 minutes)

### Option A: Run as Electron App (Recommended)
```powershell
npm run electron
```
This opens the app in a desktop window. **Server starts automatically!**

### Option B: Run as Web App
```powershell
npm start
```
Then open browser: `http://localhost:3000`

---

## ✅ STEP 6: Verify It Works

1. **App should open** (if using Electron) or open browser to `http://localhost:3000`

2. **Login:**
   - Username: `admin`
   - Password: `admin123`
   - Tenant Code: Leave empty (for master admin)

3. **You should see:**
   - Billing tab
   - All menu buttons
   - No errors

---

## 🔧 TROUBLESHOOTING

### Problem: "Cannot connect to database"
**Solution:**
- Check PostgreSQL is running
- Verify `.env` file has correct password
- Test connection: `psql -U postgres -d jewelry_master`

### Problem: "Port 3000 already in use"
**Solution:**
- Change PORT in `.env` to another number (e.g., 3001)
- Or close the application using port 3000

### Problem: "npm install fails"
**Solution:**
- Check Node.js version: `node --version` (should be 18+)
- Delete `node_modules` folder and `package-lock.json`
- Run `npm install` again

### Problem: "Server timeout" in Electron
**Solution:**
- Check PostgreSQL is running
- Verify database connection in `.env`
- Check console for error messages

---

## 🎉 SUCCESS!

If you can login and see the billing tab, **your system is ready!**

**Next Steps:**
- Read: `2) CLIENT_INSTALLATION_GUIDE.md` to install on client systems
- Read: `3) BUILDING_INSTALLER.md` to create installer for clients

---

**Last Updated:** January 2025  
**Version:** 2.0.0

