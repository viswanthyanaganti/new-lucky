const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const session = require('express-session')
const http = require('http')
const WebSocket = require('ws')
require('dotenv').config()
const port = process.env.PORT || 3018

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store all connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New client connected. Total clients:', clients.size);
    
    // Send initial data to new client
    if (ws.readyState === WebSocket.OPEN) {
        User1.find({ isAdmin: false }, {
            name: 1,
            email: 1,
            followers: 1,
            createdAt: 1,
            isWinner: 1,
            winningPosition: 1,
            _id: 1
        }).sort({ createdAt: -1 }).then(users => {
            const totalCount = users.length;
            ws.send(JSON.stringify({
                type: 'users_update',
                users,
                totalCount
            }));
        });
    }
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected. Total clients:', clients.size);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Function to broadcast updates to all connected clients
const broadcastUpdate = async (data) => {
    console.log('Broadcasting update to', clients.size, 'clients');
    const message = JSON.stringify(data);
    
    // Create a promise for each client's send operation
    const sendPromises = Array.from(clients).map(client => {
        return new Promise((resolve, reject) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message, (error) => {
                    if (error) {
                        console.error('Error sending message to client:', error);
                        clients.delete(client);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } else {
                clients.delete(client);
                resolve();
            }
        });
    });

    // Wait for all messages to be sent
    try {
        await Promise.all(sendPromises);
        console.log('All messages sent successfully');
    } catch (error) {
        console.error('Error broadcasting messages:', error);
    }
};

app.use(express.static(__dirname))
app.use(express.urlencoded({extended:true}))
app.use(express.json())

// Add session middleware
app.use(session({
    secret: 'lucky-prize-draw-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // set to true if using https
}))

// MongoDB Atlas connections for both databases
const connectToMongoDB = async () => {
    try {
        // First database connection
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'lucky_draw_1'
        });
        console.log('Connected to first MongoDB Atlas database');

        // Second database connection
        const secondDb = mongoose.createConnection(process.env.MONGODB_URI, {
            dbName: 'lucky_draw_2'
        });
        console.log('Connected to second MongoDB Atlas database');

        // Create models for both databases
        const userSchema = new mongoose.Schema({
            name:{ type: String, required: true },
            email:{ type: String, unique: true, required: true },
            phone:{ type: String, unique: true, required: true },
            age:{ type: Number, required: true },
            gender:{ type: String, required: true },
            insta_link:{ type: String, required: true },
            followers:{ type: Number, required: true },
            createdAt: { type: Date, default: Date.now },
            isAdmin: { type: Boolean, default: false },
            isWinner: { type: Boolean, default: false },
            winningPosition: { type: Number, default: null }
        });

        const User1 = mongoose.model('data', userSchema);
        const User2 = secondDb.model('data', userSchema);

        // Store models globally for use in routes
        global.User1 = User1;
        global.User2 = User2;

        return { User1, User2 };
    } catch (err) {
        console.error('Could not connect to MongoDB Atlas:', err);
        throw err;
    }
};

// Initialize database connections
let User1, User2;
connectToMongoDB().then(({ User1: u1, User2: u2 }) => {
    User1 = u1;
    User2 = u2;
}).catch(err => {
    console.error('Failed to initialize databases:', err);
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.session.user || !req.session.user.isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
}

// Serve static files
app.use(express.static('public'));

// Root route redirects to register page
app.get('/', (req, res) => {
    res.redirect('/register');
});

// Serve login page
app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/users');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Handle login
app.post('/login', async (req, res) => {
    try {
        const { name, phone } = req.body;
        
        // Find user by name and phone
        const user = await User1.findOne({ name, phone });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials. Please check your name and mobile number.'
            });
        }
        
        // Set user session
        req.session.user = {
            id: user._id,
            name: user.name,
            phone: user.phone,
            isAdmin: user.isAdmin
        };
        
        res.json({
            success: true,
            message: 'Login successful',
            isAdmin: user.isAdmin
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during login'
        });
    }
});

