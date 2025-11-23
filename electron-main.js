const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const https = require('https');
const http = require('http');

let mainWindow;
let serverStarted = false;

// Configure auto-updater
autoUpdater.autoDownload = false; // We'll handle download manually
autoUpdater.autoInstallOnAppQuit = false;

// Update server URL (GitHub releases or custom server)
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/releases/latest';

// Start server directly in Electron process (no spawning needed)
function startServer() {
    try {
        // Determine app directory
        const appDir = app.isPackaged 
            ? path.join(process.resourcesPath, 'app')
            : __dirname;
        
        // Change to app directory for relative paths to work
        const originalCwd = process.cwd();
        process.chdir(appDir);
        
        // Set environment variables
        process.env.PORT = process.env.PORT || '3000';
        process.env.NODE_ENV = app.isPackaged ? 'production' : 'development';
        
        // Load .env if exists
        const envPath = path.join(appDir, '.env');
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath });
        } else {
            // Try .env.example as fallback
            const defaultEnv = path.join(appDir, '.env.example');
            if (fs.existsSync(defaultEnv)) {
                require('dotenv').config({ path: defaultEnv });
            }
        }
        
        // Verify server.js exists
        const serverPath = path.join(appDir, 'server.js');
        if (!fs.existsSync(serverPath)) {
            console.error('Server file not found:', serverPath);
            process.chdir(originalCwd);
            return false;
        }
        
        // Start server by requiring it
        // This will execute server.js and start the Express server
        require(serverPath);
        serverStarted = true;
        console.log('✅ Server started successfully on port', process.env.PORT || 3000);
        
        // Restore original working directory
        process.chdir(originalCwd);
        return true;
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('Error stack:', error.stack);
        serverStarted = false;
        return false;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'JP Jewellery Estimations',
        show: false
    });

    // Start server first
    startServer();

    // Wait for server to be ready, then load URL
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds total
    
    const checkServer = setInterval(() => {
        attempts++;
        
        // Try to fetch from server
        const http = require('http');
        const req = http.get('http://localhost:3000', (res) => {
            if (res.statusCode === 200 || res.statusCode === 404) {
                // Server is responding
                clearInterval(checkServer);
                mainWindow.loadURL('http://localhost:3000');
                mainWindow.show();
            }
        });
        
        req.on('error', () => {
            // Server not ready yet
            if (attempts >= maxAttempts) {
                clearInterval(checkServer);
                mainWindow.show();
                mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Server Error</title>
                        <style>
                            body { font-family: Arial; padding: 40px; text-align: center; }
                            h1 { color: #d32f2f; }
                            p { color: #666; }
                            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
                        </style>
                    </head>
                    <body>
                        <h1>⚠️ Server Not Starting</h1>
                        <p>The application server could not start.</p>
                        <p><strong>Possible causes:</strong></p>
                        <ul style="text-align: left; display: inline-block;">
                            <li>PostgreSQL database is not running</li>
                            <li>Database connection settings are incorrect</li>
                            <li>Port 3000 is already in use</li>
                        </ul>
                        <p><strong>Solution:</strong></p>
                        <p>1. Make sure PostgreSQL is installed and running</p>
                        <p>2. Check your database settings in <code>.env</code> file</p>
                        <p>3. Make sure port 3000 is available</p>
                        <p style="margin-top: 30px; color: #999;">Check the console for detailed error messages.</p>
                    </body>
                    </html>
                `));
            }
        });
        
        req.end();
    }, 500);
}

// Helper function to make HTTP requests
function httpRequest(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, {
            headers: {
                'User-Agent': 'JP-Jewellery-Estimations'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

// IPC Handlers for update functionality
ipcMain.handle('check-for-updates', async () => {
    try {
        // Check GitHub releases for latest version
        const packageJson = require('./package.json');
        const currentVersion = packageJson.version;
        
        // Try to fetch from local server first (for development)
        try {
            const localUpdate = await httpRequest('http://localhost:3000/api/update/check');
            return {
                success: true,
                updateAvailable: localUpdate.available && localUpdate.version !== currentVersion,
                version: localUpdate.version,
                currentVersion: currentVersion,
                downloadUrl: localUpdate.downloadUrl,
                releaseNotes: localUpdate.releaseNotes
            };
        } catch (e) {
            // Local server not available, try GitHub
        }
        
        // If GitHub URL is configured, check GitHub releases
        if (UPDATE_SERVER_URL.includes('github.com')) {
            try {
                const release = await httpRequest(UPDATE_SERVER_URL);
                const latestVersion = release.tag_name.replace('v', '').replace('V', '');
                const installerAsset = release.assets.find(asset => 
                    asset.name.includes('.exe') && asset.name.includes('Setup')
                );
                
                return {
                    success: true,
                    updateAvailable: latestVersion !== currentVersion,
                    version: latestVersion,
                    currentVersion: currentVersion,
                    downloadUrl: installerAsset ? installerAsset.browser_download_url : null,
                    releaseNotes: release.body || 'Latest update with improvements'
                };
            } catch (githubError) {
                console.error('GitHub check failed:', githubError);
            }
        }
        
        return {
            success: true,
            updateAvailable: false,
            currentVersion: currentVersion
        };
    } catch (error) {
        console.error('Update check error:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('download-update', async (event, downloadUrl) => {
    try {
        // Download the installer
        const tempPath = path.join(app.getPath('temp'), 'jewelry-update-installer.exe');
        
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(tempPath);
            const protocol = downloadUrl.startsWith('https') ? https : http;
            
            protocol.get(downloadUrl, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    protocol.get(response.headers.location, (redirectResponse) => {
                        redirectResponse.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve(tempPath);
                        });
                    }).on('error', reject);
                } else {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve(tempPath);
                    });
                }
            }).on('error', reject);
        });
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
});

ipcMain.handle('install-update', async (event, installerPath) => {
    try {
        // Launch installer and quit app
        shell.openPath(installerPath);
        // Give it a moment to start, then quit
        setTimeout(() => {
            app.quit();
        }, 1000);
        return { success: true };
    } catch (error) {
        console.error('Install error:', error);
        throw error;
    }
});

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle app quit
app.on('before-quit', () => {
    // Server will stop when app quits
});
