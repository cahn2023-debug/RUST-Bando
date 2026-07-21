import React from "react";

interface AuthGuardProps {
    children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    // TODO: Enable AuthGuard when login is fully integrated
    // if (!user && !isStandalone && initialized && !loading) {
    //     console.warn("[AuthGuard] Auth status confirmed: No User. Showing login gateway.");
    //     return <AuthOverlay />;
    // }

    return <>{children}</>;
};
