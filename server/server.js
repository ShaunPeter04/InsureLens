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
mongoose.set('bufferCommands', false);
mongoose.set('maxTimeMS', 10000);
const databaseAvailability = require('./middleware/databaseAvailability');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const policyRoutes = require('./routes/policies');
const auth = require('./middleware/auth');
const recommendationRoutes = require("./routes/recommendations");
const familyMemberRoutes = require("./routes/familyMembers");
const userPolicyRoutes = require("./routes/userPolicies");
const rateLimit = require('express-rate-limit');
const claimCaseRoutes =require("./routes/claimCases");
const rejectionCasesRoutes = require("./routes/rejectionCases");

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
        allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
    })
);
app.use(express.json());

app.use('/api', databaseAvailability(mongoose.connection));
app.use('/api/auth',authLimiter, authRoutes);
app.use('/api/policies', policyRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/family-members", familyMemberRoutes);
app.use("/api/user-policies", userPolicyRoutes);
app.use("/api/claim-cases",claimCaseRoutes);
app.use("/api/rejection-cases", rejectionCasesRoutes);

app.get('/api/protected', auth, (req, res) => {
    res.json({
        message: 'You have access to the protected route',
        userId: req.user
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

let reportedDatabaseFailure = false;
async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS:5000, connectTimeoutMS:5000, socketTimeoutMS:10000});
        reportedDatabaseFailure = false;
        console.log('MongoDB connected');
    } catch {
        if (!reportedDatabaseFailure) console.error('MongoDB temporarily unavailable; database requests will return 503.');
        reportedDatabaseFailure = true;
        const retry = setTimeout(connectDatabase, 5000);
        retry.unref();
    }
}
connectDatabase();
