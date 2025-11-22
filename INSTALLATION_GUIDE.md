# Installation Guide
## JP Jewellery Estimations - Multi-Tenant Software

---

## 🚀 Quick Installation

### Prerequisites
- Node.js 18.x or higher
- PostgreSQL 12.x or higher
- npm or yarn

### Step 1: Install PostgreSQL

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer
3. Remember the postgres user password you set
4. Default port: 5432

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Mac:**
```bash
brew install postgresql
brew services start postgresql
```

### Step 2: Clone/Download Project

```bash
cd JewelryEstimation
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment

Create `.env` file in project root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_NAME=jewelry_master
PORT=3000

# Master API Key (Generate using: openssl rand -hex 32)
MASTER_API_KEY=your_secure_random_string_here
```

**Generate Master API Key:**
- **Windows PowerShell:**
  ```powershell
  -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
  ```
- **Linux/Mac:**
  ```bash
  openssl rand -hex 32
  ```

### Step 5: Create Master Database

```bash
# Connect to PostgreSQL
psql -U postgres

# In PostgreSQL prompt:
CREATE DATABASE jewelry_master;
\q
```

### Step 6: Initialize Database

```bash
npm run setup-db
```

### Step 7: Start Server

```bash
npm start
```

Server will run at: `http://localhost:3000`

---

## 🎯 First-Time Setup

### 1. Access Admin Panel
Open: `http://localhost:3000/admin.html`

### 2. Create First Client
- Go to "Clients" tab
- Click "Create New Client"
- Fill in:
  - Tenant Code: `jpjewellery`
  - Client Name: `JP Jewellery`
  - Admin Username: `admin`
  - Admin Password: `123456`

### 3. Login to Application
- Open: `http://localhost:3000`
- Select tenant: `jpjewellery`
- Username: `admin`
- Password: `123456`

---

## 📦 Client Installation (For Each Client)

### Option A: Same Server (Multi-Tenant)
1. Use Admin Panel to create new client
2. Client logs in with their credentials
3. All data in separate database

### Option B: Separate Installation
1. Install software on client's server
2. Follow installation steps 1-7
3. Create client database
4. Client uses their own installation

---

## 🔧 Troubleshooting

### PostgreSQL Connection Error
```bash
# Check PostgreSQL is running
# Windows: services.msc
# Linux: sudo systemctl status postgresql
# Mac: brew services list

# Test connection
psql -U postgres -d jewelry_master
```

### Port Already in Use
Change PORT in `.env`:
```env
PORT=3001
```

### Database Not Found
```bash
# Create master database manually
psql -U postgres
CREATE DATABASE jewelry_master;
\q

# Then run setup
npm run setup-db
```

---

## ✅ Verification

After installation, verify:

1. **Server Running:**
   ```bash
   curl http://localhost:3000/api/tenants
   ```

2. **Database Connected:**
   - Check server console for "✅ Master database initialized"

3. **Admin Panel Accessible:**
   - Open http://localhost:3000/admin.html

4. **Create Test Client:**
   - Use admin panel to create a client
   - Verify client can login

---

## 🔐 Security Setup

### For Production:

1. **Change Default Passwords**
2. **Use Strong Master API Key**
3. **Enable HTTPS** (use Nginx reverse proxy)
4. **Set up Firewall Rules**
5. **Regular Backups**

---

## 📞 Support

If you encounter issues:
1. Check server logs
2. Verify .env configuration
3. Test database connection
4. Review [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)
5. For client installation: See [CLIENT_INSTALLATION_GUIDE.md](CLIENT_INSTALLATION_GUIDE.md)

---

## 📚 Next Steps

After installation:
1. **For Your Own Use:** Follow steps in "First-Time Setup" above
2. **For Client Installation:** See [CLIENT_INSTALLATION_GUIDE.md](CLIENT_INSTALLATION_GUIDE.md) for detailed step-by-step instructions
3. **For API Usage:** See [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)

---

**Ready to use!** 🎉

