const express=require('express');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const User=require('../models/User');
const router=express.Router();

router.post('/register',async(req,res)=>{
    try{
        const {firstname,lastname,email,mobile,password,dateOfBirth,gender,address,city,state,pincode,occupation,agreeToTerms,annualIncome}=req.body;
        const existingUser=await User.findOne({email});
        if(existingUser){
            return res.status(400).json({message:'User already exists'});
        }
        const salt=await bcrypt.genSalt(10);
        const passwordHash=await bcrypt.hash(password,salt);
        const newUser=new User({
            firstname,
            lastname,
            email,
            mobile,
            passwordHash,
            dateOfBirth,
            gender,
            address,
            city,
            state,
            pincode,
            occupation,
            agreeToTerms,
            annualIncome
        });
        await newUser.save();
        const token=jwt.sign({id:newUser._id},process.env.JWT_SECRET,{expiresIn:'1h'});
        const user={
    id:newUser._id,
    firstname:newUser.firstname,
    lastname:newUser.lastname,
    email:newUser.email,
    mobile:newUser.mobile,
    dateOfBirth:newUser.dateOfBirth,
    gender:newUser.gender,
    address:newUser.address,
    city:newUser.city,
    state:newUser.state,
    pincode:newUser.pincode,
    occupation:newUser.occupation,
    agreeToTerms:newUser.agreeToTerms,
    annualIncome:newUser.annualIncome
};

        res.status(201).json({message:'User registered successfully', token, user});
    }catch(error){
        console.error(error);
        res.status(500).json({message:'Server error'});
    }
});

router.post('/login',async(req,res)=>{
    try{
        const {email,password}=req.body;    

        const user=await User.findOne({email});
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
    user:userData
});

    }catch(error){
        console.error(error);
        res.status(500).json({message:'Server error'});
    }
});

module.exports=router;