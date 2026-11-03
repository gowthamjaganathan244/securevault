import { redirect } from "next/navigation";

// Multi-factor verification happens on the Cognito sign-in page; this route
// used to be a simulated code screen and now simply forwards to sign-in.
export default function MFAPage() {
  redirect("/login");
}
