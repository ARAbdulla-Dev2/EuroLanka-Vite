const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const PORT = process.env.PORT || 3333;
const eveloDB = require('evelodb');
const db = new eveloDB();
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const engine = require('./engine');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'db', 'img', 'pp');
        fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir));
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        
        if (file.fieldname === 'profilePic') {
            cb(null, `user_${timestamp}${ext}`);
        } else if (file.fieldname === 'companyLogo') {
            cb(null, `company_user_${timestamp}${ext}`);
        } else {
            cb(null, `file_${timestamp}${ext}`);
        }
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 2 // Maximum 2 files (profilePic and companyLogo)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (JPEG, PNG, GIF)'));
        }
    }
}).fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'companyLogo', maxCount: 1 }
]);

// Middleware
app.use(bodyParser.json());
app.use(express.json());
// Configure CORS options
const corsOptions = {
  origin: [
    'https://itinerary.arabdullah.top',
    'https://map-framer-orpin.vercel.app',
    'http://localhost:3333',
    'http://127.0.0.1:3333'
  ],
  optionsSuccessStatus: 200 // For legacy browser support
};

// Apply CORS middleware with options
app.use(cors(corsOptions));
app.use(express.static(path.join(__dirname, 'public', 'dist')));

// Helper functions
function generateUserId() {
    return `user_${Date.now()}`;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validateURL(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

// API endpoints
app.get('/api/data/users.json', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(__dirname, 'evelodatabase', 'users.json'), 'utf8');
        const users = JSON.parse(data);
        res.json(users);
    } catch (error) {
        console.error('Error reading users.json:', error);
        res.status(500).json({ error: 'Failed to load user data' });
    }
});

app.get('/api/data/activity.json', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(__dirname, 'db', 'activityData.json'), 'utf8');
        const activity = JSON.parse(data);
        res.json(activity);
    } catch (error) {
        console.error('Error reading activity.json:', error);
        res.status(500).json({ error: 'Failed to load activity data' });
    }
});

app.get('/api/data/hotels.json', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(__dirname, 'db', 'hotelData.json'), 'utf8');
        const hotel = JSON.parse(data);
        res.json(hotel);
    } catch (error) {
        console.error('Error reading hotel.json:', error);
        res.status(500).json({ error: 'Failed to load hotel data' });
    }
});

app.get('/api/data/cities.sql', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'db', 'gh', 'cities.sql');
        const data = await fs.readFile(filePath, 'utf8');
        
        res.setHeader('Content-Type', 'text/plain'); // or 'application/sql'
        res.send(data); // sends raw SQL text
    } catch (error) {
        console.error('Error sending SQL file:', error);
        res.status(500).send('Internal Server Error');
    }
});



//======================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = db.findOne('users', { username, password });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid username or password' });
        }
        
        // Update last login timestamp
        const updatedUser = db.update('users', user.id, { 
            ...user,
            lastLogin: new Date().toISOString()
        });
        
        // Remove sensitive data before sending
        const { password: _, ...userData } = updatedUser;
        res.json({ ...userData, success: true });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Failed to process login' });
    }
});

app.post('/api/register', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ 
                    error: 'File upload error',
                    details: err.message 
                });
            } else {
                return res.status(400).json({ 
                    error: 'Invalid file type',
                    details: 'Only JPEG, PNG, or GIF images are allowed' 
                });
            }
        }

        const {
            username,
            password,
            fullName,
            companyName,
            address,
            phone,
            email,
            website
        } = req.body;

        // Validation
        const errors = [];
        if (!username || username.length < 4) errors.push('Username must be at least 4 characters');
        if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
        if (!fullName || fullName.length < 3) errors.push('Full name is required');
        if (email && !validateEmail(email)) errors.push('Invalid email format');
        if (website && !validateURL(website)) errors.push('Invalid website URL');

        if (errors.length > 0) {
            return res.status(400).json({ 
                error: 'Validation failed',
                details: errors 
            });
        }

        // Check if user exists
        try {
            const existingUser = db.findOne('users', { username });
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Handle file uploads
            const defaultProfilePic = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80';
            
            const profilePicUrl = req.files['profilePic'] 
                ? `/db/img/pp/${req.files['profilePic'][0].filename}`
                : defaultProfilePic;

            const companyLogoUrl = req.files['companyLogo']
                ? `/db/img/pp/${req.files['companyLogo'][0].filename}`
                : '';

            // In the registration endpoint, modify the user object creation:
const user = {
    id: generateUserId(),
    username,
    password,
    fullName,
    profilePic: profilePicUrl,
    plan: 'Basic',
    companyInfo: {
        companyName: companyName || '',
        address: address || '',
        phone: phone || '',
        email: email || '',
        website: website || '',
        logo: companyLogoUrl
    },
    createdAt: new Date().toISOString(),
    lastLogin: null, // Will be set on first login
    noOfItineraries: 0
    // Removed isActive since it's not needed
};

            // Save to database
            const result = db.create('users', user);
            
            // Return response without password
            const { password: _, ...userResponse } = user;
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                user: userResponse
            });
        } catch (error) {
            console.error('Error during registration:', error);
            res.status(500).json({ 
                error: 'Registration failed',
                details: 'Internal server error' 
            });
        }
    });
});

