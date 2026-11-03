import type { ResourcesConfig } from "aws-amplify";

export const cognitoRegion = "ap-southeast-2";
export const cognitoUserPoolId = "ap-southeast-2_fomadc3Ks";
export const cognitoClientId = "2v513i5tiadvq4725r67j0003o";

/**
 * Amplify Auth talks to the Cognito user pool directly (USER_SRP_AUTH);
 * the hosted sign-in page is not used. The pool uses email as the username.
 */
export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: cognitoUserPoolId,
      userPoolClientId: cognitoClientId,
      loginWith: { email: true },
    },
  },
};