// Reset winners endpoint (admin only)
app.post('/reset-winners', requireAdmin, async (req, res) => {
    try {
        // Reset all winners
        await User1.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });
        await User2.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });

        res.json({
            success: true,
            message: 'Winners reset successfully'
        });
    } catch (error) {
        console.error('Error resetting winners:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting winners'
        });
    }
});

// Draw winners endpoint (admin only)
app.post('/draw-winners', requireAdmin, async (req, res) => {
    try {
        // Reset previous winners in both databases
        await User1.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });
        await User2.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });

        // Get all non-admin users from both databases
        const users1 = await User1.find({ isAdmin: false });
        const users2 = await User2.find({ isAdmin: false });
        
        // Combine users from both databases
        const allUsers = [...users1, ...users2];
        
        if (allUsers.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Need at least 10 users to draw winners'
            });
        }

        // Shuffle users array
        const shuffled = allUsers.sort(() => 0.5 - Math.random());
        
        // Select first 10 as winners
        const winners = shuffled.slice(0, 10);
        
        // Update winners in both databases
        for (let i = 0; i < winners.length; i++) {
            const winner = winners[i];
            const isFromFirstDb = winner._id.toString().startsWith(winner._id.toString());
            
            if (isFromFirstDb) {
                await User1.findByIdAndUpdate(winner._id, {
                    isWinner: true,
                    winningPosition: i + 1
                });
            } else {
                await User2.findByIdAndUpdate(winner._id, {
                    isWinner: true,
                    winningPosition: i + 1
                });
            }
        }

        res.json({
            success: true,
            message: 'Winners drawn successfully!'
        });
    } catch (error) {
        console.error('Error drawing winners:', error);
        res.status(500).json({
            success: false,
            message: 'Error drawing winners'
        });
    }
});

// Predefined winners list
const predefinedWinners = {
    first: "test2@gmail.com",
    second: "test1@gmail.com",
    third: "test3@gmail.com",
    fourth: "test4@gmail.com",
    fifth: "test5@gmail.com",
    sixth: "test6@gmail.com",
    seventh: "test7@gmail.com",
    eighth: "test8@gmail.com",
    ninth: "test9@gmail.com",
    tenth: "test10@gmail.com"
};

// Check predefined winners endpoint
app.get('/check-predefined-winners', requireAdmin, async (req, res) => {
    try {
        const predefinedEmails = Object.values(predefinedWinners);
        const foundUsers = await User1.find({ 
            email: { $in: predefinedEmails },
            isAdmin: false 
        });

        // Create a map of email to user data
        const emailToUser = {};
        foundUsers.forEach(user => {
            emailToUser[user.email] = user;
        });

        // Map predefined positions to found users
        const mappedWinners = {};
        for (const [position, email] of Object.entries(predefinedWinners)) {
            if (emailToUser[email]) {
                mappedWinners[position] = emailToUser[email];
            }
        }

        // Check if all required winners are present
        const canFixWinners = Object.keys(mappedWinners).length === Object.keys(predefinedWinners).length;

        res.json({
            success: true,
            canFixWinners,
            mappedWinners
        });
    } catch (error) {
        console.error('Error checking predefined winners:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking predefined winners'
        });
    }
});

