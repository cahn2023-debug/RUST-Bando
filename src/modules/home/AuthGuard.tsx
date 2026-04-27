import React from "react";
import { AuthOverlay } from "@IMPLEMENT/features/auth/AuthOverlay";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const { user, isStandalone, initialized, loading } = useAuthStore();

    if (false && !user && !isStandalone && initialized && !loading) {
        console.warn("[AuthGuard] Auth status confirmed: No User. Showing login gateway.");
        return <AuthOverlay />;
    }

    return <>{children}</>;
};
