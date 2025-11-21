# Next Steps After PostgreSQL Installation

## ✅ You've Installed PostgreSQL!

You have two PostgreSQL versions:
- **PostgreSQL 17** on port **5432** (standard)
- **PostgreSQL 18** on port **5433** (newer)

## Step 1: Cancel Stack Builder (Optional)
- Stack Builder is for installing additional tools
- You can **Cancel** it for now - we don't need it
- We just need PostgreSQL itself

## Step 2: Create .env File

### Option A: Use PowerShell Script (Easiest)
```powershell
.\create-env.ps1
```

### Option B: Create Manually
Create a file named `.env` in the project root:

**For PostgreSQL 17 (port 5432):**
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=jewelry_master
PORT=3000
```

**For PostgreSQL 18 (port 5433):**
```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=jewelry_master
PORT=3000
```

**Replace `your_postgres_password` with the password you set during installation.**

## Step 3: Create Master Database

### For PostgreSQL 17 (port 5432):
```powershell
psql -U postgres -p 5432 -c "CREATE DATABASE jewelry_master;"
```

### For PostgreSQL 18 (port 5433):
```powershell
psql -U postgres -p 5433 -c "CREATE DATABASE jewelry_master;"
```

**If psql is not in PATH, use full path:**
```powershell
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -p 5432 -c "CREATE DATABASE jewelry_master;"
```
or
```powershell
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -p 5433 -c "CREATE DATABASE jewelry_master;"
```

## Step 4: Run Database Setup
```powershell
npm run setup-db
```

This will create all necessary tables in the master database.

## Step 5: Start Server
```powershell
npm start
```

Server will run on: http://localhost:3000

## Quick Checklist

- [ ] Cancel Stack Builder (optional)
- [ ] Create .env file with correct port (5432 or 5433)
- [ ] Create `jewelry_master` database
- [ ] Run `npm run setup-db`
- [ ] Start server with `npm start`

## Troubleshooting

### "psql: command not found"
Use full path to psql.exe:
- PostgreSQL 17: `"C:\Program Files\PostgreSQL\17\bin\psql.exe"`
- PostgreSQL 18: `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`

### "password authentication failed"
- Make sure password in .env matches your PostgreSQL password
- Try connecting with: `psql -U postgres -p 5432` (or 5433)

### "database does not exist"
- Make sure you created `jewelry_master` database first

