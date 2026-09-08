import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";



function NavBar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const firstName=user?.firstname || 'User';
    const handleLogout = () => {
        logout();
        navigate('/login');
    }

    return (
        <nav>
            <div>
                <strong>InsureLens</strong>
            </div>
            <div>
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/profile">Profile</Link>
            </div>
            <div>
                <span>Hi, {firstName}</span>
                <button type="button" onClick={handleLogout}>Logout</button>
            </div>
        </nav>
    );
}

export default NavBar;