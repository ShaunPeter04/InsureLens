import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import "./auth.css";
import "./Register.css";

function Register() {
    const [formData, setFormData] = useState({
        firstname: '',
        lastname: '',
        email: '',
        mobile: '',
        password: '',
        dateOfBirth: '',
        gender: "",
        address: '',
        city: '',
        state: '',
        pincode: '',
        occupation: '',
        annualIncome: '',
        agreeToTerms: false
    });

    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prevData) => ({
            ...prevData,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (formData.password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsSubmitting(true);
        try {
            await register(formData);
            navigate('/dashboard');
        }
        catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
        }
        finally {
            setIsSubmitting(false);
        }
    };

    const passwordsMismatch = confirmPassword.length > 0 && formData.password !== confirmPassword;

    return (
        <div className="auth-screen">
            <div className="auth-brand">
                <div className="auth-brand-content">
                    <span className="auth-brand-mark">InsureLens</span>
                    <h1 className="auth-brand-headline">
                        A few details now save a lot of guesswork later.
                    </h1>
                    <p className="auth-brand-copy">
                        We use this to match you with policies that fit your age,
                        income, and location, and to keep your existing coverage on
                        file for when you need to check a claim.
                    </p>
                </div>
            </div>

            <div className="auth-panel">
                <div className="auth-card auth-card--wide">
                    <h2 className="auth-title">Create your account</h2>
                    <p className="auth-subtitle">It takes about two minutes</p>

                    <form className="auth-form" onSubmit={handleSubmit} noValidate>

                        <div className="register-section">
                            <h3 className="register-section-title">Account</h3>
                            <div className="register-grid register-grid--2">
                                <div className="auth-field">
                                    <label htmlFor="email">Email</label>
                                    <input id="email" type="email" name="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="mobile">Mobile number</label>
                                    <input id="mobile" type="text" name="mobile" placeholder="98765 43210" value={formData.mobile} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="password">Password</label>
                                    <input id="password" type="password" name="password" placeholder="Create a password" value={formData.password} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="confirmPassword">Confirm password</label>
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        name="confirmPassword"
                                        placeholder="Re-enter your password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        aria-invalid={passwordsMismatch}
                                        required
                                    />
                                    {passwordsMismatch && (
                                        <span className="auth-field-hint">Passwords don't match yet</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="register-section">
                            <h3 className="register-section-title">Personal details</h3>
                            <div className="register-grid register-grid--2">
                                <div className="auth-field">
                                    <label htmlFor="firstname">First name</label>
                                    <input id="firstname" type="text" name="firstname" value={formData.firstname} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="lastname">Last name</label>
                                    <input id="lastname" type="text" name="lastname" value={formData.lastname} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="dateOfBirth">Date of birth</label>
                                    <input id="dateOfBirth" type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="gender">Gender</label>
                                    <select id="gender" name="gender" value={formData.gender} onChange={handleChange} required>
                                        <option value="">Select gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="register-section">
                            <h3 className="register-section-title">Address</h3>
                            <div className="register-grid register-grid--1">
                                <div className="auth-field">
                                    <label htmlFor="address">Address</label>
                                    <input id="address" type="text" name="address" value={formData.address} onChange={handleChange} required />
                                </div>
                            </div>
                            <div className="register-grid register-grid--3">
                                <div className="auth-field">
                                    <label htmlFor="city">City</label>
                                    <input id="city" type="text" name="city" value={formData.city} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="state">State</label>
                                    <input id="state" type="text" name="state" value={formData.state} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="pincode">Pincode</label>
                                    <input
                                        id="pincode"
                                        type="text"
                                        name="pincode"
                                        inputMode="numeric"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        placeholder="560001"
                                        value={formData.pincode}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="register-section">
                            <h3 className="register-section-title">Financial profile</h3>
                            <p className="register-section-hint">
                                Helps us suggest policies that fit your budget.
                            </p>
                            <div className="register-grid register-grid--2">
                                <div className="auth-field">
                                    <label htmlFor="occupation">Occupation</label>
                                    <input id="occupation" type="text" name="occupation" value={formData.occupation} onChange={handleChange} required />
                                </div>
                                <div className="auth-field">
                                    <label htmlFor="annualIncome">Annual income</label>
                                    <input id="annualIncome" type="number" name="annualIncome" placeholder="₹" value={formData.annualIncome} onChange={handleChange} required />
                                </div>
                            </div>
                        </div>

                        <label className="register-checkbox">
                            <input type="checkbox" name="agreeToTerms" checked={formData.agreeToTerms} onChange={handleChange} required />
                            <span>I agree to the terms and conditions</span>
                        </label>

                        {error && <p className="auth-error" role="alert">{error}</p>}

                        <button type="submit" className="auth-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating account…' : 'Create account'}
                        </button>
                    </form>

                    <p className="auth-switch">
                        Already have an account? <Link to="/login">Log in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Register;