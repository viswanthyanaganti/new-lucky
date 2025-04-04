require('dotenv').config();
const mongoose = require('mongoose');

async function createAdmin() {
    try {
        // First database connection
        const db1 = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'lucky_draw_1'
        });
        console.log('Connected to first database');

        // Second database connection
        const db2 = mongoose.createConnection(process.env.MONGODB_URI, {
            dbName: 'lucky_draw_2'
        });
        console.log('Connected to second database');

        // Create user schema
        const userSchema = new mongoose.Schema({
            name: String,
            email: String,
            phone: String,
            age: Number,
            gender: String,
            insta_link: String,
            followers: Number,
            isAdmin: Boolean,
            createdAt: { type: Date, default: Date.now }
        });

        // Create models for both databases
        const User1 = db1.model('data', userSchema);
        const User2 = db2.model('data', userSchema);

        // Admin user data
        const adminData = {
            name: 'Admin',
            email: 'admin@example.com',
            phone: '9999999998',
            age: 25,
            gender: 'other',
            insta_link: 'https://instagram.com/admin',
            followers: 0,
            isAdmin: true
        };

        // Check if admin already exists in first database
        const existingAdmin1 = await User1.findOne({ phone: adminData.phone });
        if (!existingAdmin1) {
            await User1.create(adminData);
            console.log('Admin user created in first database');
        } else {
            console.log('Admin user already exists in first database');
        }

        // Check if admin already exists in second database
        const existingAdmin2 = await User2.findOne({ phone: adminData.phone });
        if (!existingAdmin2) {
            await User2.create(adminData);
            console.log('Admin user created in second database');
        } else {
            console.log('Admin user already exists in second database');
        }

        console.log('Admin creation process completed');
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin(); 