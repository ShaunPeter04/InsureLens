import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        }
        catch (err) {
            setError(err.response?.data?.message || 'Login failed');
        }
        finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-screen">
            <div className="auth-brand">
                <div className="auth-brand-content">
                    <span className="auth-brand-mark">InsureLens</span>
                    <h1 className="auth-brand-headline">
                        Understand what you're covered for, before you need it.
                    </h1>
                    <p className="auth-brand-copy">
                        Track your policies, check a hospitalization against your
                        coverage, and see exactly why a claim was approved or denied —
                        in plain language.
                    </p>
                </div>
            </div>

            <div className="auth-panel">
                <div className="auth-card">
                    <h2 className="auth-title">Welcome back</h2>
                    <p className="auth-subtitle">Log in to your account</p>

                    <form className="auth-form" onSubmit={handleSubmit} noValidate>
                        <div className="auth-field">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div className="auth-field">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && <p className="auth-error" role="alert">{error}</p>}

                        <button type="submit" className="auth-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Logging in…' : 'Log in'}
                        </button>
                    </form>

                    <p className="auth-switch">
                        Don't have an account? <Link to="/register">Register</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export default Login;