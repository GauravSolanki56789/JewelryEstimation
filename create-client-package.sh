#!/bin/bash

# Script to create client package (without admin files)

echo "Creating client package..."

# Create client directory
mkdir -p JewelryEstimation-Client
mkdir -p JewelryEstimation-Client/public
mkdir -p JewelryEstimation-Client/config

# Copy necessary files
echo "Copying files..."
cp -r public/index.html JewelryEstimation-Client/public/
cp server.js JewelryEstimation-Client/
cp config/database.js JewelryEstimation-Client/config/
cp package.json JewelryEstimation-Client/
cp .env.example JewelryEstimation-Client/

# Remove admin.html if exists
rm -f JewelryEstimation-Client/public/admin.html

# Create modified server.js (remove admin routes)
echo "Creating client version of server.js..."
cat > JewelryEstimation-Client/server-client.js << 'EOF'
// Client version - Admin routes removed
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { 
    masterPool, 
    getTenantPool, 
    initMasterDatabase, 
    createTenantDatabase,
    queryTenant 
} = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize database
initMasterDatabase();

// CLIENT VERSION - Admin routes removed for security

// Main app route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
    // Same login logic as before
    // ... (copy from original server.js)
});

// API routes (tenant-specific only)
// ... (copy all API routes from original server.js)

app.listen(PORT, () => {
    console.log(`✅ Client application running at http://localhost:${PORT}`);
});
EOF

echo "✅ Client package created in JewelryEstimation-Client/"
echo "Next steps:"
echo "1. cd JewelryEstimation-Client"
echo "2. npm install"
echo "3. npm run build"

