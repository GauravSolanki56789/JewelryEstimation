# ⚡ QUICK START - Fast Reference

## 🎯 FOR YOU (Developer)

### First Time Setup:
```powershell
# 1. Install Node.js (if not installed)
# Download from: https://nodejs.org/

# 2. Install PostgreSQL (if not installed)
# Download from: https://www.postgresql.org/download/

# 3. Setup project
cd D:\JewelryEstimation
npm install

# 4. Create database
psql -U postgres
CREATE DATABASE jewelry_master;
\q

# 5. Create .env file (see 1) YOUR_SYSTEM_SETUP.md)

# 6. Initialize database
npm run setup-db

# 7. Run app
npm run electron
```

### Daily Use:
```powershell
npm run electron
```
That's it! Server starts automatically.

---

## 🎯 FOR CLIENT

### Installation:
1. Install PostgreSQL (see `2) CLIENT_INSTALLATION_GUIDE.md`)
2. Run installer: `JP Jewellery Estimations Setup 2.0.0.exe`
3. Create database and `.env` file
4. Open application from Start Menu
5. Login and use!

---

## 📚 FULL GUIDES

- **Your Setup:** `1) YOUR_SYSTEM_SETUP.md`
- **Client Setup:** `2) CLIENT_INSTALLATION_GUIDE.md`
- **Build Installer:** `3) BUILDING_INSTALLER.md`

---

**Need help?** Read the numbered guides in order!

