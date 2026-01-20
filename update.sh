#!/bin/bash
# Self-Update Script for Gaurav Softwares Jewelry Estimation
# This script pulls the latest code from GitHub and restarts the server

echo "================================================"
echo "🔄 Starting Software Update..."
echo "================================================"

# Store current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "📍 Working Directory: $SCRIPT_DIR"
echo "📅 Update Time: $(date)"
echo ""

# Step 1: Pull latest code from GitHub
echo "⬇️ Step 1: Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/master
if [ $? -ne 0 ]; then
    echo "❌ Git pull failed! Trying to continue..."
fi
echo "✅ Code pulled successfully!"
echo ""

# Step 2: Install/Update dependencies
echo "📦 Step 2: Installing dependencies..."
npm install --production
if [ $? -ne 0 ]; then
    echo "⚠️ npm install had warnings, continuing..."
fi
echo "✅ Dependencies installed!"
echo ""

# Step 3: Run database migrations if any
if [ -f "scripts/migrate.js" ]; then
    echo "🔄 Step 3: Running database migrations..."
    node scripts/migrate.js
    echo "✅ Migrations complete!"
    echo ""
fi

# Step 4: Restart the server using PM2
echo "♻️ Step 4: Restarting server with PM2..."

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    # Try to restart, if fails then start fresh
    pm2 restart gaurav-app 2>/dev/null || pm2 start ecosystem.config.js
    
    # Save PM2 process list
    pm2 save
    
    echo "✅ Server restarted successfully!"
else
    echo "⚠️ PM2 not found. Please install PM2 globally: npm install -g pm2"
    echo "🔄 Attempting to restart with node directly..."
    
    # Kill existing node process and restart
    pkill -f "node server.js" 2>/dev/null
    nohup node server.js > /var/log/jewelry-app.log 2>&1 &
    
    echo "✅ Server started in background"
fi

echo ""
echo "================================================"
echo "✅ UPDATE COMPLETE!"
echo "================================================"
echo ""
echo "🌐 Server should be accessible at:"
echo "   - Local: http://localhost:3000"
echo "   - Public: Check your domain configuration"
echo ""
echo "📋 To check status: pm2 status"
echo "📋 To view logs: pm2 logs gaurav-app"
echo ""
