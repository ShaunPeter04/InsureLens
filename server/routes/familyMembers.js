const express = require("express");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();


// GET all family members of logged-in user
router.get("/", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user)
            .select("familyMembers")
            .lean();

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.json({
            familyMembers: user.familyMembers || []
        });

    } catch (error) {
        console.error("Get family members error:", error.message);

        return res.status(500).json({
            message: "Failed to fetch family members"
        });
    }
});

// DELETE a family member
router.delete("/:memberId", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const member = user.familyMembers.id(req.params.memberId);

        if (!member) {
            return res.status(404).json({
                message: "Family member not found"
            });
        }

        user.familyMembers.pull(req.params.memberId);

        await user.save();

        return res.json({
            message: "Family member deleted successfully"
        });

    } catch (error) {
        console.error("Delete family member error:", error.message);

        return res.status(500).json({
            message: "Failed to delete family member"
        });
    }
});

// UPDATE a family member
router.put("/:memberId", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const member = user.familyMembers.id(req.params.memberId);

        if (!member) {
            return res.status(404).json({
                message: "Family member not found"
            });
        }

        const {
            name,
            relationship,
            dateOfBirth,
            gender,
            occupation,
            isDependent,
            preExistingDiseases
        } = req.body;

        // Validate DOB if it is being updated
        if (dateOfBirth !== undefined) {
            const birthDate = new Date(dateOfBirth);

            if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
                return res.status(400).json({
                    message: "Please provide a valid date of birth"
                });
            }

            member.dateOfBirth = birthDate;
        }

        // Update only supplied fields
        if (name !== undefined) {
            member.name = name;
        }

        if (relationship !== undefined) {
            member.relationship = relationship;
        }

        if (gender !== undefined) {
            member.gender = gender;
        }

        if (occupation !== undefined) {
            member.occupation = occupation;
        }

        if (isDependent !== undefined) {
            member.isDependent = isDependent;
        }

        if (preExistingDiseases !== undefined) {
            member.preExistingDiseases = preExistingDiseases;
        }

        await user.save();

        return res.json({
            message: "Family member updated successfully",
            familyMember: member
        });

    } catch (error) {
        console.error("Update family member error:", error.message);

        return res.status(500).json({
            message: "Failed to update family member"
        });
    }
});


// ADD a new family member
router.post("/", auth, async (req, res) => {
    try {
        const {
            name,
            relationship,
            dateOfBirth,
            gender,
            occupation,
            isDependent,
            preExistingDiseases
        } = req.body;

        // Basic validation
        if (
            !name ||
            !relationship ||
            !dateOfBirth ||
            !gender ||
            typeof isDependent !== "boolean"
        ) {
            return res.status(400).json({
                message: "Please provide all required family member details"
            });
        }

        const birthDate = new Date(dateOfBirth);

        if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
            return res.status(400).json({
                message: "Please provide a valid date of birth"
            });
        }

        const user = await User.findById(req.user);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        user.familyMembers.push({
            name,
            relationship,
            dateOfBirth: birthDate,
            gender,
            occupation: occupation || "",
            isDependent,
            preExistingDiseases: preExistingDiseases || []
        });

        await user.save();

        const addedMember =
            user.familyMembers[user.familyMembers.length - 1];

        return res.status(201).json({
            message: "Family member added successfully",
            familyMember: addedMember
        });

    } catch (error) {
        console.error("Add family member error:", error.message);

        return res.status(500).json({
            message: "Failed to add family member"
        });
    }
});

module.exports = router;