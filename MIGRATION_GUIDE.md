# Frontend to Database API Migration Guide

## ✅ Completed Steps

### 1. API Service Layer Created
- Created `api` object with helper functions for all operations
- Handles tenant code automatically
- Includes error handling

### 2. Login Updated
- Added tenant selection dropdown
- Login now uses API first, falls back to local auth
- Stores tenant code in session

### 3. Data Loading
- `loadDataFromAPI()` function loads products, customers, rates after login
- Maps database fields to frontend format

## 🔄 Next Steps (To Complete Migration)

### Step 1: Update Product Operations

Replace these functions to use API:

**Current (localStorage):**
```javascript
function saveProduct() {
    // ... validation ...
    products.push(product);
    setCachedItem('products', products);
}
```

**New (API):**
```javascript
async function saveProduct() {
    // ... validation ...
    try {
        const saved = await api.createProduct(product);
        products.push({ ...product, id: saved.id });
        setCachedItem('products', products); // Keep local cache
        showDialog('Success', 'Product saved to database!', 'success');
    } catch (error) {
        showDialog('Error', 'Failed to save product: ' + error.message, 'error');
    }
}
```

### Step 2: Update Customer Operations

Similar pattern for:
- `saveCustomer()` → `api.createCustomer()`
- `editCustomer()` → `api.updateCustomer()`
- `deleteCustomer()` → `api.deleteCustomer()`

### Step 3: Update Quotation Operations

- `generateQuotePDFWithPayment()` → `api.createQuotation()`
- `editQuotation()` → `api.updateQuotation()`
- `deleteQuotation()` → `api.deleteQuotation()`

### Step 4: Update Bill Operations

- `generateSalesBillPDF()` → `api.createBill()`

### Step 5: Update Search Operations

**Products Tab:**
```javascript
async function filterProducts() {
    const searchTerm = document.getElementById('productSearch').value;
    if (searchTerm.length < 2) return;
    
    try {
        const results = await api.getProducts(searchTerm);
        displayProducts(results);
    } catch (error) {
        console.error('Search error:', error);
    }
}
```

## 📋 Migration Checklist

- [x] API service layer created
- [x] Login with tenant selection
- [x] Initial data loading
- [ ] Product CRUD operations
- [ ] Customer CRUD operations
- [ ] Quotation CRUD operations
- [ ] Bill operations
- [ ] Rates operations
- [ ] ROL operations
- [ ] Ledger operations
- [ ] PV Stock operations

## 🔧 Testing

After each migration step:
1. Test the operation (create, update, delete)
2. Verify data persists in database
3. Refresh page and verify data loads
4. Test with different tenants

## 📝 Notes

- Keep localStorage as cache for faster UI updates
- Sync to database in background
- Show user feedback for API operations
- Handle offline scenarios gracefully

