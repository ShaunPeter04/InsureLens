import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import NavBar from "./NavBar";



function AuthenticatedLayout(){
    const { user } = useAuth();

    if(!user){
        return <Navigate to="/login" replace/>;
}
return(
    <>
    <NavBar/>
    <main>
        <Outlet/>
    </main>
    </>
);
}

export default AuthenticatedLayout;