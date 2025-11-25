# Tally Integration Guide

## Overview
Sync sales bills, purchase vouchers, cash entries, and payment/receipt transactions to Tally accounting software.

## Setup

1. **Enable Tally Gateway**:
   - Open Tally → Press F11 → Set "Enable Tally Gateway" to Yes
   - Default port: 9000

2. **Configure in System**:
   ```javascript
   PUT /api/:tenant/tally/config
   {
     "tally_url": "http://localhost:9000",
     "company_name": "Your Company Name",
     "enabled": true,
     "auto_sync_enabled": true
   }
   ```

## API Endpoints

**Base URL**: `http://localhost:3000/api/jpjewellery/tally` (replace `jpjewellery` with your tenant code)

### Configuration

#### Get Configuration
```bash
GET /config
```

#### Update Configuration
```bash
PUT /config
Body: {
  "tally_url": "http://localhost:9000",
  "company_name": "JP Jewellery",
  "enabled": true,
  "auto_sync_enabled": true
}
```

#### Test Connection
```bash
POST /test
```

### Manual Sync

#### Sync Sales Bill
```bash
POST /sync/sales-bill/:id
```

#### Sync Purchase Voucher
```bash
POST /sync/purchase-voucher/:id
```

#### Sync Cash Entry
```bash
POST /sync/cash-entry/:id
```

#### Sync Payment/Receipt
```bash
POST /sync/payment-receipt/:id
```

#### Retry Failed Syncs
```bash
POST /retry-failed
Body: { "maxRetries": 3 }
```

### Sync Logs

#### Get Sync Logs
```bash
GET /sync-logs?limit=100&status=failed
```

**Query Parameters:**
- `limit`: Number of logs (default: 100)
- `status`: `success`, `failed`, or `pending`

## JavaScript Examples

### Configure Tally
```javascript
fetch('http://localhost:3000/api/jpjewellery/tally/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tally_url: "http://localhost:9000",
    company_name: "JP Jewellery",
    enabled: true,
    auto_sync_enabled: true
  })
})
.then(r => r.json())
.then(data => console.log('✅ Configured:', data));
```

### Test Connection
```javascript
fetch('http://localhost:3000/api/jpjewellery/tally/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => {
  if (data.success) {
    console.log('✅ Tally connected!');
  } else {
    console.error('❌ Failed:', data.error);
  }
});
```

### Sync Sales Bill
```javascript
const billId = 123;
fetch(`http://localhost:3000/api/jpjewellery/tally/sync/sales-bill/${billId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
.then(r => r.json())
.then(data => console.log('Sync Result:', data));
```

### Get Failed Syncs
```javascript
fetch('http://localhost:3000/api/jpjewellery/tally/sync-logs?status=failed')
  .then(r => r.json())
  .then(logs => {
    logs.forEach(log => {
      console.log(`❌ ${log.transaction_type} #${log.transaction_id}: ${log.last_error}`);
    });
  });
```

## Automatic Sync

When `auto_sync_enabled` is `true`, transactions automatically sync to Tally:
- Sales Bills → Sales Voucher
- Purchase Vouchers → Purchase Voucher
- Cash Entries → Cash Voucher
- Payment/Receipt → Payment/Receipt Voucher

## Troubleshooting

1. **Check Tally Gateway**: Tally → F11 → Enable Tally Gateway = Yes
2. **Verify URL**: Default is `http://localhost:9000`
3. **Test Connection**: Use `POST /test` endpoint
4. **Check Logs**: Use `GET /sync-logs?status=failed` to see errors
