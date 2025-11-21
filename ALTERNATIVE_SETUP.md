# Alternative Database Setup Methods

Since `psql` is not in your PATH, here are alternative ways to create the database:

## Method 1: Use the Helper Script (Easiest)

Run this PowerShell script - it will find PostgreSQL automatically:

```powershell
.\create-database.ps1
```

This script will:
- Search for PostgreSQL installation
- Ask for port (5432 or 5433)
- Ask for password
- Create the database automatically

## Method 2: Use pgAdmin (GUI - No Command Line Needed)

1. **Open pgAdmin** (should be installed with PostgreSQL)
   - Look for "pgAdmin 4" in Start Menu
   - Or search for "pgAdmin" in Windows search

2. **Connect to PostgreSQL Server**
   - Enter your PostgreSQL password when prompted
   - You'll see your PostgreSQL server (17 or 18)

3. **Create Database**
   - Right-click on "Databases" → Create → Database
   - Name: `jewelry_master`
   - Owner: `postgres`
   - Click "Save"

4. **Done!** Database is created

## Method 3: Find PostgreSQL Path Manually

1. **Find PostgreSQL Installation:**
   - Open File Explorer
   - Go to: `C:\Program Files\PostgreSQL\`
   - Look for folder: `17` or `18` or `16` etc.
   - Navigate to: `bin\psql.exe`

2. **Use Full Path:**
   ```powershell
   "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -p 5433 -c "CREATE DATABASE jewelry_master;"
   ```
   (Replace `18` with your version, `5433` with your port)

3. **Enter password when prompted**

## Method 4: Add PostgreSQL to PATH (Permanent Solution)

1. **Find PostgreSQL bin folder:**
   - Usually: `C:\Program Files\PostgreSQL\18\bin\`
   - Or: `C:\Program Files\PostgreSQL\17\bin\`

2. **Add to PATH:**
   - Press `Win + X` → System → Advanced system settings
   - Click "Environment Variables"
   - Under "System variables", find "Path" → Edit
   - Click "New" → Add: `C:\Program Files\PostgreSQL\18\bin`
   - Click OK on all dialogs
   - **Restart PowerShell/Terminal**

3. **Now `psql` command will work:**
   ```powershell
   psql -U postgres -p 5433 -c "CREATE DATABASE jewelry_master;"
   ```

## Recommended: Use Method 1 or Method 2

- **Method 1** (Script): Fastest, automated
- **Method 2** (pgAdmin): Easiest if you prefer GUI

After creating the database, continue with:
1. Create .env file: `.\create-env.ps1`
2. Run setup: `npm run setup-db`
3. Start server: `npm start`

