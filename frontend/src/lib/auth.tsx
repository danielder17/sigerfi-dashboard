"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

interface User {
  email: string;
  displayName: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem("sigerfi_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          email: data.email,
          displayName: data.displayName,
          is_admin: data.is_admin,
        });
      } else {
        localStorage.removeItem("sigerfi_token");
      }
    } catch {
      localStorage.removeItem("sigerfi_token");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Error de conexión" }));
        return err.detail || "Credenciales inválidas";
      }
      const data = await res.json();
      localStorage.setItem("sigerfi_token", data.access_token);
      setUser({
        email: data.email,
        displayName: data.displayName,
        is_admin: data.is_admin,
      });
      return null; // sin error
    } catch (e) {
      return "No se pudo conectar con el servidor";
    }
  };

  const logout = () => {
    localStorage.removeItem("sigerfi_token");
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
