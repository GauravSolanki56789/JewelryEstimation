# TSPL Thermal Label Printing Guide

## Overview

This system generates TSPL (TSC Printer Language) commands for TSC/Printronix Auto-ID thermal barcode printers, matching the exact layout from your sample labels.

## Features

- ✅ Exact layout matching sample label
- ✅ Two QR codes (stacked vertically, left side)
- ✅ Barcode number, Material, Company Code (right side)
- ✅ Style Code, Weight, Pcs (bottom section)
- ✅ Network (TCP/IP) and USB printer support
- ✅ Real-time synchronization

## Label Layout

Based on your sample label:

```
┌─────────────────────────────────────┐
│ [QR1]  31954489                     │
│        STERLING SILVER              │
│        MY92575                      │
│                                     │
│ [QR2]                               │
│                                     │
│ TURKEY PREMIUM CHAIN                │
│ WT:24.640                           │
│ Pcs:1                               │
└─────────────────────────────────────┘
```

**Label Size:** 100mm x 50mm (standard thermal label)

## Printer Configuration

### Network Printer Setup

1. **Find your printer's IP address:**
   - Check printer display/settings
   - Or print a network configuration label from printer menu

2. **Configure in application:**
   - When printing, enter: `network,IP_ADDRESS,PORT`
   - Example: `network,192.168.1.100,9100`
   - Default port for TSPL is 9100

### USB Printer Setup (Windows)

1. **Find COM port:**
   - Open Device Manager
   - Look under "Ports (COM & LPT)"
   - Note the COM port (e.g., COM3)

2. **Configure in application:**
   - When printing, enter: `usb,COM_PORT`
   - Example: `usb,COM3`

### USB Printer Setup (Linux/Mac)

1. **Find printer device:**
   - Usually `/dev/usb/lp0` or similar
   - Check with `ls /dev/usb/` or `dmesg | grep usb`

2. **Configure in application:**
   - When printing, enter: `usb,/dev/usb/lp0`

## Usage

### From Frontend (Automatic)

When printing barcodes:
1. System will prompt for printer configuration (first time only)
2. Choose "Thermal Label Printer (TSPL)" when prompted
3. Enter printer configuration
4. Labels will print automatically

### From API

```javascript
// Example API call
const response = await fetch('/api/print/label', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        itemData: {
            barcodeNumber: "31954489",
            styleCode: "TURKEY PREMIUM CHAIN",
            weight: "24.640",
            pcs: 1,
            companyCode: "MY92575",
            material: "STERLING SILVER"
        },
        printerConfig: {
            type: "network",  // or "usb"
            address: "192.168.1.100",  // IP or COM port
            port: 9100  // Only for network
        }
    })
});
```

### Generate TSPL Commands Only

```javascript
// Get TSPL commands without printing
const response = await fetch('/api/print/label/tspl', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        itemData: {
            barcodeNumber: "31954489",
            styleCode: "TURKEY PREMIUM CHAIN",
            weight: "24.640",
            pcs: 1,
            companyCode: "MY92575",
            material: "STERLING SILVER"
        }
    })
});

const { tspl } = await response.json();
console.log(tspl); // TSPL command string
```

## TSPL Command Structure

The generated TSPL commands include:

1. **Printer Setup:**
   - Label size: 100mm x 50mm
   - Gap: 3mm
   - Direction: Normal
   - Tear mode: ON

2. **QR Code 1 (Top-left):**
   - Contains: Barcode number
   - Position: (30, 20) dots
   - Size: 80x80 dots (10mm)

3. **QR Code 2 (Below QR1):**
   - Contains: Company code + Weight
   - Position: (30, 110) dots
   - Size: 80x80 dots (10mm)

4. **Text Section (Right side):**
   - Barcode number: (120, 25)
   - Material: (120, 50)
   - Company code: (120, 75)

5. **Bottom Section:**
   - Style Code: (30, 180) - Larger font
   - Weight: (30, 210) - "WT:24.640"
   - Pcs: (30, 235) - "Pcs:1"

## Troubleshooting

### Printer Not Responding

1. **Check connection:**
   - Network: Ping printer IP address
   - USB: Check Device Manager (Windows) or `ls /dev/usb/` (Linux)

2. **Check printer status:**
   - Ensure printer is powered on
   - Check for paper/ribbon
   - Verify printer is not in error state

3. **Check firewall:**
   - Network printers: Ensure port 9100 is open
   - Windows Firewall may block connections

### Labels Print Incorrectly

1. **Check label size:**
   - Ensure printer is configured for 100mm x 50mm labels
   - Adjust in printer settings if needed

2. **Check coordinates:**
   - Coordinates are in dots (203 DPI = 8 dots/mm)
   - Adjust in `scripts/label-printer.js` if needed

3. **Test with TSPL commands:**
   - Use `/api/print/label/tspl` to get commands
   - Review and adjust as needed

### USB Printer Issues (Windows)

1. **Permissions:**
   - Run application as Administrator
   - Or configure printer permissions

2. **COM Port:**
   - Ensure COM port is correct
   - Check Device Manager for actual port

3. **Alternative:**
   - Use network printing if available
   - Or use printer's network interface

## File Structure

```
scripts/
  └── label-printer.js    # TSPL generation and printer communication

server.js                 # API endpoints for label printing
public/index.html         # Frontend integration
```

## API Endpoints

### POST `/api/print/label`
Print label to configured printer.

**Request:**
```json
{
    "itemData": {
        "barcodeNumber": "31954489",
        "styleCode": "TURKEY PREMIUM CHAIN",
        "weight": "24.640",
        "pcs": 1,
        "companyCode": "MY92575",
        "material": "STERLING SILVER"
    },
    "printerConfig": {
        "type": "network",
        "address": "192.168.1.100",
        "port": 9100
    }
}
```

**Response:**
```json
{
    "success": true,
    "message": "Label printed successfully",
    "tspl": "SIZE 100 mm, 50 mm\n..."
}
```

### POST `/api/print/label/tspl`
Generate TSPL commands without printing.

**Request:**
```json
{
    "itemData": {
        "barcodeNumber": "31954489",
        "styleCode": "TURKEY PREMIUM CHAIN",
        "weight": "24.640",
        "pcs": 1,
        "companyCode": "MY92575",
        "material": "STERLING SILVER"
    }
}
```

**Response:**
```json
{
    "tspl": "SIZE 100 mm, 50 mm\n...",
    "itemData": { ... }
}
```

## Notes

- Printer configuration is saved in localStorage
- Labels print one at a time with 500ms delay between prints
- Real-time sync broadcasts print events to other connected clients
- TSPL commands are compatible with TSC TSPL, Printronix Auto-ID, and similar printers

## Support

For issues or questions:
1. Check printer documentation
2. Verify TSPL command syntax
3. Test with TSPL command generation endpoint
4. Review printer logs/status

