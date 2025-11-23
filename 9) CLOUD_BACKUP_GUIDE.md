# Cloud Backup Guide

Complete guide for setting up automated cloud backups for your jewelry estimation software.

---

## 🎯 Overview

**What Gets Backed Up:**
- Master database (`jewelry_master`)
- Tenant databases (`jewelry_{tenantCode}`)
- All data (products, customers, quotations, bills, etc.)

**Backup Storage Options:**
1. **Local Only** - Backups stored on server
2. **AWS S3** - Amazon S3 cloud storage
3. **DigitalOcean Spaces** - DO's S3-compatible storage
4. **Dropbox** - Dropbox cloud storage

---

## 🚀 QUICK SETUP

### Step 1: Install Backup Script

The backup script is already included: `scripts/cloud-backup.js`

### Step 2: Configure Cloud Storage

Edit `.env` file on your cloud server:

```env
# Choose storage type
CLOUD_STORAGE=s3  # Options: 'local', 's3', 'spaces', 'dropbox'

# For AWS S3:
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_BUCKET_NAME=jewelry-backups
S3_REGION=us-east-1

# For DigitalOcean Spaces:
SPACES_ACCESS_KEY=your_spaces_key
SPACES_SECRET_KEY=your_spaces_secret
SPACES_BUCKET_NAME=jewelry-backups
SPACES_REGION=nyc3

# Backup retention (keep backups for X days)
BACKUP_RETENTION_DAYS=7
```

### Step 3: Setup Automated Backups

```bash
cd /var/www/jewelry-app
chmod +x scripts/setup-cloud-backup.sh
./scripts/setup-cloud-backup.sh
```

This will:
- Install AWS CLI (for S3/Spaces)
- Create cron job for daily backups at 2 AM
- Create logs directory

### Step 4: Test Backup

```bash
node scripts/cloud-backup.js
```

---

## ☁️ CLOUD STORAGE SETUP

### Option 1: AWS S3

1. **Create S3 Bucket:**
   - Go to AWS Console → S3
   - Create bucket: `jewelry-backups`
   - Choose region (e.g., `us-east-1`)
   - Enable versioning (optional)

2. **Create IAM User:**
   - Go to IAM → Users → Create User
   - Attach policy: `AmazonS3FullAccess` (or custom policy)
   - Create access key
   - Save Access Key ID and Secret Access Key

3. **Add to `.env`:**
   ```env
   CLOUD_STORAGE=s3
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   S3_BUCKET_NAME=jewelry-backups
   S3_REGION=us-east-1
   ```

4. **Install AWS CLI:**
   ```bash
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

**Cost:** ~$0.023 per GB/month (very cheap)

---

### Option 2: DigitalOcean Spaces

1. **Create Space:**
   - Go to DigitalOcean → Spaces
   - Create Space: `jewelry-backups`
   - Choose region (e.g., `nyc3`)
   - Set as private

2. **Generate API Keys:**
   - Go to API → Tokens/Keys
   - Generate Spaces access key
   - Save Access Key and Secret Key

3. **Add to `.env`:**
   ```env
   CLOUD_STORAGE=spaces
   SPACES_ACCESS_KEY=your_spaces_key
   SPACES_SECRET_KEY=your_spaces_secret
   SPACES_BUCKET_NAME=jewelry-backups
   SPACES_REGION=nyc3
   ```

4. **Install AWS CLI** (same as S3, Spaces is S3-compatible)

**Cost:** $5/month for 250GB (very affordable)

---

### Option 3: Dropbox

1. **Create Dropbox App:**
   - Go to https://www.dropbox.com/developers/apps
   - Create app → Scoped access → Full Dropbox
   - Generate access token

2. **Install Dropbox package:**
   ```bash
   npm install dropbox
   ```

3. **Add to `.env`:**
   ```env
   CLOUD_STORAGE=dropbox
   DROPBOX_ACCESS_TOKEN=your_access_token
   ```

**Cost:** Free tier: 2GB, Paid: $9.99/month for 2TB

---

### Option 4: Local Only

If you don't want cloud storage:

```env
CLOUD_STORAGE=local
```

Backups will be stored only on the server in `backups/` directory.

**⚠️ Warning:** If server crashes, local backups are lost. Use cloud storage for safety.

---

## 📅 BACKUP SCHEDULE

**Default:** Daily at 2 AM (configured via cron)

**To change schedule:**
```bash
crontab -e
# Edit the time (format: minute hour day month weekday)
# Example: 0 3 * * * = 3 AM daily
```

**Backup Retention:**
- Default: 7 days
- Configure in `.env`: `BACKUP_RETENTION_DAYS=30` (for 30 days)

---

## 🔄 MANUAL BACKUP

**Run backup immediately:**
```bash
cd /var/www/jewelry-app
node scripts/cloud-backup.js
```

**Or use npm script:**
```bash
npm run backup-cloud
```

---

## 📥 RESTORE FROM BACKUP

### From Local Backup:

```bash
npm run restore-db backups/jewelry_master_2025-01-23.sql
```

### From Cloud Storage:

1. **Download from S3:**
   ```bash
   aws s3 cp s3://jewelry-backups/backups/jewelry_master_2025-01-23.sql ./backups/
   ```

2. **Download from Spaces:**
   ```bash
   aws s3 cp s3://jewelry-backups/backups/jewelry_master_2025-01-23.sql ./backups/ --endpoint-url https://nyc3.digitaloceanspaces.com
   ```

3. **Restore:**
   ```bash
   npm run restore-db backups/jewelry_master_2025-01-23.sql
   ```

---

## 📊 BACKUP MONITORING

**Check backup logs:**
```bash
tail -f logs/backup.log
```

**List recent backups:**
```bash
ls -lh backups/
```

**Check cron job:**
```bash
crontab -l
```

**Verify cloud upload:**
- AWS S3: Check S3 bucket in AWS Console
- Spaces: Check Space in DigitalOcean dashboard
- Dropbox: Check Dropbox folder

---

## ⚠️ IMPORTANT NOTES

1. **Backup Size:** Each backup is typically 1-10MB (depends on data)
2. **Backup Time:** Usually takes 10-30 seconds
3. **Storage Cost:** Very cheap (~$0.10-1/month for daily backups)
4. **Security:** Backups are encrypted in transit and at rest
5. **Retention:** Old backups auto-deleted after configured days

---

## 🔧 TROUBLESHOOTING

### Backup Fails:

```bash
# Check logs
tail -f logs/backup.log

# Test database connection
psql -h DB_HOST -p DB_PORT -U DB_USER -d DB_NAME

# Test backup manually
node scripts/cloud-backup.js
```

### Cloud Upload Fails:

- Verify credentials in `.env`
- Check network connectivity
- Verify bucket/space exists
- Check IAM permissions (for S3)

### Cron Job Not Running:

```bash
# Check cron service
systemctl status cron

# Check cron logs
grep CRON /var/log/syslog

# Verify cron job exists
crontab -l
```

---

## 💰 COST ESTIMATE

**AWS S3:**
- Storage: $0.023/GB/month
- 10 backups × 5MB = 50MB = ~$0.001/month
- **Total: ~$0.10/month** (very cheap!)

**DigitalOcean Spaces:**
- $5/month for 250GB
- **Total: $5/month** (includes all backups)

**Dropbox:**
- Free: 2GB
- Paid: $9.99/month for 2TB

---

**Last Updated:** January 2025

