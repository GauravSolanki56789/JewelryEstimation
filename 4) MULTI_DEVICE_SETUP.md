# 4) Multi-Device Setup Guide

This guide explains how to set up the software so multiple devices in the same company can access and share the same data in real-time.

## 🎯 Overview

**Scenario:** Multiple employees in JP Jewellery office need to access the same database from different computers simultaneously.

**Solution:** One computer acts as the server (with PostgreSQL), and all other computers connect to it as clients.

---

## 🏗️ ARCHITECTURE

- **Server Computer:** Runs PostgreSQL database + Application server
- **Client Computers:** Run only the application, connect to server's database
- **Real-Time Sync:** All devices see updates instantly via Socket.IO

---

## 📋 STEP-BY-STEP SETUP

### STEP 1: Setup Server Computer

**Location:** Main office computer (always on)

1. **Install PostgreSQL** on this computer
2. **Install the application** on this computer
3. **Create `.env` file:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   ```
4. **Initialize database:**
   ```powershell
   npm run setup-db
   ```
5. **Note the server's IP address:**
   - Open Command Prompt
   - Type: `ipconfig`
   - Note IPv4 address (e.g., `192.168.1.100`)

6. **Configure PostgreSQL for remote connections:**
   - Edit `postgresql.conf`: Set `listen_addresses = '*'`
   - Edit `pg_hba.conf`: Add `host all all 192.168.1.0/24 md5`
   - Restart PostgreSQL service

7. **Configure Windows Firewall:**
   - Allow port 5432 (PostgreSQL)
   - Allow port 3000 (Application server)

---

### STEP 2: Setup Client Computers

**Location:** Other office computers (staff devices)

1. **Install the application** on each client computer
   - **DO NOT install PostgreSQL** on client computers

2. **Create `.env` file:**
   ```env
   DB_HOST=192.168.1.100
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   ```
   **Replace `192.168.1.100` with your server's IP address**

3. **Test connection:**
   ```powershell
   npm start
   ```
   - Should connect to server database
   - All data should be visible

---

## ✅ VERIFICATION

### On Server Computer:
1. Login to application
2. Create a test product
3. Verify it appears in database

### On Client Computer:
1. Login to application
2. Should see the test product created on server
3. Create another product
4. Server should see it instantly

---

## 🔄 REAL-TIME SYNCHRONIZATION

The application uses Socket.IO for real-time updates:
- When one device creates/updates/deletes data
- All other connected devices see the change instantly
- No page refresh needed

**Supported Real-Time Updates:**
- Products (create, update, delete)
- Customers (create, update, delete)
- Quotations (create, update, delete)
- Bills (create, update, delete)
- Rates (create, update, delete)
- Users (create, update, delete)

---

## ⚠️ IMPORTANT NOTES

1. **Server must be always on** - Client computers need server to be running
2. **Same network required** - All computers must be on same local network
3. **Firewall configuration** - Server must allow connections on ports 5432 and 3000
4. **Database credentials** - All clients use same database credentials
5. **Tenant isolation** - Each tenant's data is still isolated (if multiple tenants)

---

## 🔧 TROUBLESHOOTING

### Client cannot connect to server:
- Check server IP address in `.env` file
- Verify server PostgreSQL is running
- Check firewall settings on server
- Verify both computers on same network

### Connection timeout:
- Check PostgreSQL `pg_hba.conf` configuration
- Verify `listen_addresses` in `postgresql.conf`
- Restart PostgreSQL service

### Data not syncing in real-time:
- Check Socket.IO connection (browser console)
- Verify server is broadcasting updates
- Check network connectivity

---

## 📚 RELATED GUIDES

- **Multi-Server Setup:** See `5) MULTI_SERVER_SETUP.md` for multiple independent servers
- **Sync Workflow:** See `6) SYNC_WORKFLOW.md` for server-to-server sync

---

**Last Updated:** January 2025
