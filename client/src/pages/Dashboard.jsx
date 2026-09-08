import { useAuth } from "../context/AuthContext";


function Dashboard(){

    const { user } = useAuth();
    const firstName=user?.firstname || 'User';

    return(
        <div>
            <h1>Dashboard</h1>
            <p>Welcome, {firstName}!</p>

        </div>

    );
}

export default Dashboard;