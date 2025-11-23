# Master Admin Guide

Complete guide to understanding and using the Master Admin account.

---

## 🎯 What is Master Admin?

**Master Admin** is a special super-user account that has complete control over the entire multi-tenant system. Only the master admin can:

- Create new clients/tenants
- Access the admin panel (`/admin.html`)
- View all clients and their data
- Manage the master database
- Generate API keys
- Monitor all client activity

---

## 👤 Default Master Admin

**Username:** `Gaurav`  
**Password:** Set via `npm run fix-gaurav-password` script

**Default Password:** `@GauravSolanki56789__`

---

## 🔧 Setup Master Admin

### Step 1: Initialize Database

```bash
npm run setup-db
```

This creates the `master_admins` table in the `jewelry_master` database.

### Step 2: Set Master Admin Password

```bash
npm run fix-gaurav-password
```

This script:
- Creates the master admin user "Gaurav" if it doesn't exist
- Sets the password to `@GauravSolanki56789__`
- Hashes the password using bcrypt
- Sets `is_super_admin = true`

### Step 3: Verify Master Admin

```bash
# Connect to database
psql -h localhost -U postgres -d jewelry_master

# Check master admin
SELECT username, is_super_admin FROM master_admins;
```

Should show:
```
 username | is_super_admin
----------+----------------
 Gaurav   | t
```

---

## 🔐 Change Master Admin Password

### Option 1: Using Script (Recommended)

1. **Edit the script:**
   ```bash
   nano scripts/fix-gaurav-password.js
   ```

2. **Change line 16:**
   ```javascript
   const gauravPassword = 'YOUR_NEW_PASSWORD_HERE';
   ```

3. **Run the script:**
   ```bash
   npm run fix-gaurav-password
   ```

### Option 2: Direct Database Update

```bash
# Connect to database
psql -h localhost -U postgres -d jewelry_master

# Hash new password (use Node.js)
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YOUR_NEW_PASSWORD', 10).then(hash => console.log(hash));"

# Update in database (replace HASHED_PASSWORD with output above)
UPDATE master_admins SET password_hash = 'HASHED_PASSWORD' WHERE username = 'Gaurav';
```

---

## 🚪 Access Admin Panel

### In Cloud Setup:

1. **Go to:** `https://software.my925silver.in/admin-login.html`
2. **Enter credentials:**
   - Username: `Gaurav`
   - Password: `@GauravSolanki56789__` (or your custom password)
3. **Click "Login to Admin Panel"**
4. **You'll be redirected to:** `https://software.my925silver.in/admin.html`

### In Local Setup:

1. **Go to:** `http://localhost:3000/admin-login.html`
2. **Enter master admin credentials**
3. **Access admin panel**

---

## 📋 Master Admin Capabilities

### 1. Create New Clients

**In Admin Panel:**
- Click "➕ Create New Client"
- Enter:
  - Tenant Code (e.g., `jpjewellery`)
  - Client Name
  - Admin Username (for that client)
  - Admin Password (for that client)
- Click "Create"

**What Happens:**
- New database created: `jewelry_{tenantCode}`
- Client admin user created
- Client can now login with their tenant code

### 2. View All Clients

**In Admin Panel → Clients Tab:**
- See all created clients
- View client status (Active/Inactive)
- See creation dates
- View database names

### 3. Monitor Client Activity

**In Admin Panel → Monitoring Tab:**
- Total clients count
- Active clients count
- Total databases
- Client activity timeline

### 4. Generate API Keys

**In Admin Panel → API Keys Tab:**
- Generate API keys for monitoring
- View existing API keys
- Manage API key access

### 5. Database Query Interface

**In Admin Panel → Database Tab:**
- Select tenant
- View database tables
- Execute SELECT queries
- View query results

---

## 🔒 Security Features

### Master Admin Security:

1. **Password Hashing:**
   - All passwords stored as bcrypt hashes
   - Never stored in plain text

2. **Session Management:**
   - 24-hour session cookies
   - HTTP-only cookies (can't be accessed by JavaScript)
   - Secure cookies in production (HTTPS only)

3. **Access Control:**
   - Only master admin can access `/admin.html`
   - Regular users redirected to login
   - API endpoints verify master admin credentials

4. **Database Isolation:**
   - Master admin stored in `jewelry_master` database
   - Separate from all tenant databases
   - Cannot be accessed by tenant users

---

## 👥 Master Admin vs Regular Admin

### Master Admin (Gaurav):
- ✅ Can create new clients
- ✅ Can access admin panel
- ✅ Can view all clients
- ✅ Can access any tenant database
- ✅ Stored in `jewelry_master` database
- ✅ Has `is_super_admin = true`

### Regular Admin (Client Admin):
- ❌ Cannot create new clients
- ❌ Cannot access admin panel
- ❌ Can only access their own tenant
- ❌ Stored in tenant database (`jewelry_{tenantCode}`)
- ✅ Can manage users within their tenant
- ✅ Can access all features for their tenant

---

## 🛠️ Troubleshooting

### Cannot Login to Admin Panel:

1. **Check master admin exists:**
   ```bash
   psql -h localhost -U postgres -d jewelry_master
   SELECT * FROM master_admins WHERE username = 'Gaurav';
   ```

2. **Reset password:**
   ```bash
   npm run fix-gaurav-password
   ```

3. **Check password hash:**
   ```bash
   # Should start with $2 (bcrypt hash)
   SELECT password_hash FROM master_admins WHERE username = 'Gaurav';
   ```

### Admin Panel Not Accessible:

1. **Check server is running:**
   ```bash
   pm2 status
   ```

2. **Check Nginx configuration:**
   ```bash
   nginx -t
   systemctl status nginx
   ```

3. **Check firewall:**
   ```bash
   ufw status
   ```

### Forgot Master Admin Password:

1. **Reset using script:**
   ```bash
   npm run fix-gaurav-password
   ```

2. **Or create new master admin:**
   ```bash
   # Connect to database
   psql -h localhost -U postgres -d jewelry_master
   
   # Hash new password
   # (Use Node.js to hash, then update)
   UPDATE master_admins SET password_hash = 'NEW_HASH' WHERE username = 'Gaurav';
   ```

---

## 📝 Best Practices

1. **Change Default Password:**
   - Always change the default password after setup
   - Use a strong, unique password

2. **Limit Access:**
   - Only you should know the master admin password
   - Don't share with clients or employees

3. **Regular Backups:**
   - Backup `jewelry_master` database regularly
   - Master admin is stored there

4. **Monitor Access:**
   - Check admin panel access logs
   - Review client creation activity

5. **Secure Storage:**
   - Store master admin password securely
   - Use password manager if needed

---

## 🔄 Creating Additional Master Admins

Currently, only "Gaurav" is set up as master admin. To create additional master admins:

```sql
-- Connect to database
psql -h localhost -U postgres -d jewelry_master

-- Hash password first (use Node.js)
-- Then insert:
INSERT INTO master_admins (username, password_hash, is_super_admin)
VALUES ('new_admin', 'HASHED_PASSWORD', true);
```

**Note:** Only create additional master admins if absolutely necessary. One master admin is usually sufficient.

---

**Last Updated:** January 2025

