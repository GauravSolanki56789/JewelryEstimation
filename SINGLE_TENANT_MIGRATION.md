# Single-Tenant Architecture Migration Summary

This document summarizes all changes made to convert the Jewelry Estimation software from Multi-Tenant SaaS to Single-Tenant architecture for dedicated VPS deployment.

---

## Changes Overview

### Phase 1: Architectural Refactoring

#### 1. Database Configuration (`config/database.js`)
- **Removed**: Multi-tenant connection pools (`tenantPools`, `createTenantDatabase`)
- **Removed**: Master database separation (`masterPool`)
- **Added**: Single database connection using `DATABASE_URL` or individual env vars
- **Updated**: `getTenantPool()` and `queryTenant()` now ignore tenant code (backward compatible)
- **Updated**: `initDatabase()` initializes single database schema

#### 2. Server Routes (`server.js`)
- **Removed**: Tenant parameter from all API routes (`/api/:tenant/products` → `/api/products`)
- **Added**: Backward-compatible routes that accept tenant parameter but ignore it
- **Added**: `/api/update-software` endpoint for self-update feature
- **Updated**: Login API - no longer requires tenant code
- **Updated**: Socket.IO - all clients join single "main" room

#### 3. Middleware (`middleware/rbac.js`)
- **Simplified**: `verifyTenantAccess()` - just checks authentication, ignores tenant
- **Unchanged**: `checkRole()` and `checkAuth()` work as before

#### 4. Passport Configuration (`config/passport.js`)
- **Updated**: Uses single `pool` instead of `masterPool`
- **Removed**: Tenant code assignment on deserialize

---

### Phase 2: Self-Updater Engine

#### 1. Update Script (`update.sh`)
- Created bash script for pulling updates from GitHub
- Handles: `git pull`, `npm install`, `pm2 restart`
- Logs all operations with timestamps

#### 2. Server API (`server.js`)
- **Added**: `POST /api/update-software` endpoint
- **Updated**: `GET /api/update/check` for version checking
- Admin-only access for update operations

#### 3. Frontend (`public/index.html`)
- **Updated**: `checkForUpdates()` function
- **Added**: `updateSoftware()` function for VPS self-update
- Button triggers GitHub pull + PM2 restart

---

### Phase 3: Billing Logic Audit

#### Silver Rate Discount (3%)
- **Verified**: 3% discount applies ONLY to Silver Rate
- **Applied When**: Rate slab is R1, R2, R3, or R4 (wholesale slabs)
- **Formula**: `metalRate = metalRate * 0.97`

#### Making Charges (MC)
- **Fixed**: MC is now completely ABSOLUTE
- **Removed**: Rate slab discounts on MC (previously ₹2-15/gm deductions)
- **Updated**: `getAdjustedMCRate()` now returns original MC unchanged
- **Updated**: Rate slab descriptions no longer mention MC discounts

---

### Phase 4: Production Configuration

#### PM2 Configuration (`ecosystem.config.js`)
- App name: `gaurav-app`
- Mode: Fork (single instance)
- Auto-restart enabled
- Log files configured
- Memory limit: 500MB

---

### Phase 5: Database Migration

#### SQL Script (`setup_single_tenant.sql`)
- Drops old multi-tenant tables (`tenants`, `master_admins`, `api_keys`)
- Creates standard tables without tenant columns
- Creates indexes for performance
- Inserts default super admin: `jaigaurav56789@gmail.com`
- Inserts default rates and Tally config

---

## API Changes Summary

| Old Route | New Route | Notes |
|-----------|-----------|-------|
| `/api/:tenant/products` | `/api/products` | Tenant param ignored |
| `/api/:tenant/customers` | `/api/customers` | Tenant param ignored |
| `/api/:tenant/bills` | `/api/bills` | Tenant param ignored |
| `/api/:tenant/quotations` | `/api/quotations` | Tenant param ignored |
| `/api/:tenant/rates` | `/api/rates` | Tenant param ignored |
| `/api/auth/login` | `/api/auth/login` | No tenant code required |
| N/A | `/api/update-software` | NEW - Self-update trigger |

**Note**: Old routes with `:tenant` parameter still work for backward compatibility.

---

## Environment Variables

```env
# Required
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/jewelry_db
SESSION_SECRET=your-secret

# Optional
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://domain.com/auth/google/callback
GITHUB_REPO=username/repo
COMPANY_NAME="Your Store"
```

---

## Deployment Quick Start

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/jewelry-app.git
cd jewelry-app

# 2. Install dependencies
npm install --production

# 3. Configure environment
cp env.production.example .env
nano .env

# 4. Setup database
psql -U postgres -d jewelry_db -f setup_single_tenant.sql

# 5. Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save

# 6. Set admin password
node scripts/change-master-password.js
```

---

## Version

- **Previous Version**: 2.0.0 (Multi-Tenant)
- **Current Version**: 2.1.0 (Single-Tenant)

---

## Files Modified

1. `config/database.js` - Single database connection
2. `config/passport.js` - Simplified auth
3. `middleware/rbac.js` - Removed tenant verification
4. `server.js` - Single-tenant API routes + self-update
5. `public/index.html` - Updated login, API calls, update function
6. `package.json` - Version bump, new scripts

## Files Created

1. `update.sh` - Self-update bash script
2. `ecosystem.config.js` - PM2 configuration
3. `setup_single_tenant.sql` - Fresh database setup
4. `env.production.example` - Environment template
5. `DEPLOYMENT.md` - Deployment guide
6. `SINGLE_TENANT_MIGRATION.md` - This document
