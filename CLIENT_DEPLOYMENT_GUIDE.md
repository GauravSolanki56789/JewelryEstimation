# 📦 Client Deployment Guide
## How to Package and Deploy the Application

---

## 🎯 Overview

This guide explains:
1. What files to share with clients
2. How to package as standalone application
3. How to create separate versions (Admin vs Client)

---

## 📁 File Sharing Guide

### ✅ Files to SHARE with Client:

```
JewelryEstimation/
├── public/
│   ├── index.html          ✅ Share (Main application)
│   └── (other static files) ✅ Share
├── config/
│   └── database.js         ✅ Share (Database config)
├── server.js               ✅ Share (Main server)
├── package.json            ✅ Share (Dependencies)
├── .env.example            ✅ Share (Template for env vars)
└── README.md               ✅ Share (Basic instructions)
```

### ❌ Files to NOT Share with Client:

```
JewelryEstimation/
├── public/
│   └── admin.html          ❌ DO NOT SHARE (Admin panel)
├── .env                    ❌ DO NOT SHARE (Contains secrets)
├── node_modules/           ❌ DO NOT SHARE (Can be regenerated)
├── *.md                    ❌ DO NOT SHARE (Except README.md)
│   ├── TESTING_GUIDE.md
│   ├── COMPLETE_SETUP_GUIDE.md
│   ├── SECURITY_*.md
│   └── ... (all other docs)
└── .git/                   ❌ DO NOT SHARE (Git history)
```

---

## 🚀 Packaging as Standalone Application

### Option 1: Using Electron (Recommended)

**Electron** packages your web app as a desktop application.

#### Step 1: Install Electron

```bash
npm install --save-dev electron electron-builder
```

#### Step 2: Create `electron-main.js`

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'icon.png') // Optional icon
    });

    // Start the server
    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    // Wait for server to start, then load
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 2000);

    mainWindow.on('closed', () => {
        if (serverProcess) {
            serverProcess.kill();
        }
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess) {
            serverProcess.kill();
        }
        app.quit();
    }
});
```

#### Step 3: Update `package.json`

```json
{
  "main": "electron-main.js",
  "scripts": {
    "start": "node server.js",
    "electron": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  },
  "build": {
    "appId": "com.gauravsoftwares.jewelry",
    "productName": "JP Jewellery Estimations",
    "directories": {
      "output": "dist"
    },
    "files": [
      "public/**/*",
      "config/**/*",
      "server.js",
      "package.json",
      "node_modules/**/*"
    ],
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    },
    "mac": {
      "target": "dmg",
      "icon": "icon.icns"
    },
    "linux": {
      "target": "AppImage",
      "icon": "icon.png"
    }
  }
}
```

#### Step 4: Build Application

```bash
# For Windows
npm run build:win

# For Mac
npm run build:mac

# For Linux
npm run build:linux
```

**Output:** Installer in `dist/` folder

---

### Option 2: Using pkg (Simpler)

**pkg** packages Node.js app as executable.

#### Step 1: Install pkg

```bash
npm install -g pkg
```

#### Step 2: Create `pkg-config.json`

```json
{
  "scripts": ["server.js"],
  "assets": [
    "public/**/*",
    "config/**/*",
    "package.json"
  ],
  "targets": [
    "node18-win-x64",
    "node18-mac-x64",
    "node18-linux-x64"
  ],
  "outputPath": "dist"
}
```

#### Step 3: Package

```bash
pkg package.json
```

**Output:** Executables in `dist/` folder

---

## 🔐 Creating Separate Versions

### Version 1: Admin Version (For You)

**Contains:**
- ✅ All files
- ✅ `admin.html` (Admin panel)
- ✅ Full access to create clients
- ✅ Master admin access

**Location:** Keep on your system only

### Version 2: Client Version (For Clients)

**Contains:**
- ✅ `index.html` (Main app)
- ✅ `server.js` (Modified - no admin routes)
- ✅ `config/database.js`
- ❌ NO `admin.html`
- ❌ NO admin routes in server

**Steps to Create Client Version:**

1. **Create Client Package:**
   ```bash
   mkdir JewelryEstimation-Client
   cp -r public/index.html JewelryEstimation-Client/public/
   cp server.js JewelryEstimation-Client/
   cp config/ JewelryEstimation-Client/
   cp package.json JewelryEstimation-Client/
   ```

2. **Modify `server.js` for Client:**
   ```javascript
   // Remove or comment out admin routes
   // app.get('/admin.html', ...)  // Remove this
   // app.get('/api/tenants', ...) // Remove or restrict
   ```

3. **Create Installer:**
   ```bash
   cd JewelryEstimation-Client
   npm install
   npm run build
   ```

---

## 📦 Complete Deployment Steps

### For You (Admin Version):

1. **Keep Full Version:**
   - Keep complete codebase
   - Access to `admin.html`
   - Can create clients

2. **Build Admin Installer:**
   ```bash
   npm run build:win
   ```
   - Installer: `dist/JP Jewellery Estimations Setup.exe`

### For Clients:

1. **Create Client Package:**
   ```bash
   # Create client version (without admin.html)
   ./create-client-package.sh
   ```

2. **Build Client Installer:**
   ```bash
   cd JewelryEstimation-Client
   npm install
   npm run build:win
   ```
   - Installer: `dist/JP Jewellery Estimations Client Setup.exe`

3. **Share Installer:**
   - Send only the installer file
   - Client installs and runs
   - No need for npm/node knowledge

---

## 🛡️ Security for Client Version

### Remove from Client Version:

1. **Remove Admin Routes:**
   ```javascript
   // In server.js - Remove these:
   app.get('/admin.html', ...)
   app.get('/api/tenants', ...)
   app.post('/api/tenants', ...)
   ```

2. **Remove Admin File:**
   ```bash
   rm public/admin.html
   ```

3. **Restrict API Access:**
   ```javascript
   // Only allow tenant-specific APIs
   // Block master admin login
   ```

---

## 📋 Installation for Client

### Client Installation Steps:

1. **Receive Installer:**
   - Get `JP Jewellery Estimations Client Setup.exe`

2. **Install:**
   - Double-click installer
   - Follow installation wizard
   - Install to `C:\Program Files\JP Jewellery`

3. **First Run:**
   - Application starts automatically
   - Opens browser to `http://localhost:3000`
   - Login with their credentials

4. **Daily Use:**
   - Double-click desktop shortcut
   - Application starts
   - No need to run `npm start`

---

## 🔧 Auto-Start on Boot (Optional)

### For Windows:

1. **Create Startup Script:**
   ```batch
   @echo off
   cd "C:\Program Files\JP Jewellery"
   start "" "JP Jewellery Estimations.exe"
   ```

2. **Add to Startup:**
   - Win+R → `shell:startup`
   - Copy script shortcut

---

## 📝 Client Package Checklist

### Before Sharing:

- [ ] Remove `admin.html`
- [ ] Remove admin routes from `server.js`
- [ ] Remove sensitive documentation
- [ ] Remove `.env` file
- [ ] Test client version
- [ ] Build installer
- [ ] Test installer on clean system
- [ ] Create user guide for client

---

## 🎯 Summary

### For You (Admin):
- ✅ Keep full version with `admin.html`
- ✅ Can create clients
- ✅ Full access

### For Clients:
- ✅ Client version (no admin)
- ✅ Standalone installer
- ✅ No npm/node knowledge needed
- ✅ Just install and run

---

**Ready to deploy!** Follow the steps above to create installers for clients.

