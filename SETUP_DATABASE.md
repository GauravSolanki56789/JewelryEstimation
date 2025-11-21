# Database Setup Guide

## Step 1: Install PostgreSQL

### Windows Installation:
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer
3. During installation:
   - Remember the password you set for the `postgres` user (you'll need this)
   - Default port is 5432 (keep this)
   - Default installation location is fine

### After Installation:
- PostgreSQL will be installed as a Windows service
- It will start automatically

## Step 2: Create .env File

Create a `.env` file in the project root with your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_NAME=jewelry_master
PORT=3000
```

**Important:** Replace `your_postgres_password_here` with the password you set during PostgreSQL installation.

## Step 3: Create Master Database

Open Command Prompt or PowerShell and run:

```bash
psql -U postgres
```

Then in the PostgreSQL prompt, run:
```sql
CREATE DATABASE jewelry_master;
\q
```

## Step 4: Run Setup Script

```bash
npm run setup-db
```

## Step 5: Start Server

```bash
npm start
```

The server will run on http://localhost:3000

## Troubleshooting

### If psql command not found:
- Add PostgreSQL bin folder to PATH:
  - Usually: `C:\Program Files\PostgreSQL\15\bin` (version may vary)
  - Or use full path: `"C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres`

### If connection fails:
- Check PostgreSQL service is running (Services → PostgreSQL)
- Verify password in .env file
- Check firewall settings

