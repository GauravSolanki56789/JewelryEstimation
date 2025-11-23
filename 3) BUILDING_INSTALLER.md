# 3) BUILDING INSTALLER FOR CLIENTS
## How to Create the Installer File for Client Systems

---

## 🎯 PURPOSE

This guide shows you how to build the installer (`.exe` file) that clients will use to install the application on their systems.

---

## 📋 PREREQUISITES

Before building:
- ✅ Your system setup is complete (see `1) YOUR_SYSTEM_SETUP.md`)
- ✅ Application runs successfully on your system
- ✅ All dependencies installed (`npm install` completed)

---

## 🚀 BUILD STEPS

### STEP 1: Clean Previous Builds (Optional)

```powershell
npm run clean
```
This removes old build files to ensure a fresh build.

---

### STEP 2: Build the Installer

```powershell
npm run build:win
```

This will:
- Package the application
- Create installer file
- Output to `dist-build` folder

**Time:** 5-10 minutes

---

### STEP 3: Find the Installer

After build completes:
- Go to: `dist-build` folder
- File: `JP Jewellery Estimations Setup 2.0.0.exe`
- **This is the installer file for clients!**

---

## 📦 WHAT'S INCLUDED IN INSTALLER

The installer includes:
- ✅ All application files
- ✅ Server code (runs automatically)
- ✅ Frontend files
- ✅ Database configuration
- ✅ All dependencies (node_modules)
- ✅ Electron runtime

**NOT Included:**
- ❌ PostgreSQL (client must install separately)
- ❌ `.env` file (client creates this)

---

## ✅ VERIFY INSTALLER

Before giving to client:

1. **Test on Your System:**
   - Run the installer
   - Install to a test location
   - Verify it works

2. **Check:**
   - Application opens
   - Server starts automatically
   - No errors

---

## 🎯 GIVING INSTALLER TO CLIENT

1. **Send Installer File:**
   - File: `JP Jewellery Estimations Setup 2.0.0.exe`
   - Size: ~100-200 MB
   - Send via USB drive, cloud storage, or file sharing

2. **Provide Instructions:**
   - Give client: `2) CLIENT_INSTALLATION_GUIDE.md`
   - Or create simplified instructions

---

## 🔧 TROUBLESHOOTING BUILD

### Problem: "Build fails"
**Solution:**
- Check all dependencies installed: `npm install`
- Verify Node.js version: `node --version` (should be 18+)
- Try: `npm run force-clean` then rebuild

### Problem: "File lock error"
**Solution:**
- Close all Electron/Node processes
- Run: `npm run force-clean`
- Try build again

### Problem: "Code signing error"
**Solution:**
- This is normal - code signing is disabled
- Build should still complete
- Installer will work without signature

---

## 📝 BUILD CONFIGURATION

The build is configured in `package.json`:
- Output: `dist-build` folder
- Installer type: NSIS (Windows)
- Code signing: Disabled (for development)

---

## 🎉 SUCCESS!

If installer is created in `dist-build` folder:
- ✅ Build successful!
- ✅ Ready to give to clients
- ✅ Follow `2) CLIENT_INSTALLATION_GUIDE.md` for installation

---

**Last Updated:** January 2025  
**Version:** 2.0.0

