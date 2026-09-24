const mongoose=require('mongoose');
const familyMembersSchema=mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    relationship:{
        type:String,
        required:true
    },
    dateOfBirth:{
        type:Date,
        required:true
    },
    gender:{
        type:String,
        required:true
    },
    occupation:{
        type:String,
        required:true
    },
    isDependent:{
        type:Boolean,
        required:true
    },
    preExistingDiseases: {
    type: [String],
    default: []
    },
    },
    {id: true}
);
const userSchema=mongoose.Schema({
    firstname:{
        type:String,
        required:true
    },
    lastname:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true
    },
    mobile:{
        type:String,
        required:true,
        unique:true
    },
    passwordHash:{
        type:String,
        required:true
    },
    dateOfBirth:{
        type:Date,
        required:true
    },
    gender:{
        type:String,
        required:true
    },
    address:{
        type:String,
        required:true
    },
    city:{
        type:String,
        required:true
    },
    state:{
        type:String,
        required:true
    },
    pincode:{
        type:String,
        required:true
    },
    occupation:{
        type:String,
        required:true
    },
    annualIncome:{
        type:Number,
        required:true
    },
    agreeToTerms:{
        type:Boolean,
        required:true
    },
    agreedAt:{
        type:Date,
        default:Date.now
    },
    familyMembers:{
        type:[familyMembersSchema],
        default:[],
    },
    insuranceRequirements: {
    budget: { type: Number },
    requiredCoverage: { type: Number },
    hasExistingInsurance: { type: Boolean, default: false },
    coPaymentPreference: { type: Number },
    cityTier: { type: String },
    isSmokerOrTobaccoUser: { type: Boolean, default: false },
    alcoholConsumption: { type: String },
    hasHighRiskOccupation: { type: Boolean, default: false },
    preExistingDiseases: {
        type: [String],
        default: []
    },
    coverageType: { type: String },
    updatedAt: { type: Date }
    },
    },
    {
        timestamps:true
    }

);

module.exports=mongoose.model('User',userSchema);

