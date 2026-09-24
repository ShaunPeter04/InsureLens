
import './App.css'
import {  Navigate, Route, Routes } from 'react-router-dom'
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AuthenticatedLayout from './pages/AuthenticatedLayout';
import Profile from './pages/Profile';



function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />

      <Route element={<AuthenticatedLayout/>}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile/>} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
  )
}
export default App
