"use client";

import { AuthProvider as OidcAuthProvider } from "react-oidc-context";
import { cognitoAuthConfig } from "@/lib/authConfig";
import { useRouter } from "next/navigation";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    const onSigninCallback = () => {
        // Remove code and state from URL using Next.js router
        router.replace(window.location.pathname);
    };

    return (
        <OidcAuthProvider 
            {...cognitoAuthConfig} 
            onSigninCallback={onSigninCallback}
        >
            {children}
        </OidcAuthProvider>
    );
}