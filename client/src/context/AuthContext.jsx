import { useState } from "react";
import axios from "axios";
import AuthContext from "./AuthContext";

const API_URL = "/api/auth";

/*
 * Attach the latest JWT before every Axios request.
 * This also works immediately after a hard page refresh.
 */
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    return localStorage.getItem("token");
  });

  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");

    try {
      return storedUser ? JSON.parse(storedUser) : null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  });

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/login`, {
      email,
      password,
    });

    const { token, user } = response.data;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    setToken(token);
    setUser(user);

    return response.data;
  };

  const register = async (userData) => {
    const response = await axios.post(`${API_URL}/register`, userData);

    const { token, user } = response.data;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    setToken(token);
    setUser(user);

    return response.data;
  };

  const updateProfile = async (formData) => {
    const response = await axios.put(`${API_URL}/profile`, formData);

    const { user } = response.data;

    setUser(user);
    localStorage.setItem("user", JSON.stringify(user));

    return response.data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);

    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

