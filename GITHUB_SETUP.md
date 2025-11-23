# GitHub Setup and Push Instructions

This guide will help you push your code to GitHub and set up automatic updates.

## Step 1: Create GitHub Repository

1. **Go to GitHub**: https://github.com
2. **Click "New"** (or go to https://github.com/new)
3. **Repository Details**:
   - Repository name: `jewelry-estimation` (or your preferred name)
   - Description: "Multi-Tenant Jewelry Estimation Software"
   - Visibility: **Private** (recommended) or Public
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. **Click "Create repository"**

---

## Step 2: Initialize Git and Push Code

Open PowerShell in your project directory (`D:\JewelryEstimation`) and run:

```powershell
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Multi-tenant jewelry estimation software"

# Add your GitHub repository as remote (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note**: If you haven't set up Git credentials, GitHub will prompt you to:
- Use a Personal Access Token (recommended)
- Or use GitHub Desktop

---

## Step 3: Configure GitHub Repository for Updates

### Option A: Using GitHub Releases (Recommended)

1. **Go to your repository on GitHub**
2. **Click "Releases"** → **"Create a new release"**
3. **Tag version**: `v2.0.0` (must match your `package.json` version)
4. **Release title**: `Version 2.0.0`
5. **Description**: Add release notes
6. **Attach installer**: Drag and drop your `JP Jewellery Estimations Setup 2.0.0.exe` file
7. **Click "Publish release"**

### Option B: Using Environment Variables

1. **Update `.env` file** (or create it):
   ```env
   GITHUB_REPO=YOUR_USERNAME/YOUR_REPO_NAME
   UPDATE_SERVER_URL=https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO_NAME/releases/latest
   ```

2. **Update `package.json`** build config:
   ```json
   "publish": {
     "provider": "github",
     "owner": "YOUR_USERNAME",
     "repo": "YOUR_REPO_NAME"
   }
   ```

---

## Step 4: Update Process for Future Releases

### When you make code changes:

1. **Update version in `package.json`**:
   ```json
   "version": "2.0.1"
   ```

2. **Update version in `public/index.html`**:
   ```javascript
   let currentAppVersion = '2.0.1';
   ```

3. **Commit and push changes**:
   ```powershell
   git add .
   git commit -m "Update to version 2.0.1"
   git push
   ```

4. **Build new installer**:
   ```powershell
   npm run clean
   npm run build:win
   ```

5. **Create GitHub Release**:
   - Go to GitHub → Releases → Create new release
   - Tag: `v2.0.1`
   - Upload the new installer from `dist-build` folder
   - Publish release

6. **Clients can now update**:
   - Clients click "🔄 Update S/w" button
   - System checks GitHub for new version
   - Downloads and installs automatically
   - Shows success message ✅

---

## Step 5: Testing Updates

1. **Test locally**:
   - Build installer with version 2.0.0
   - Install it
   - Create a release on GitHub with version 2.0.1
   - Click "Update S/w" button in the app
   - Should detect update and install

2. **Verify success message**:
   - After successful update, you should see: "✅ Update downloaded successfully! The installer will now launch."

---

## Troubleshooting

### Git Push Issues

**Error: "remote: Support for password authentication was removed"**
- Solution: Use Personal Access Token
  1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  2. Generate new token with `repo` scope
  3. Use token as password when pushing

**Error: "fatal: not a git repository"**
- Solution: Run `git init` first

### Update Not Working

**Update button shows "No updates available"**
- Check GitHub release tag matches version format (v2.0.0)
- Verify installer file is attached to release
- Check `.env` has correct `GITHUB_REPO` value

**Download fails**
- Check internet connection
- Verify GitHub release is public (or use token for private repos)
- Check installer file size (should be ~94 MB)

---

## Quick Reference

```powershell
# Initial setup
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main

# Future updates
git add .
git commit -m "Update description"
git push

# Build and release
npm run clean
npm run build:win
# Then create GitHub release with the installer
```

---

## Security Notes

- Keep `.env` file in `.gitignore` (already done)
- Never commit database passwords
- Use private repository for production code
- Use GitHub Personal Access Tokens instead of passwords

---

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Create first release with installer
3. ✅ Test update mechanism
4. ✅ Distribute to clients
5. ✅ Future updates: Build → Release → Clients update automatically

