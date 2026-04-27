import React, { ReactNode } from "react";
import { useAuthStore } from "@IMPLEMENT/stores/useAuthStore";
import { AppLoader } from "./AppLoader";
import { AuthGuard } from "./AuthGuard";

interface AppBootstrapProps {
    children: ReactNode;
}

/**
 * AppBootstrap handles the initial lifecycle of the application:
 * 1. Shows AppLoader during auth initialization.
 * 2. Wraps the app in AuthGuard to ensure protected access.
 * 3. Provides a clean entry point for the main App Shell.
 */
export const AppBootstrap: React.FC<AppBootstrapProps> = ({ children }) => {
    const { loading, initialized } = useAuthStore();

    if (!initialized || loading) {
        return <AppLoader />;
    }

    return <AuthGuard>{children}</AuthGuard>;
};
