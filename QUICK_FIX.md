# Quick Fix: Database Password Error

## Problem
Server is running but getting: `password authentication failed for user "postgres"`

## Solution

### Step 1: Stop the Server
In the terminal where `npm start` is running, press:
```
Ctrl + C
```

### Step 2: Fix the .env File
Run this command:
```powershell
.\fix-env.ps1
```

When prompted:
- **Database Host:** Press Enter (uses `localhost`)
- **Database Port:** Enter `5433` (for PostgreSQL 18)
- **Database User:** Press Enter (uses `postgres`)
- **Database Password:** Enter the **EXACT password** you set during PostgreSQL installation
- **Master Database Name:** Press Enter (uses `jewelry_master`)
- **Server Port:** Press Enter (uses `3000`)

### Step 3: Restart Server
```powershell
npm start
```

## Alternative: Manual Edit

If the script doesn't work, edit `.env` manually:

1. Open `.env` in Notepad:
   ```powershell
   notepad .env
   ```

2. Make sure the password matches your PostgreSQL password:
   ```env
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=postgres
   DB_PASSWORD=your_actual_postgres_password
   DB_NAME=jewelry_master
   PORT=3000
   ```

3. Save and close

4. Restart server:
   ```powershell
   npm start
   ```

## Verify Password

To test if your password is correct, try connecting with psql:
```powershell
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -p 5433
```

If it asks for password and accepts it, that's the correct password to use in `.env`.

