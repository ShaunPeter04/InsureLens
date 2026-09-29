require('dotenv').config();

const requiredEnvVariables = [
    "MONGO_URI",
    "JWT_SECRET",
    "ML_SERVICE_URL"
];

for (const variable of requiredEnvVariables) {
    if (!process.env[variable]?.trim()) {
        console.error(`Missing required environment variable: ${variable}`);
        process.exit(1);
    }
}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const policyRoutes = require('./routes/policies');
const auth = require('./middleware/auth');
const recommendationRoutes = require("./routes/recommendations");
const familyMemberRoutes = require("./routes/familyMembers");
const rateLimit = require('express-rate-limit');

const app = express();
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        message: "Too many authentication requests. Please try again later."
    }
});

app.use(helmet());
app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);
app.use(express.json());

app.use('/api/auth',authLimiter, authRoutes);
app.use('/api/policies', policyRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/family-members", familyMemberRoutes);

app.get('/api/protected', auth, (req, res) => {
    res.json({
        message: 'You have access to the protected route',
        userId: req.user
    });
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected');

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
    });