require("dotenv").config();

const mongoose = require("mongoose");
const Policy = require("../models/Policy");
const policies = require("../data/policies.json");

const seedPolicies = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");

    // Remove existing policies
    await Policy.deleteMany({});

    console.log("Existing policies deleted");

    // Insert policies from policies.json
    const insertedPolicies = await Policy.insertMany(policies);

    console.log(`${insertedPolicies.length} policies inserted successfully`);

    await mongoose.connection.close();

    console.log("MongoDB connection closed");

    process.exit(0);

  } catch (error) {
    console.error("Error seeding policies:", error);

    await mongoose.connection.close();

    process.exit(1);
  }
};

seedPolicies();