import { WebStorageStateStore } from "oidc-client-ts";

export const cognitoAuthConfig = {
    authority: "https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fomadc3Ks",
    client_id: "2v513i5tiadvq4725r67j0003o",
    redirect_uri: "http://localhost:3000/dashboard",
    post_logout_redirect_uri: "http://localhost:3000/login",
    response_type: "code",
    scope: "openid email profile",
};