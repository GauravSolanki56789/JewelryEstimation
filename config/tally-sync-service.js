// Tally Sync Service
// Handles syncing transactions to Tally with retry logic, logging, and cloud sync support
const TallyIntegration = require('./tally-integration');
const { getTenantPool, queryTenant } = require('./database');

class TallySyncService {
    constructor(tenantCode) {
        this.tenantCode = tenantCode;
        this.tallyIntegration = null;
        this.config = null;
    }

    /**
     * Initialize Tally integration with tenant config
     */
    async initialize() {
        try {
            const pool = getTenantPool(this.tenantCode);
            const configResult = await pool.query('SELECT * FROM tally_config ORDER BY id DESC LIMIT 1');
            
            if (configResult.rows.length === 0) {
                // Create default config
                await pool.query(`
                    INSERT INTO tally_config (tally_url, company_name, enabled, sync_mode, auto_sync_enabled)
                    VALUES ('http://localhost:9000', 'Default Company', false, 'manual', false)
                `);
                this.config = {
                    tally_url: 'http://localhost:9000',
                    company_name: 'Default Company',
                    enabled: false,
                    sync_mode: 'manual',
                    auto_sync_enabled: false
                };
            } else {
                this.config = configResult.rows[0];
            }

            this.tallyIntegration = new TallyIntegration({
                tallyUrl: this.config.tally_url,
                companyName: this.config.company_name,
                enabled: this.config.enabled,
                syncMode: this.config.sync_mode
            });

            return true;
        } catch (error) {
            console.error(`Error initializing Tally sync for tenant ${this.tenantCode}:`, error);
            return false;
        }
    }

    /**
     * Check if Tally sync is enabled and should auto-sync
     */
    shouldAutoSync() {
        return this.config && this.config.enabled && this.config.auto_sync_enabled;
    }

    /**
     * Log sync attempt to database
     */
    async logSync(transactionType, transactionId, transactionRef, status, error = null, tallyResponse = null) {
        try {
            const pool = getTenantPool(this.tenantCode);
            
            // Check if log entry exists
            const existing = await pool.query(
                'SELECT * FROM tally_sync_log WHERE transaction_type = $1 AND transaction_id = $2',
                [transactionType, transactionId]
            );

            if (existing.rows.length > 0) {
                // Update existing log
                await pool.query(`
                    UPDATE tally_sync_log 
                    SET sync_status = $1, 
                        sync_attempts = sync_attempts + 1,
                        last_sync_at = CURRENT_TIMESTAMP,
                        last_error = $2,
                        tally_response = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE transaction_type = $4 AND transaction_id = $5
                `, [status, error, tallyResponse ? JSON.stringify(tallyResponse) : null, transactionType, transactionId]);
            } else {
                // Create new log entry
                await pool.query(`
                    INSERT INTO tally_sync_log (
                        transaction_type, transaction_id, transaction_ref, 
                        sync_status, sync_attempts, last_sync_at, last_error, tally_response
                    ) VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP, $5, $6)
                `, [
                    transactionType, 
                    transactionId, 
                    transactionRef,
                    status, 
                    error, 
                    tallyResponse ? JSON.stringify(tallyResponse) : null
                ]);
            }
        } catch (error) {
            console.error('Error logging Tally sync:', error);
        }
    }