// Serve uploaded files
app.use('/img/pp', express.static(path.join(__dirname, 'db', 'img', 'pp')));

// Add this endpoint to your existing Express app
app.post('/api/generate', async (req, res) => {
    try {
        // Get userId from request query or local storage (passed from frontend)
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required',
                details: 'Please provide a valid user ID' 
            });
        }

        // Get the itinerary data from request body
        const itineraryData = req.body;
        if (!itineraryData) {
            return res.status(400).json({ 
                error: 'Itinerary data is required',
                details: 'Please provide valid itinerary data' 
            });
        }

        // Generate unique ID for this itinerary
        const itineraryId = `itin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();

        // Create the itinerary object
        const itinerary = {
            id: itineraryId,
            userId,
            timestamp,
            data: itineraryData,
            lastModified: timestamp,
            status: 'active'
        };

        // Load existing itineraries
        let itineraries = {};
        try {
            const data = await fs.readFile(path.join(__dirname, 'evelodatabase', 'itineraries.json'), 'utf8');
            itineraries = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File doesn't exist yet, we'll create it
        }

        // Initialize user's itineraries if not exists
        if (!itineraries[userId]) {
            itineraries[userId] = {};
        }

        // Add the new itinerary
        itineraries[userId][itineraryId] = itinerary;

        // Save back to file
        await fs.writeFile(
            path.join(__dirname, 'evelodatabase', 'itineraries.json'),
            JSON.stringify(itineraries, null, 2),
            'utf8'
        );

        // Update user's itinerary count
        try {
            const usersData = await fs.readFile(path.join(__dirname, 'evelodatabase', 'users.json'), 'utf8');
            const users = JSON.parse(usersData);
            
            if (users[userId]) {
                users[userId].noOfItineraries = (users[userId].noOfItineraries || 0) + 1;
                await fs.writeFile(
                    path.join(__dirname, 'evelodatabase', 'users.json'),
                    JSON.stringify(users, null, 2),
                    'utf8'
                );
            }
        } catch (error) {
            console.error('Error updating user itinerary count:', error);
            // Not critical, continue
        }

        res.status(201).json({
            success: true,
            message: 'Itinerary saved successfully',
            itineraryId,
            timestamp
        });

    } catch (error) {
        console.error('Error saving itinerary:', error);
        res.status(500).json({ 
            error: 'Failed to save itinerary',
            details: error.message 
        });
    }
});

// Add this endpoint to get user's itineraries
app.get('/api/itineraries', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ 
                error: 'User ID is required',
                details: 'Please provide a valid user ID' 
            });
        }

        const data = await fs.readFile(path.join(__dirname, 'evelodatabase', 'itineraries.json'), 'utf8');
        const allItineraries = JSON.parse(data);
        
        const userItineraries = allItineraries[userId] || {};
        
        // Convert to array and sort by timestamp (newest first)
        const itinerariesArray = Object.values(userItineraries).sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

        res.json({
            success: true,
            count: itinerariesArray.length,
            itineraries: itinerariesArray
        });

    } catch (error) {
        console.error('Error fetching itineraries:', error);
        res.status(500).json({ 
            error: 'Failed to fetch itineraries',
            details: error.message 
        });
    }
});

// Add these routes before the 404 handler

// Process and download itinerary
app.post('/api/download/', async (req, res) => {
    try {
        const { itineraryId } = req.body;
        
        if (!itineraryId) {
            return res.status(400).json({ 
                error: 'Itinerary ID is required',
                details: 'Please provide a valid itinerary ID' 
            });
        }

        // Process the itinerary
        const result = await engine.processItinerary(itineraryId);
        
        res.json({
            success: true,
            message: 'Itinerary processed successfully',
            itineraryPath: `/document/${path.basename(result.documentPath)}` // Now returns PDF path
        });

    } catch (error) {
        console.error('Error processing itinerary:', error);
        res.status(500).json({ 
            error: 'Failed to process itinerary',
            details: error.message 
        });
    }
});

// Serve generated documents (both DOCX and PDF)
app.get('/document/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, 'db', 'temp', 'tempStore', filename);
        
        // Check if file exists using promise-based fs
        try {
            await fs.access(filePath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).json({ 
                    error: 'File not found',
                    details: 'The requested document does not exist or has expired' 
                });
            }
            throw err;
        }
        
        // Set appropriate headers based on file type
        if (filename.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
        } else if (filename.endsWith('.docx')) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else {
            return res.status(400).json({
                error: 'Unsupported file type',
                details: 'Only PDF and DOCX files are supported'
            });
        }
        
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        // Stream the file - note we need to use require('fs') here, not the promise version
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Failed to stream file',
                    details: err.message 
                });
            }
        });
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Error serving document:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to serve document',
                details: error.message 
            });
        }
    }
});

// Handle 404 - Not Found
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not Found',
        message: 'The requested resource was not found' 
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Something went wrong on our end' 
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    //console.log('Upload directory:', path.join(__dirname, 'db', 'img', 'pp'));
});