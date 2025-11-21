// Quick test script to verify database connection
require('dotenv').config();
const { Pool } = require('pg');

console.log('=== Testing Database Connection ===\n');
console.log('Reading from .env file:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***SET***' : 'NOT SET');
console.log('');

// Try to connect
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'jewelry_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

pool.query('SELECT NOW() as current_time')
    .then(result => {
        console.log('✅ SUCCESS! Database connection works!');
        console.log('Current time from database:', result.rows[0].current_time);
        process.exit(0);
    })
    .catch(error => {
        console.log('❌ ERROR:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Check if password in .env matches PostgreSQL password');
        console.log('2. Check if port is correct (5432 for PG17, 5433 for PG18)');
        console.log('3. Check if database "jewelry_master" exists');
        console.log('4. Make sure .env file is in project root: D:\\JewelryEstimation\\.env');
        process.exit(1);
    });

