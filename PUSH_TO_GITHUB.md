# Quick Guide: Push Code to GitHub

Your repository is already set up! Just follow these steps:

## Step 1: Add All Changes

```powershell
git add .
```

## Step 2: Commit Changes

```powershell
git commit -m "Add auto-update functionality and GitHub integration"
```

## Step 3: Push to GitHub

```powershell
git push origin master
```

**That's it!** Your code is now on GitHub.

---

## If You Get Authentication Errors

If GitHub asks for credentials:

1. **Use Personal Access Token** (recommended):
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scope: `repo` (full control)
   - Copy the token
   - When Git asks for password, paste the token instead

2. **Or use GitHub Desktop**:
   - Download: https://desktop.github.com
   - Sign in and push from there

---

## After Pushing: Set Up Auto-Updates

1. **Update `.env` file** with your GitHub repo:
   ```env
   GITHUB_REPO=YOUR_USERNAME/YOUR_REPO_NAME
   ```

2. **Create a GitHub Release**:
   - Go to your GitHub repository
   - Click "Releases" → "Create a new release"
   - Tag: `v2.0.0`
   - Upload your installer: `dist-build/JP Jewellery Estimations Setup 2.0.0.exe`
   - Publish release

3. **Test the update**:
   - Click "🔄 Update S/w" button in your app
   - It should check GitHub and find the update

---

## Future Updates Workflow

1. Make code changes
2. Update version in `package.json` and `index.html`
3. Build installer: `npm run build:win`
4. Commit and push: `git add . && git commit -m "v2.0.1" && git push`
5. Create GitHub release with new installer
6. Clients click "Update S/w" → Automatic update! ✅

