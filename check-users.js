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

async function checkUsers() {
    try {
        const totalUsers = await User.countDocuments();
        console.log(`Total users in database: ${totalUsers}`);

        const users = await User.find({});
        console.log('\nUser details:');
        users.forEach(user => {
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

checkUsers(); 