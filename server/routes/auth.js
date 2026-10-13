const express=require('express');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const User=require('../models/User');
const auth=require('../middleware/auth');
const router=express.Router();
const { validateProfile } = require('../utils/profileValidation');
const {
  validateRegistration,
  validateLogin
} = require("../utils/authValidation");

router.post('/register',async(req,res)=>{
    try{
        const validationError = validateRegistration(req.body);

        if (validationError) {
          return res.status(400).json({
            message: validationError
          });
        }

        const {email,mobile,password,agreeToTerms}=req.body;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobile.trim();

        const existingEmail = await User.findOne({ email: normalizedEmail });

        if (existingEmail) {
            return res.status(400).json({
                message: "An account with this email already exists"
            });
        }

        const existingMobile = await User.findOne({ mobile: normalizedMobile });

        if (existingMobile) {
            return res.status(400).json({
                message: "An account with this mobile number already exists"
            });
        }
        const salt=await bcrypt.genSalt(10);
        const passwordHash=await bcrypt.hash(password,salt);
        const newUser=new User({
            ...validateProfile(req.body).updates,
            email: normalizedEmail, passwordHash, agreeToTerms
        });
        await newUser.save();
        const token=jwt.sign({id:newUser._id},process.env.JWT_SECRET,{expiresIn:'1h'});
        const user = {
            id: newUser._id,
            ...validateProfile(req.body).updates,
            email: newUser.email,
            dateOfBirth: newUser.dateOfBirth,
            agreeToTerms: newUser.agreeToTerms
        };

        res.status(201).json({message:'User registered successfully', token, user});
    } catch (error) {
    console.error("Registration failed");

    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0];

        if (field === "email") {
            return res.status(400).json({
                message: "An account with this email already exists"
            });
        }

        if (field === "mobile") {
            return res.status(400).json({
                message: "An account with this mobile number already exists"
            });
        }

        return res.status(400).json({
            message: "Account already exists"
        });
          }

          return res.status(500).json({
              message: "Server error"
          });
      }
      });

router.post('/login',async(req,res)=>{
    try{
        const validationError = validateLogin(req.body);

        if (validationError) {
          return res.status(400).json({
            message: validationError
          });
        }

        const {email,password}=req.body;
        const user = await User.findOne({
          email: email.trim().toLowerCase()
        });
        if(!user){
            return res.status(400).json({message:'Invalid credentials'});
        }
        const isMatch=await bcrypt.compare(password,user.passwordHash);
        if(!isMatch){
            return res.status(400).json({message:'Invalid credentials'});
        }
        const token=jwt.sign({id:user._id},process.env.JWT_SECRET,{expiresIn:'1h'});
        const userData={
    id:user._id,
    firstname:user.firstname,
    lastname:user.lastname,
    email:user.email,
    mobile:user.mobile,
    dateOfBirth:user.dateOfBirth,
    gender:user.gender,
    address:user.address,
    city:user.city,
    state:user.state,
    pincode:user.pincode,
    occupation:user.occupation,
    agreeToTerms:user.agreeToTerms,
    annualIncome:user.annualIncome
};

res.json({
    message:'Login successful',
    token,
    user:userData,
});

    }catch(error){
        console.error(error);
        res.status(500).json({message:'Server error'});
    }
});

router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      user
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error"
    });
  }
});

router.put("/profile", auth, async (req, res) => {
  try {
    const { error: validationError, updates } = validateProfile(req.body, { partial: true });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (updates.mobile) {
      const existingMobile = await User.findOne({
        mobile: updates.mobile,
        _id: { $ne: req.user }
      });

      if (existingMobile) {
        return res.status(400).json({
          message: "This mobile number is already in use"
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user,
      updates,
      {
        new: true,
        runValidators: true
      }
    ).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    res.json({
      message: "Profile updated successfully",
      user
    });

  } catch (error) {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: "Invalid profile data" });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      message: "This mobile number is already in use"
    });
  }

  return res.status(500).json({
    message: "Server error"
  });
  }
});

module.exports=router;