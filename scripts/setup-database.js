// Database Setup Script
// Run this once to initialize the master database
require('dotenv').config(); // Load .env file first
const { masterPool, initMasterDatabase } = require('../config/database');

async function setup() {
    try {
        console.log('🚀 Setting up master database...');
        await initMasterDatabase();
        console.log('✅ Master database setup complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Create tenants using POST /api/tenants');
        console.log('2. Each tenant will get their own database');
        process.exit(0);
    } catch (error) {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    }
}

setup();

