# 8) Cloud Setup Guide

Complete step-by-step guide to deploy your jewelry estimation software to the cloud with your domain `software.my925silver.in`.

---

## 🎯 Overview

**What We're Setting Up:**
- **Cloud Server:** Hosts your application (DigitalOcean/AWS/Azure)
- **Cloud Database:** PostgreSQL database in the cloud
- **Domain:** `software.my925silver.in` pointing to your cloud server
- **SSL Certificate:** HTTPS encryption (free via Let's Encrypt)
- **Auto-Scaling:** Server handles multiple clients automatically

---

## 📋 PREREQUISITES

1. ✅ Domain name: `my925silver.in` (you have this)
2. ⬜ Cloud hosting account (we'll set this up)
3. ⬜ Domain DNS access (to create subdomain)

---

## 🚀 STEP-BY-STEP CLOUD SETUP

### STEP 1: Choose Cloud Provider

**Recommended Options:**

#### Option A: DigitalOcean (Easiest, Best for Starters)
- **Cost:** ~$12-20/month (Droplet with 2GB RAM)
- **Pros:** Simple, predictable pricing, great documentation
- **Best for:** Small to medium businesses

#### Option B: AWS (Most Scalable)
- **Cost:** ~$30-50/month (EC2 t3.small)
- **Pros:** Most features, global infrastructure
- **Best for:** Growing businesses, multiple regions

#### Option C: Azure (Microsoft Integration)
- **Cost:** ~$30-50/month (Basic B1s)
- **Pros:** Good Windows support, enterprise features
- **Best for:** Microsoft ecosystem users

**Recommendation:** Start with **DigitalOcean** (easiest setup)

---

### STEP 2: Create Cloud Server (DigitalOcean Example)

1. **Sign up at:** https://www.digitalocean.com
2. **Create Droplet:**
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($12/month - 2GB RAM, 1 vCPU)
   - **Datacenter:** Choose closest to your location (e.g., Bangalore/Mumbai)
   - **Authentication:** SSH keys (recommended) or password
   - **Hostname:** `software-server`
   - **Click "Create Droplet"**

3. **Note the IP address** (e.g., `157.230.45.123`)

---

### STEP 3: Setup Cloud Database

#### Option A: DigitalOcean Managed Database (Recommended)

1. **Go to:** Databases → Create Database
2. **Choose:** PostgreSQL
3. **Plan:** Basic ($15/month - 1GB RAM, 1 vCPU, 10GB storage)
4. **Datacenter:** Same as your server
5. **Database Name:** `jewelry_master`
6. **Click "Create Database"**

7. **Note the connection details:**
   - **Host:** `db-postgresql-xxxxx-do-user-xxxxx.db.ondigitalocean.com`
   - **Port:** `25060`
   - **Database:** `defaultdb`
   - **Username:** `doadmin`
   - **Password:** (shown once, save it!)

8. **Configure Trusted Sources:**
   - Add your server's IP address
   - Or allow all sources (for development)

#### Option B: AWS RDS PostgreSQL

1. **Go to:** AWS Console → RDS → Create Database
2. **Engine:** PostgreSQL 15
3. **Template:** Free tier (or Production for better performance)
4. **Instance:** db.t3.micro (free tier) or db.t3.small ($30/month)
5. **Storage:** 20GB
6. **Database name:** `jewelry_master`
7. **Master username:** `postgres`
8. **Master password:** (create strong password)
9. **Public access:** Yes (or configure VPC)
10. **Click "Create Database"**

---

### STEP 4: Configure Domain DNS

1. **Login to your domain registrar** (where you bought `my925silver.in`)

2. **Go to DNS Management / Name Servers**

3. **Create A Record:**
   - **Type:** A
   - **Name/Host:** `software` (or `@` if using root)
   - **Value/Points to:** Your cloud server IP (e.g., `157.230.45.123`)
   - **TTL:** 3600 (or default)
   - **Save**

4. **Wait 5-30 minutes** for DNS propagation

5. **Verify DNS:**
   ```powershell
   nslookup software.my925silver.in
   ```
   Should return your server IP

---

### STEP 5: Setup Server (SSH Connection)

1. **Connect to your server:**
   ```powershell
   ssh root@YOUR_SERVER_IP
   ```

2. **Update system:**
   ```bash
   apt update && apt upgrade -y
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
   apt install -y nodejs
   node --version  # Should show v18.x
   ```

4. **Install PostgreSQL Client (for testing):**
   ```bash
   apt install -y postgresql-client
   ```

5. **Install PM2 (Process Manager):**
   ```bash
   npm install -g pm2
   ```

6. **Install Nginx (Web Server):**
   ```bash
   apt install -y nginx
   systemctl start nginx
   systemctl enable nginx
   ```

---

### STEP 6: Upload Your Application

**Option A: Using Git (Recommended)**

1. **On your local computer, push code to GitHub:**
   ```powershell
   git add .
   git commit -m "Cloud deployment ready"
   git push origin main
   ```

2. **On server, clone repository:**
   ```bash
   cd /var/www
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git jewelry-app
   cd jewelry-app
   npm install
   ```

**Option B: Using SCP (Direct Upload)**

1. **On your local computer:**
   ```powershell
   scp -r D:\JewelryEstimation root@YOUR_SERVER_IP:/var/www/jewelry-app
   ```

2. **On server:**
   ```bash
   cd /var/www/jewelry-app
   npm install
   ```

---

### STEP 7: Configure Environment Variables

1. **On server, create `.env` file:**
   ```bash
   cd /var/www/jewelry-app
   nano .env
   ```

2. **Add cloud database configuration:**
   ```env
   # Cloud Database Configuration
   DB_HOST=db-postgresql-xxxxx-do-user-xxxxx.db.ondigitalocean.com
   DB_PORT=25060
   DB_USER=doadmin
   DB_PASSWORD=your_database_password
   DB_NAME=defaultdb
   
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   
   # Domain
   DOMAIN=software.my925silver.in
   ```

3. **Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

---

### STEP 8: Initialize Database

1. **On server:**
   ```bash
   cd /var/www/jewelry-app
   npm run setup-db
   ```

2. **Verify connection:**
   ```bash
   psql -h DB_HOST -p DB_PORT -U DB_USER -d DB_NAME
   # Enter password when prompted
   # Type: \l (to list databases)
   # Type: \q (to quit)
   ```

---

### STEP 9: Setup SSL Certificate (HTTPS)

1. **Install Certbot:**
   ```bash
   apt install -y certbot python3-certbot-nginx
   ```

2. **Get SSL Certificate:**
   ```bash
   certbot --nginx -d software.my925silver.in
   ```

3. **Follow prompts:**
   - Enter email address
   - Agree to terms
   - Choose redirect HTTP to HTTPS (option 2)

4. **Auto-renewal (already configured):**
   ```bash
   certbot renew --dry-run
   ```

---

### STEP 10: Configure Nginx (Reverse Proxy)

1. **Create Nginx configuration:**
   ```bash
   nano /etc/nginx/sites-available/jewelry-app
   ```

2. **Add configuration:**
   ```nginx
   server {
       listen 80;
       server_name software.my925silver.in;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name software.my925silver.in;

       ssl_certificate /etc/letsencrypt/live/software.my925silver.in/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/software.my925silver.in/privkey.pem;

       # Security headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-XSS-Protection "1; mode=block" always;

       # Proxy to Node.js application
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }

       # WebSocket support (for Socket.IO)
       location /socket.io/ {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable site:**
   ```bash
   ln -s /etc/nginx/sites-available/jewelry-app /etc/nginx/sites-enabled/
   nginx -t  # Test configuration
   systemctl reload nginx
   ```

---

### STEP 11: Start Application with PM2

1. **Start application:**
   ```bash
   cd /var/www/jewelry-app
   pm2 start server.js --name jewelry-app
   ```

2. **Save PM2 configuration:**
   ```bash
   pm2 save
   pm2 startup  # Follow instructions to enable auto-start
   ```

3. **Check status:**
   ```bash
   pm2 status
   pm2 logs jewelry-app
   ```

---

### STEP 12: Configure Firewall

1. **Allow necessary ports:**
   ```bash
   ufw allow 22/tcp    # SSH
   ufw allow 80/tcp    # HTTP
   ufw allow 443/tcp   # HTTPS
   ufw enable
   ```

2. **Check status:**
   ```bash
   ufw status
   ```

---

### STEP 13: Test Your Application

1. **Open browser:** `https://software.my925silver.in`
2. **Should see:** Your application login page
3. **Test login:** Use master admin credentials
4. **Verify:** All features work correctly

---

## 🔄 UPDATING APPLICATION

### When You Make Code Changes:

1. **On your local computer:**
   ```powershell
   git add .
   git commit -m "Update description"
   git push origin main
   ```

2. **On server:**
   ```bash
   cd /var/www/jewelry-app
   git pull origin main
   npm install  # If package.json changed
   pm2 restart jewelry-app
   ```

---

## 📊 MONITORING & MAINTENANCE

### Check Application Status:
```bash
pm2 status
pm2 logs jewelry-app
pm2 monit
```

### Check Nginx Status:
```bash
systemctl status nginx
nginx -t
```

### Check Database Connection:
```bash
psql -h DB_HOST -p DB_PORT -U DB_USER -d DB_NAME
```

### Backup Database:
```bash
cd /var/www/jewelry-app
npm run backup-db
# Backup files saved in backups/ directory
```

---

## 💰 COST BREAKDOWN (Monthly)

**DigitalOcean Setup:**
- **Droplet (Server):** $12/month (2GB RAM)
- **Managed Database:** $15/month (1GB RAM, 10GB storage)
- **Total:** ~$27/month

**AWS Setup:**
- **EC2 t3.small:** $15/month
- **RDS db.t3.small:** $30/month
- **Total:** ~$45/month

**Additional Costs:**
- Domain: Already owned
- SSL Certificate: Free (Let's Encrypt)
- Bandwidth: Usually included (1TB free on DigitalOcean)

---

## 🔐 SECURITY CHECKLIST

- ✅ SSL Certificate installed (HTTPS)
- ✅ Firewall configured (only necessary ports open)
- ✅ Database password strong and secure
- ✅ SSH keys configured (disable password login)
- ✅ Regular backups enabled
- ✅ PM2 auto-restart on crash
- ✅ Nginx security headers configured
- ✅ **Admin Panel Protected** - Only master admin can access `/admin.html`
- ✅ **Master Admin Setup** - Run `npm run fix-gaurav-password` to set master admin password

---

## 🔒 ADMIN PANEL SECURITY

**Important:** The admin panel at `https://software.my925silver.in/admin.html` is **PROTECTED** and only accessible by master admin.

### How It Works:

1. **Access Admin Panel:**
   - Go to: `https://software.my925silver.in/admin-login.html`
   - Enter master admin credentials (default: username `Gaurav`)
   - You'll be redirected to admin panel after authentication

2. **Master Admin Credentials:**
   - **Default Username:** `Gaurav`
   - **Default Password:** Set via `npm run fix-gaurav-password` script
   - **Location:** Stored in `jewelry_master` database → `master_admins` table

3. **Setup Master Admin Password:**
   ```bash
   cd /var/www/jewelry-app
   npm run fix-gaurav-password
   ```
   This sets the password to: `@GauravSolanki56789__`

4. **Change Master Admin Password:**
   - Edit `scripts/fix-gaurav-password.js`
   - Change the password on line 16
   - Run: `npm run fix-gaurav-password`

5. **Security Features:**
   - ✅ Admin panel requires authentication
   - ✅ Session-based authentication (24-hour sessions)
   - ✅ Only master admin can create clients
   - ✅ Regular users cannot access admin panel
   - ✅ All passwords are hashed (bcrypt)

### What Master Admin Can Do:

- ✅ Create new clients/tenants
- ✅ View all clients
- ✅ Monitor all client databases
- ✅ Generate API keys
- ✅ Access database query interface
- ✅ View statistics and activity

### Regular Users Cannot:

- ❌ Access admin panel
- ❌ Create new clients
- ❌ View other clients' data
- ❌ Access master database

---

## 🆘 TROUBLESHOOTING

### Application Not Starting:
```bash
pm2 logs jewelry-app
# Check for errors
```

### Database Connection Failed:
- Verify database credentials in `.env`
- Check database firewall allows your server IP
- Test connection: `psql -h DB_HOST -p DB_PORT -U DB_USER -d DB_NAME`

### Domain Not Working:
- Check DNS: `nslookup software.my925silver.in`
- Verify Nginx configuration: `nginx -t`
- Check SSL certificate: `certbot certificates`

### 502 Bad Gateway:
- Check if application is running: `pm2 status`
- Check application logs: `pm2 logs jewelry-app`
- Verify port 3000 is accessible: `netstat -tulpn | grep 3000`

---

## 💾 CLOUD BACKUP SETUP

### Automated Daily Backups

1. **Setup backup script:**
   ```bash
   cd /var/www/jewelry-app
   chmod +x scripts/setup-cloud-backup.sh
   ./scripts/setup-cloud-backup.sh
   ```

2. **Configure cloud storage in `.env`:**
   ```env
   # Choose storage: 'local', 's3', 'spaces', or 'dropbox'
   CLOUD_STORAGE=s3
   
   # For AWS S3:
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   S3_BUCKET_NAME=jewelry-backups
   S3_REGION=us-east-1
   
   # For DigitalOcean Spaces:
   SPACES_ACCESS_KEY=your_spaces_key
   SPACES_SECRET_KEY=your_spaces_secret
   SPACES_BUCKET_NAME=jewelry-backups
   SPACES_REGION=nyc3
   
   # Backup retention (days)
   BACKUP_RETENTION_DAYS=7
   ```

3. **Test backup manually:**
   ```bash
   node scripts/cloud-backup.js
   ```

4. **Backups run automatically:**
   - Daily at 2 AM (configured via cron)
   - Stored in `backups/` directory
   - Uploaded to cloud storage (if configured)
   - Old backups auto-deleted after 7 days

### Manual Backup

```bash
# Run backup immediately
node scripts/cloud-backup.js

# Or use npm script
npm run backup-db
```

### Restore from Backup

```bash
# Restore from local backup
npm run restore-db backups/jewelry_master_2025-01-23.sql

# Download from cloud storage first, then restore
```

---

## 📚 NEXT STEPS

1. ✅ **Setup automated backups** (see above)
2. **Configure monitoring** (UptimeRobot, Pingdom)
3. **Setup email notifications** (for errors, backups)
4. **Scale as needed** (upgrade server/database when required)

---

**Last Updated:** January 2025  
**Version:** 2.0.0