// Fix specific winners endpoint (admin only)
app.post('/fix-winners', requireAdmin, async (req, res) => {
    try {
        // Check if this is the second click by checking if there are any non-admin users
        const existingUsers = await User1.find({ isAdmin: false });
        
        if (existingUsers.length === 0) {
            // This is the second click - just redirect to registration
            return res.json({
                success: true,
                message: 'Redirecting to registration...'
            });
        }

        // First click behavior - proceed with winner fixing
        // Get predefined winners from MongoDB
        const predefinedEmails = Object.values(predefinedWinners);
        const foundUsers = await User1.find({ 
            email: { $in: predefinedEmails },
            isAdmin: false 
        });

        if (foundUsers.length !== Object.keys(predefinedWinners).length) {
            return res.status(400).json({
                success: false,
                message: 'More users should register'
            });
        }

        // Reset previous winners in both databases
        await User1.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });
        await User2.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });

        // Create a map of email to position
        const emailToPosition = {};
        Object.entries(predefinedWinners).forEach(([position, email]) => {
            emailToPosition[email] = Object.keys(predefinedWinners).indexOf(position) + 1;
        });

        // Update winners based on predefined positions in both databases
        for (const user of foundUsers) {
            const position = emailToPosition[user.email];
            await User1.findByIdAndUpdate(user._id, {
                isWinner: true,
                winningPosition: position
            });
            
            // Also update the corresponding user in the second database
            const user2 = await User2.findOne({ email: user.email });
            if (user2) {
                await User2.findByIdAndUpdate(user2._id, {
                    isWinner: true,
                    winningPosition: position
                });
            }
        }

        // Get updated users list
        const users = await User1.find(
            { isAdmin: false },
            {
                name: 1,
                email: 1,
                followers: 1,
                createdAt: 1,
                isWinner: 1,
                winningPosition: 1,
                _id: 1
            }
        ).sort({ createdAt: -1 });

        const totalCount = await User1.countDocuments({ isAdmin: false });
        
        // Broadcast update to all clients
        await broadcastUpdate({
            type: 'users_update',
            users,
            totalCount
        });

        // Wait for 10 seconds before deleting data to ensure all clients receive the update
        setTimeout(async () => {
            try {
                await User1.deleteMany({ isAdmin: false });
                console.log('All non-admin users deleted from first database after winner declaration');
                
                // Broadcast empty update after deletion
                await broadcastUpdate({
                    type: 'users_update',
                    users: [],
                    totalCount: 0
                });
            } catch (error) {
                console.error('Error deleting users after winner declaration:', error);
            }
        }, 10000);

        res.json({
            success: true,
            message: 'Winners fixed successfully!'
        });
    } catch (error) {
        console.error('Error fixing winners:', error);
        res.status(500).json({
            success: false,
            message: 'Error fixing winners'
        });
    }
});

// Logout endpoint
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/register');
});

// Serve registration page
app.get('/register', (req,res)=>{
    res.sendFile(path.join(__dirname,'register.html'))
})

// Serve users display page (no auth required)
app.get('/users', (req,res)=>{
    res.sendFile(path.join(__dirname,'users.html'))
})

// Get all users (no auth required)
app.get('/users/data', async (req, res) => {
    try {
        // Get non-admin users
        const users = await User1.find(
            { isAdmin: false }, 
            {
                name: 1,
                email: 1,
                followers: 1,
                createdAt: 1,
                isWinner: 1,
                winningPosition: 1,
                _id: 1
            }
        ).sort({ createdAt: -1 });

        // Get total count excluding admin
        const totalCount = await User1.countDocuments({ isAdmin: false });
        
        // Send response with users and admin status
        res.json({
            users,
            totalCount,
            isAdmin: req.session.user?.isAdmin || false
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching users' 
        });
    }
});

app.post('/post', async (req, res) => {
    try {
        const userData = req.body;
        
        // Create user in first database
        const user1 = new User1(userData);
        await user1.save();

        // Create user in second database
        const user2 = new User2(userData);
        await user2.save();

        res.json({
            success: true,
            message: 'Registration successful!'
        });
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving user data'
        });
    }
});

// Reset winners and clear all non-admin user data endpoint (admin only)
app.post('/reset-and-clear', requireAdmin, async (req, res) => {
    try {
        // Reset all winners in both databases
        await User1.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });
        await User2.updateMany({}, { 
            isWinner: false, 
            winningPosition: null 
        });

        // Delete all non-admin users only from the first database
        await User1.deleteMany({ isAdmin: false });

        res.json({
            success: true,
            message: 'Winners reset and user data cleared from first database successfully'
        });
    } catch (error) {
        console.error('Error resetting and clearing data:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting and clearing data'
        });
    }
});

// Modify the get route to fetch data from both databases
app.get('/get', async (req, res) => {
    try {
        // Get users from both databases
        const users1 = await User1.find({});
        const users2 = await User2.find({});

        // Combine users from both databases
        const allUsers = [...users1, ...users2];

        res.json({
            success: true,
            data: allUsers
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user data'
        });
    }
});

// Update the server to use the HTTP server
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});