"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) return <>{children}</>;

  return <AuthGuard>{children}</AuthGuard>;
}
