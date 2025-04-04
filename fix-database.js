const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Could not connect to MongoDB Atlas:', err));

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: { type: String, unique: true, required: true },
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    insta_link: { type: String, required: true },
    followers: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    isAdmin: { type: Boolean, default: false }
});

const User = mongoose.model('data', userSchema);

async function fixDatabase() {
    try {
        // Remove all duplicate entries
        const users = await User.find({});
        const seen = new Set();
        const duplicates = [];

        users.forEach(user => {
            if (seen.has(user.phone)) {
                duplicates.push(user._id);
            } else {
                seen.add(user.phone);
            }
        });

        if (duplicates.length > 0) {
            console.log(`Removing ${duplicates.length} duplicate entries...`);
            await User.deleteMany({ _id: { $in: duplicates } });
        }

        // Update admin user
        const adminUser = await User.findOne({ isAdmin: true });
        if (adminUser) {
            adminUser.email = 'admin@luckydraw.com';
            await adminUser.save();
            console.log('Updated admin user email');
        }

        // Final check
        const remainingUsers = await User.find({}).sort({ createdAt: -1 });
        console.log('\nRemaining users after cleanup:');
        remainingUsers.forEach(user => {
            console.log(`\nName: ${user.name}`);
            console.log(`Email: ${user.email}`);
            console.log(`Phone: ${user.phone}`);
            console.log(`Is Admin: ${user.isAdmin}`);
            console.log('------------------------');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

fixDatabase(); 