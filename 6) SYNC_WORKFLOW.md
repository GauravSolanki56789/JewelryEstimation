# 6) Multi-Server Sync Workflow

Quick reference guide for daily synchronization between your 4 servers.

## 🎯 Your Servers

1. **Main Server** - Primary (always on)
2. **JP Office Server** - Office location
3. **Remote Location Server** - Staff location
4. **Mobile Server** - Vinay's laptop (exhibitions)

---

## 📅 DAILY SYNC WORKFLOW

### Morning (Pull Latest Data)

**On Office Server:**
```powershell
# Pull latest data from main server
$env:SOURCE_DB_HOST="MAIN_SERVER_IP"
$env:SOURCE_DB_USER="postgres"
$env:SOURCE_DB_PASSWORD="password"
$env:DEST_DB_HOST="localhost"
$env:DEST_DB_USER="postgres"
$env:DEST_DB_PASSWORD="password"
$env:TENANT_CODE="jpjewellery"
npm run sync-db
```

**On Remote Location Server:**
```powershell
# Same as above (pull from main server)
npm run sync-db
```

**On Mobile Server (if connected):**
```powershell
# Same as above (pull from main server)
npm run sync-db
```

---

### During Day

- Each server works independently
- All data stored locally
- No sync needed

---

### Evening (Push Today's Data)

**On Office Server:**
```powershell
# Push today's data to main server
$env:SOURCE_DB_HOST="localhost"
$env:DEST_DB_HOST="MAIN_SERVER_IP"
npm run sync-db
```

**On Remote Location Server:**
```powershell
# Push today's data to main server
$env:SOURCE_DB_HOST="localhost"
$env:DEST_DB_HOST="MAIN_SERVER_IP"
npm run sync-db
```

**On Main Server:**
```powershell
# After receiving all data, merge and prepare for next day
# Main server now has all data from all locations
```

---

### Weekly (Distribute Complete Data)

**On Main Server:**
```powershell
# Push complete merged data to all servers
# Office Server
$env:SOURCE_DB_HOST="localhost"
$env:DEST_DB_HOST="OFFICE_SERVER_IP"
npm run sync-db

# Remote Location Server
$env:DEST_DB_HOST="REMOTE_SERVER_IP"
npm run sync-db
```

---

## 🚗 MOBILE SERVER (Exhibition/Trade Shows)

### Before Exhibition:

1. **Sync with Main Server:**
   ```powershell
   # Pull latest data
   npm run sync-db
   ```

2. **Or Create Backup:**
   ```powershell
   # On main server
   npm run backup-db
   # Copy backup file to USB drive
   ```

### During Exhibition:

- Works completely offline
- All data stored locally
- No internet needed

### After Exhibition:

**Option 1: Network Sync (If Connected)**
```powershell
# Push exhibition data to main server
$env:SOURCE_DB_HOST="localhost"
$env:DEST_DB_HOST="MAIN_SERVER_IP"
npm run sync-db
```

**Option 2: USB Backup/Restore**
```powershell
# On mobile server - Create backup
npm run backup-db

# Copy backup file to USB
# On main server - Restore backup
npm run restore-db backups/jewelry_jpjewellery_DATE.sql
```

---

## 🔄 QUICK SYNC COMMANDS

### Create Sync Script: `sync-to-main.ps1`

```powershell
# Sync this server to main server
$env:SOURCE_DB_HOST="localhost"
$env:SOURCE_DB_USER="postgres"
$env:SOURCE_DB_PASSWORD="YOUR_PASSWORD"
$env:SOURCE_DB_NAME="jewelry_master"
$env:DEST_DB_HOST="MAIN_SERVER_IP"
$env:DEST_DB_USER="postgres"
$env:DEST_DB_PASSWORD="MAIN_PASSWORD"
$env:DEST_DB_NAME="jewelry_master"
$env:TENANT_CODE="jpjewellery"
npm run sync-db
```

### Create Pull Script: `pull-from-main.ps1`

```powershell
# Pull from main server to this server
$env:SOURCE_DB_HOST="MAIN_SERVER_IP"
$env:SOURCE_DB_USER="postgres"
$env:SOURCE_DB_PASSWORD="MAIN_PASSWORD"
$env:SOURCE_DB_NAME="jewelry_master"
$env:DEST_DB_HOST="localhost"
$env:DEST_DB_USER="postgres"
$env:DEST_DB_PASSWORD="YOUR_PASSWORD"
$env:DEST_DB_NAME="jewelry_master"
$env:TENANT_CODE="jpjewellery"
npm run sync-db
```

---

## 📋 SYNC CHECKLIST

### Daily:
- [ ] Office server pulls from main (morning)
- [ ] Remote server pulls from main (morning)
- [ ] Office server pushes to main (evening)
- [ ] Remote server pushes to main (evening)

### Weekly:
- [ ] Main server pushes complete data to all servers
- [ ] Verify all servers have same data

### After Exhibition:
- [ ] Mobile server syncs with main server
- [ ] Verify exhibition data in main server

---

## ⚠️ IMPORTANT NOTES

1. **Always backup before syncing** (especially first time)
2. **Sync conflicts:** Last sync wins (or manual resolution)
3. **Network required:** For automated sync (office/remote servers)
4. **Offline support:** Mobile server works offline, syncs when connected
5. **Same tenant code:** All servers must use `jpjewellery` tenant code

---

**Last Updated:** January 2025

