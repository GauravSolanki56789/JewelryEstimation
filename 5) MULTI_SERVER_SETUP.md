# 5) Multi-Server Setup Guide

Complete guide for setting up multiple servers that can work independently and synchronize data.

## 🎯 Your Architecture

1. **Main Permanent Server** - Your primary server (always on)
2. **JP Office Server** - Permanent server at JP Jewellery office
3. **Remote Location Server** - Server for staff in another location
4. **Mobile/Exhibition Server** - Portable server (e.g., Vinay's laptop) for trade shows

---

## 📋 Overview

**How It Works:**
- Each server has its own PostgreSQL database
- Each server can work independently
- Data can be synchronized between servers when connected
- Mobile server can sync when back at office or connected to internet

**Synchronization Options:**
- **Option A:** Manual sync via database backup/restore (Simple, reliable)
- **Option B:** Automated sync via API (Advanced, requires network connection)
- **Option C:** PostgreSQL replication (Most advanced, requires constant connection)

---

## 🏗️ STEP-BY-STEP SETUP

### STEP 1: Setup Main Permanent Server

**Location:** Your primary location (always on)

1. **Install PostgreSQL** on the server computer
2. **Install the application** on the server computer
3. **Create `.env` file:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=main-server
   SERVER_NAME=Main Permanent Server
   ```
4. **Initialize database:**
   ```powershell
   npm run setup-db
   ```
5. **Start the server:**
   ```powershell
   npm start
   ```
6. **Note the server's IP address:**
   - Open Command Prompt
   - Type: `ipconfig`
   - Note IPv4 address (e.g., `192.168.1.100`)

**This is your PRIMARY server - all other servers will sync with this one.**

---

### STEP 2: Setup JP Office Server

**Location:** JP Jewellery office (permanent)

1. **Install PostgreSQL** on the office server computer
2. **Install the application** on the office server computer
3. **Create `.env` file:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=jp-office-server
   SERVER_NAME=JP Office Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   ```
   **Replace `MAIN_SERVER_IP` with your main server's IP address**

4. **Initialize database:**
   ```powershell
   npm run setup-db
   ```

5. **Create the same tenant (jpjewellery):**
   - Login to office server as master admin (Gaurav)
   - Create tenant: `jpjewellery` (or use existing tenant code)
   - This ensures both servers have the same tenant structure

6. **Setup sync script** (see Step 6 below)

---

### STEP 3: Setup Remote Location Server

**Location:** Staff location (far from office)

1. **Install PostgreSQL** on the remote server computer
2. **Install the application** on the remote server computer
3. **Create `.env` file:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=remote-location-server
   SERVER_NAME=Remote Location Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   ```
   **Replace `MAIN_SERVER_IP` with your main server's IP address**

4. **Initialize database:**
   ```powershell
   npm run setup-db
   ```

5. **Create the same tenant (jpjewellery):**
   - Login as master admin
   - Create tenant: `jpjewellery`

6. **Setup sync script** (see Step 6 below)

---

### STEP 4: Setup Mobile/Exhibition Server

**Location:** Vinay's laptop (portable, for trade shows)

1. **Install PostgreSQL** on Vinay's laptop
2. **Install the application** on Vinay's laptop
3. **Create `.env` file:**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=mobile-exhibition-server
   SERVER_NAME=Mobile Exhibition Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   ```
   **Replace `MAIN_SERVER_IP` with your main server's IP address**

4. **Initialize database:**
   ```powershell
   npm run setup-db
   ```

5. **Create the same tenant (jpjewellery):**
   - Login as master admin
   - Create tenant: `jpjewellery`

6. **Setup sync script** (see Step 6 below)

**Note:** This server works offline during exhibitions, then syncs when connected.

---

### STEP 5: Network Configuration

#### For Servers on Same Network (Office + Remote):

1. **On Main Server:**
   - Allow PostgreSQL remote connections (port 5432)
   - Allow application server (port 3000)
   - Configure firewall

2. **On Office/Remote Servers:**
   - Can connect to main server via local network IP
   - Or use VPN if remote

#### For Mobile/Exhibition Server:

- **Works offline** during exhibitions
- **Syncs when connected** to internet/network
- Can sync via:
  - Direct network connection (when at office)
  - Internet connection (if main server is accessible)
  - USB/External drive (manual sync)

---

### STEP 6: Data Synchronization Setup

#### Method 1: Database Sync Script (Recommended)

**✅ Already Created:** `scripts/sync-database.js`

**Usage:**
```powershell
# Set environment variables
$env:SOURCE_DB_HOST="192.168.1.100"  # Source server IP
$env:SOURCE_DB_USER="postgres"
$env:SOURCE_DB_PASSWORD="password"
$env:DEST_DB_HOST="localhost"        # Destination server (this computer)
$env:DEST_DB_USER="postgres"
$env:DEST_DB_PASSWORD="password"
$env:TENANT_CODE="jpjewellery"

# Run sync
npm run sync-db
```

#### Method 2: Database Backup/Restore (For Mobile Server)

**✅ Already Created:** `scripts/backup-database.js` and `scripts/restore-database.js`

**Usage:**
```powershell
# Create backup
npm run backup-db

# Restore backup
npm run restore-db backups/jewelry_jpjewellery_2025-01-23.sql
```

#### Method 3: API Sync (Automated)

**✅ Already Created:** API endpoints in server.js

**Endpoints:**
- `POST /api/sync/push` - Push data to server
- `POST /api/sync/pull` - Pull data from server

---

### STEP 7: Daily Operations

#### Normal Operation:
- Each server works independently
- Staff at each location uses their local server
- Data is stored locally on each server

#### Synchronization (Daily/Weekly):
1. **Office Server → Main Server:**
   - Run sync script daily
   - Office data syncs to main server

2. **Remote Location Server → Main Server:**
   - Run sync script when connected
   - Remote data syncs to main server

3. **Mobile Server → Main Server:**
   - After exhibition/trade show
   - Connect to network
   - Run sync script
   - Exhibition data syncs to main server

4. **Main Server → All Other Servers:**
   - After syncing all data to main server
   - Run reverse sync to update all other servers
   - All servers now have latest data

---

## 🔄 SYNCHRONIZATION WORKFLOW

### Daily Workflow:

**Morning:**
1. Office server syncs with main server (pull latest data)
2. Remote location server syncs with main server (pull latest data)
3. Mobile server syncs if connected (pull latest data)

**During Day:**
- Each server works independently
- All data stored locally

**Evening:**
1. Office server syncs with main server (push today's data)
2. Remote location server syncs with main server (push today's data)
3. Main server merges all data

**Weekly:**
1. Main server syncs back to all other servers
2. All servers have complete, merged data

---

## 📝 DETAILED SETUP INSTRUCTIONS

### A. Main Server Setup (Complete)

**Location:** Your primary location

1. **Hardware Requirements:**
   - Always-on computer or dedicated server
   - Stable internet connection
   - Sufficient storage for all data

2. **Software Setup:**
   ```powershell
   # Install PostgreSQL
   # Install Node.js
   # Install application
   
   # Create .env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_secure_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=main-server
   SERVER_NAME=Main Permanent Server
   
   # Initialize
   npm run setup-db
   
   # Start (or use installed app)
   npm start
   ```

3. **Network Configuration:**
   - Configure firewall to allow port 3000 and 5432
   - Note the public IP (if accessible from internet) or local IP
   - Set up port forwarding if needed

4. **Create Tenant:**
   - Login as Gaurav
   - Create tenant: `jpjewellery`
   - Set admin credentials

---

### B. JP Office Server Setup

**Location:** JP Jewellery office

1. **Hardware:**
   - Office computer (always on during business hours)
   - Local network connection

2. **Software Setup:**
   ```powershell
   # Install PostgreSQL
   # Install application
   
   # Create .env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=office_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=jp-office-server
   SERVER_NAME=JP Office Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   
   # Initialize
   npm run setup-db
   ```

3. **Create Same Tenant:**
   - Login as Gaurav
   - Create tenant: `jpjewellery` (same code as main server)
   - Use same admin credentials

4. **Test Connection:**
   - Verify can connect to main server (if on same network)
   - Test sync script

---

### C. Remote Location Server Setup

**Location:** Staff location (far from office)

1. **Hardware:**
   - Computer at remote location
   - Internet connection (for sync)

2. **Software Setup:**
   ```powershell
   # Install PostgreSQL
   # Install application
   
   # Create .env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=remote_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=remote-location-server
   SERVER_NAME=Remote Location Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   
   # Initialize
   npm run setup-db
   ```

3. **Create Same Tenant:**
   - Login as Gaurav
   - Create tenant: `jpjewellery`

4. **Sync Setup:**
   - Can sync via internet (if main server accessible)
   - Or sync via VPN
   - Or manual sync when visiting office

---

### D. Mobile/Exhibition Server Setup

**Location:** Vinay's laptop (portable)

1. **Hardware:**
   - Laptop with PostgreSQL installed
   - Portable, can work offline

2. **Software Setup:**
   ```powershell
   # Install PostgreSQL
   # Install application
   
   # Create .env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=mobile_password
   DB_NAME=jewelry_master
   PORT=3000
   SERVER_ID=mobile-exhibition-server
   SERVER_NAME=Mobile Exhibition Server
   SYNC_SERVER_URL=http://MAIN_SERVER_IP:3000
   
   # Initialize
   npm run setup-db
   ```

3. **Create Same Tenant:**
   - Login as Gaurav
   - Create tenant: `jpjewellery`

4. **Offline Operation:**
   - Works completely offline during exhibitions
   - All data stored locally
   - Sync when back at office or connected

---

## 🔄 SYNCHRONIZATION METHODS

### Method 1: Database Backup/Restore (Simple & Reliable)

**Pros:**
- Simple to implement
- Reliable
- Works offline
- Can use USB/external drive

**Cons:**
- Manual process
- Requires downtime during sync

**Implementation:**
```powershell
# Export from source server
pg_dump -U postgres -h localhost jewelry_master > backup.sql

# Import to destination server
psql -U postgres -h localhost jewelry_master < backup.sql
```

---

### Method 2: API-Based Sync (Automated)

**Pros:**
- Automated
- Can run in background
- Real-time or scheduled

**Cons:**
- Requires network connection
- More complex to implement

**Implementation:**
- Create sync API endpoints
- Push/pull data via HTTP
- Merge data intelligently

---

### Method 3: PostgreSQL Replication (Advanced)

**Pros:**
- Automatic replication
- Real-time sync
- Professional solution

**Cons:**
- Complex setup
- Requires constant connection
- Not suitable for mobile server

---

## 📋 RECOMMENDED APPROACH

**For Your Use Case:**

1. **Main Server:** Primary database, always synced
2. **Office Server:** Sync daily with main server
3. **Remote Server:** Sync when connected (daily/weekly)
4. **Mobile Server:** Sync after exhibitions (manual or when connected)

**Sync Strategy:**
- Use **Method 1 (Backup/Restore)** for mobile server
- Use **Method 2 (API Sync)** for office and remote servers (if network available)
- All servers sync TO main server first
- Then main server syncs back TO all other servers

---

## 🛠️ SYNC TOOLS (Already Created)

✅ **Database sync script:** `scripts/sync-database.js` - Syncs data between servers
✅ **Database backup script:** `scripts/backup-database.js` - Creates backup files
✅ **Database restore script:** `scripts/restore-database.js` - Restores from backup
✅ **API sync endpoints:** `/api/sync/push` and `/api/sync/pull` - Automated sync

**See `6) SYNC_WORKFLOW.md` for detailed daily sync procedures.**

---

## ⚠️ IMPORTANT NOTES

1. **Same Tenant Code:** All servers must use the same tenant code (`jpjewellery`)
2. **Data Conflicts:** Sync script must handle conflicts (last write wins, or manual resolution)
3. **Backup:** Always backup before syncing
4. **Network:** Office and remote servers need network access to main server for automated sync
5. **Mobile Server:** Can work completely offline, syncs when connected

---

**Last Updated:** January 2025  
**Version:** 2.0.0

