// Simple Update Server for JP Jewellery Estimations
// This server provides update information and files to clients

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const UPDATE_PORT = process.env.UPDATE_PORT || 3001;

app.use(cors());
app.use(express.json());

// Update information endpoint
app.get('/api/update/check', (req, res) => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        const currentVersion = packageJson.version;
        
        // You can customize this to check against a remote version
        // For now, it returns the current version
        res.json({
            available: true,
            version: currentVersion,
            downloadUrl: `http://localhost:${UPDATE_PORT}/api/update/download`,
            releaseNotes: 'Latest update with bug fixes and improvements',
            mandatory: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download update endpoint (in production, this would serve the actual installer)
app.get('/api/update/download', (req, res) => {
    try {
        // In production, this would serve the actual installer file
        // For now, return a message
        res.json({
            message: 'Update download endpoint',
            note: 'In production, this would serve the installer file'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start update server
app.listen(UPDATE_PORT, () => {
    console.log(`🔄 Update server running on port ${UPDATE_PORT}`);
});

