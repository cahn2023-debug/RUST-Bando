import React, { ReactNode } from "react";
import { useAuthStore } from "@CORE/stores/useAuthStore";
import { AppLoader } from "./AppLoader";

interface AppBootstrapProps {
    children: ReactNode;
}

/**
 * AppBootstrap handles the initial lifecycle of the application:
 * 1. Shows AppLoader during auth initialization.
 * 2. Provides a clean entry point for the main App Shell.
 */
export const AppBootstrap: React.FC<AppBootstrapProps> = ({ children }) => {
    const { loading, initialized } = useAuthStore();

    if (!initialized || loading) {
        return <AppLoader />;
    }

    return <>{children}</>;
};
