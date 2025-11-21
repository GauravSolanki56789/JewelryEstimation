# Quick Database Setup Guide

## Prerequisites
1. **PostgreSQL must be installed** - Download from: https://www.postgresql.org/download/windows/

## Step-by-Step Setup

### Step 1: Install PostgreSQL (if not already installed)
- Download and install from the link above
- **Remember the password** you set for the `postgres` user
- Default port: 5432

### Step 2: Create .env File

**Option A: Use the setup script (Recommended)**
```bash
npm run setup-env
```
This will prompt you for database credentials.

**Option B: Create manually**
Create a file named `.env` in the project root with:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=jewelry_master
PORT=3000
```
Replace `your_postgres_password` with your actual PostgreSQL password.

### Step 3: Create Master Database

**Option A: Using psql command line**
```bash
psql -U postgres -c "CREATE DATABASE jewelry_master;"
```

**Option B: Using pgAdmin (GUI)**
1. Open pgAdmin
2. Connect to PostgreSQL server
3. Right-click "Databases" → Create → Database
4. Name: `jewelry_master`
5. Click Save

**Option C: If psql is not in PATH**
Find PostgreSQL installation (usually `C:\Program Files\PostgreSQL\15\bin\`) and run:
```bash
"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE jewelry_master;"
```

### Step 4: Run Database Setup
```bash
npm run setup-db
```

### Step 5: Start Server
```bash
npm start
```

Server will run on: http://localhost:3000

## Troubleshooting

### "psql: command not found"
- PostgreSQL bin folder not in PATH
- Use full path: `"C:\Program Files\PostgreSQL\15\bin\psql.exe"`
- Or add to PATH: System Properties → Environment Variables → Path → Add PostgreSQL bin folder

### "Connection refused" or "password authentication failed"
- Check PostgreSQL service is running (Windows Services)
- Verify password in .env file matches PostgreSQL password
- Check if PostgreSQL is listening on port 5432

### "database does not exist"
- Make sure you created `jewelry_master` database first (Step 3)

## Need Help?
Check `SETUP_DATABASE.md` for detailed instructions.

