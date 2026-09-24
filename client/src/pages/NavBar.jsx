import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./theme.css";
import "./NavBar.css";


function NavBar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const firstName=user?.firstname || 'User';
    const handleLogout = () => {
        logout();
        navigate('/login');
    }

    const linkClass = ({ isActive }) => (isActive ? "navbar-link active" : "navbar-link");

    return ( 
        <nav className="navbar">
            <div className="navbar-brand">
                <strong>InsureLens</strong>
            </div>
            <div className="navbar-links">
                <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
                <NavLink to="/profile" className={linkClass}>Profile</NavLink>
            </div>
            <div className="navbar-user">
                <span className="navbar-greeting">Hi, {firstName}</span>
                <button type="button" onClick={handleLogout} className="navbar-logout">Logout</button>
            </div>
        </nav>
    );
}

export default NavBar;