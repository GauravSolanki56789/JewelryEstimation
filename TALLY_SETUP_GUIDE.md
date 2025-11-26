# Tally Prime Integration Setup Guide

## 🔐 Secure API Key Storage

Your Tally API keys are **encrypted and stored securely** in the database. They are never stored in plain text.

### Where API Keys Are Stored

1. **Database Table**: `tally_config` in your tenant database
2. **Encryption**: API keys are encrypted using AES-256-CBC before storage
3. **Encryption Key**: Stored in `.env` file as `TALLY_ENCRYPTION_KEY` (auto-generated if not set)

### How to Set Encryption Key (Recommended for Production)

1. Open `.env` file in the project root
2. Add this line:
   ```
   TALLY_ENCRYPTION_KEY=your-32-character-hex-key-here
   ```
3. Generate a secure key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Copy the output and paste it as `TALLY_ENCRYPTION_KEY` value

## 📋 Setup Instructions

### Option 1: Tally Gateway (Local Installation)

1. **Enable Tally Gateway**:
   - Open Tally Prime
   - Press `F11` (Company Features)
   - Set "Enable Tally Gateway" to **Yes**
   - Set port to **9000** (default)
   - Click Accept

2. **Configure in Software**:
   - Click **⚙️ Tally Config** button in the header
   - Select "Tally Gateway (Local - Port 9000)"
   - Enter Tally URL: `http://localhost:9000`
   - Enter your Company Name (as it appears in Tally)
   - Click **💾 Save Configuration**

3. **Test Connection**:
   - Click **🔍 Test Connection**
   - You should see "✅ Connection successful!"

### Option 2: Tally Prime Cloud API

1. **Get API Credentials**:
   - Log in to your Tally Prime Cloud account
   - Navigate to API Settings
   - Generate API Key and API Secret
   - Copy both credentials

2. **Configure in Software**:
   - Click **⚙️ Tally Config** button in the header
   - Select "Tally Prime Cloud API"
   - Enter Tally URL (provided by Tally Cloud)
   - Enter your Company Name
   - Paste API Key in "API Key" field
   - Paste API Secret in "API Secret" field
   - Click **💾 Save Configuration**

3. **Test Connection**:
   - Click **🔍 Test Connection**
   - You should see "✅ Connection successful!"

## ⚙️ Configuration Options

### Enable Tally Integration
- Check this box to activate Tally sync
- When unchecked, no data will be sent to Tally

### Auto-sync Transactions
- When enabled, transactions sync automatically:
  - ✅ Sales Bills → Sales Voucher
  - ✅ Purchase Vouchers → Purchase Voucher
  - ✅ Cash Entries → Cash Voucher
  - ✅ Payment/Receipt → Payment/Receipt Voucher
  - ✅ Credit Notes → Credit Note Voucher

### Sync Mode
- **Manual**: Sync transactions only when you click "Sync to Tally"
- **Automatic**: Sync immediately when transactions are created

## 🔄 Manual Sync

You can manually sync any transaction:

1. Go to the relevant section (Sales Bill, Purchase, etc.)
2. Find the transaction you want to sync
3. Click "Sync to Tally" button (if available)
4. Or use API endpoint: `POST /api/:tenant/tally/sync/sales-bill/:id`

## 📊 Sync Logs

View sync history and errors:

- API: `GET /api/:tenant/tally/sync-logs?limit=100&status=failed`
- Shows all sync attempts, success/failure status, and error messages

## 🔒 Security Best Practices

1. **Never share your `.env` file** - It contains encryption keys
2. **Use strong encryption key** - Generate a random 32-byte hex key
3. **Restrict database access** - Only authorized users should access the database
4. **Regular backups** - Backup your database regularly
5. **Monitor sync logs** - Check for failed syncs regularly

## 🐛 Troubleshooting

### Connection Failed
- **Check Tally Gateway**: Ensure Tally Gateway is enabled (F11 → Enable Tally Gateway = Yes)
- **Check Port**: Default port is 9000, verify in Tally settings
- **Check Firewall**: Ensure port 9000 is not blocked
- **Check URL**: For local, use `http://localhost:9000`

### Sync Failed
- **Check Logs**: View sync logs to see error details
- **Check Tally**: Ensure Tally is running and accessible
- **Check Configuration**: Verify company name matches exactly
- **Retry**: Use "Retry Failed Syncs" option

### API Key Issues (Cloud)
- **Verify Credentials**: Ensure API Key and Secret are correct
- **Check Permissions**: Ensure API key has required permissions
- **Check URL**: Verify Tally Cloud URL is correct

## 📝 Supported Transactions

All these transactions can be synced to Tally:

1. **Sales Bills** → Sales Voucher with GST
2. **Purchase Vouchers** → Purchase Voucher
3. **Cash Entries** → Cash Voucher
4. **Payment/Receipt** → Payment/Receipt Voucher
5. **Credit Notes** → Credit Note Voucher

## 🎯 Next Steps

1. Configure Tally connection using the UI
2. Test connection to ensure it works
3. Enable auto-sync if you want automatic syncing
4. Create a test transaction and verify it syncs to Tally
5. Monitor sync logs for any issues

---

**Need Help?** Check the sync logs or contact support.