    /**
     * Sync Sales Bill to Tally
     */
    async syncSalesBill(bill, autoSync = false) {
        if (!this.config || !this.config.enabled) {
            return { success: false, message: 'Tally integration is disabled' };
        }

        if (autoSync && !this.shouldAutoSync()) {
            return { success: false, message: 'Auto-sync is disabled' };
        }

        try {
            await this.initialize();
            
            const result = await this.tallyIntegration.syncSalesBill(bill);
            
            // Log the sync attempt
            await this.logSync(
                'sales_bill',
                bill.id,
                bill.bill_no || bill.billNo,
                result.success ? 'success' : 'failed',
                result.error || null,
                result.tallyResponse || null
            );

            return result;
        } catch (error) {
            await this.logSync(
                'sales_bill',
                bill.id,
                bill.bill_no || bill.billNo,
                'failed',
                error.message,
                null
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync Purchase Voucher to Tally
     */
    async syncPurchaseVoucher(pv, autoSync = false) {
        if (!this.config || !this.config.enabled) {
            return { success: false, message: 'Tally integration is disabled' };
        }

        if (autoSync && !this.shouldAutoSync()) {
            return { success: false, message: 'Auto-sync is disabled' };
        }

        try {
            await this.initialize();
            
            const result = await this.tallyIntegration.syncPurchaseVoucher(pv);
            
            // Log the sync attempt
            await this.logSync(
                'purchase_voucher',
                pv.id,
                pv.pv_no || pv.pvNo,
                result.success ? 'success' : 'failed',
                result.error || null,
                result.tallyResponse || null
            );

            return result;
        } catch (error) {
            await this.logSync(
                'purchase_voucher',
                pv.id,
                pv.pv_no || pv.pvNo,
                'failed',
                error.message,
                null
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync Cash Entry to Tally
     */
    async syncCashEntry(transaction, autoSync = false) {
        if (!this.config || !this.config.enabled) {
            return { success: false, message: 'Tally integration is disabled' };
        }

        if (autoSync && !this.shouldAutoSync()) {
            return { success: false, message: 'Auto-sync is disabled' };
        }

        try {
            await this.initialize();
            
            const result = await this.tallyIntegration.syncCashEntry(transaction);
            
            // Log the sync attempt
            await this.logSync(
                'cash_entry',
                transaction.id,
                transaction.reference || transaction.bill_no || '',
                result.success ? 'success' : 'failed',
                result.error || null,
                result.tallyResponse || null
            );

            return result;
        } catch (error) {
            await this.logSync(
                'cash_entry',
                transaction.id,
                transaction.reference || transaction.bill_no || '',
                'failed',
                error.message,
                null
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync Payment/Receipt to Tally
     */
    async syncPaymentReceipt(transaction, autoSync = false) {
        if (!this.config || !this.config.enabled) {
            return { success: false, message: 'Tally integration is disabled' };
        }

        if (autoSync && !this.shouldAutoSync()) {
            return { success: false, message: 'Auto-sync is disabled' };
        }

        try {
            await this.initialize();
            
            const result = await this.tallyIntegration.syncPaymentReceipt(transaction);
            
            // Log the sync attempt
            await this.logSync(
                'payment_receipt',
                transaction.id,
                transaction.reference || transaction.bill_no || '',
                result.success ? 'success' : 'failed',
                result.error || null,
                result.tallyResponse || null
            );

            return result;
        } catch (error) {
            await this.logSync(
                'payment_receipt',
                transaction.id,
                transaction.reference || transaction.bill_no || '',
                'failed',
                error.message,
                null
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Retry failed syncs
     */
    async retryFailedSyncs(maxRetries = 3) {
        try {
            const pool = getTenantPool(this.tenantCode);
            const failedSyncs = await pool.query(`
                SELECT * FROM tally_sync_log 
                WHERE sync_status = 'failed' 
                AND sync_attempts < $1
                ORDER BY created_at ASC
            `, [maxRetries]);

            const results = [];

            for (const syncLog of failedSyncs.rows) {
                try {
                    let result;
                    
                    // Fetch the original transaction data based on type
                    if (syncLog.transaction_type === 'sales_bill') {
                        const bill = await pool.query('SELECT * FROM bills WHERE id = $1', [syncLog.transaction_id]);
                        if (bill.rows.length > 0) {
                            result = await this.syncSalesBill(bill.rows[0], false);
                        }
                    } else if (syncLog.transaction_type === 'purchase_voucher') {
                        const pv = await pool.query('SELECT * FROM purchase_vouchers WHERE id = $1', [syncLog.transaction_id]);
                        if (pv.rows.length > 0) {
                            result = await this.syncPurchaseVoucher(pv.rows[0], false);
                        }
                    } else if (syncLog.transaction_type === 'cash_entry') {
                        const transaction = await pool.query('SELECT * FROM ledger_transactions WHERE id = $1', [syncLog.transaction_id]);
                        if (transaction.rows.length > 0) {
                            result = await this.syncCashEntry(transaction.rows[0], false);
                        }
                    } else if (syncLog.transaction_type === 'payment_receipt') {
                        const transaction = await pool.query('SELECT * FROM ledger_transactions WHERE id = $1', [syncLog.transaction_id]);
                        if (transaction.rows.length > 0) {
                            result = await this.syncPaymentReceipt(transaction.rows[0], false);
                        }
                    }

                    results.push({
                        transactionType: syncLog.transaction_type,
                        transactionId: syncLog.transaction_id,
                        success: result ? result.success : false
                    });
                } catch (error) {
                    console.error(`Error retrying sync for ${syncLog.transaction_type}:${syncLog.transaction_id}:`, error);
                }
            }

            return results;
        } catch (error) {
            console.error('Error retrying failed syncs:', error);
            return [];
        }
    }

    /**
     * Get sync logs
     */
    async getSyncLogs(limit = 100, status = null) {
        try {
            const pool = getTenantPool(this.tenantCode);
            let query = 'SELECT * FROM tally_sync_log ORDER BY created_at DESC LIMIT $1';
            const params = [limit];

            if (status) {
                query = 'SELECT * FROM tally_sync_log WHERE sync_status = $1 ORDER BY created_at DESC LIMIT $2';
                params.unshift(status);
            }

            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            console.error('Error getting sync logs:', error);
            return [];
        }
    }

    /**
     * Test Tally connection
     */
    async testConnection() {
        try {
            await this.initialize();
            return await this.tallyIntegration.testConnection();
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Update Tally configuration
     */
    async updateConfig(newConfig) {
        try {
            const pool = getTenantPool(this.tenantCode);
            const result = await pool.query(`
                UPDATE tally_config 
                SET tally_url = $1, 
                    company_name = $2, 
                    enabled = $3, 
                    sync_mode = $4, 
                    auto_sync_enabled = $5,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = (SELECT id FROM tally_config ORDER BY id DESC LIMIT 1)
                RETURNING *
            `, [
                newConfig.tally_url || this.config.tally_url,
                newConfig.company_name || this.config.company_name,
                newConfig.enabled !== undefined ? newConfig.enabled : this.config.enabled,
                newConfig.sync_mode || this.config.sync_mode,
                newConfig.auto_sync_enabled !== undefined ? newConfig.auto_sync_enabled : this.config.auto_sync_enabled
            ]);

            this.config = result.rows[0];
            await this.initialize();
            
            return { success: true, config: this.config };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get current configuration
     */
    async getConfig() {
        try {
            await this.initialize();
            return { success: true, config: this.config };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = TallySyncService;

