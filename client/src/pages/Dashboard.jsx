import { useAuth } from "../context/AuthContext";
import "./theme.css";
import "./Dashboard.css";

function Dashboard(){

    const { user } = useAuth();
    const firstName=user?.firstname || 'User';

    return(
        <div className="app-shell">
            <div className="app-main">
                <h1 className="app-heading">Dashboard</h1>
                <p className="dashboard-welcome">Welcome, {firstName}!</p>
            </div>
        </div>

    );
}

export default Dashboard;