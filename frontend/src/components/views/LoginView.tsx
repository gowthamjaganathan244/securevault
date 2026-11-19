"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  autoSignIn,
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  resendSignUpCode,
  resetPassword,
  signIn,
  signUp,
  type SignInOutput,
} from "aws-amplify/auth";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Copy, Eye, EyeOff, FileClock, KeyRound, Loader2, Lock, ScrollText, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/components/auth/AuthProvider";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/primitives";
import { Avatar } from "@/components/vault/tags";

const REMEMBER_KEY = "sv.login.email";

type Stage =
  | { k: "signIn" }
  | { k: "code"; method: "TOTP" | "SMS" | "EMAIL"; destination?: string }
  | { k: "mfaSelect"; types: string[]; setup: boolean }
  | { k: "totpSetup"; secret: string; uri: string }
  | { k: "emailSetup" }
  | { k: "newPassword" }
  | { k: "forgot" }
  | { k: "forgotConfirm"; destination?: string }
  | { k: "signUp" }
  | { k: "confirmSignUp"; destination?: string }
  | { k: "unsupported"; step: string };

/** Turns Cognito / Amplify errors into calm, non-enumerating messages. */
function describeError(err: unknown) {
  const name = (err as { name?: string })?.name ?? "";
  const message = (err as { message?: string })?.message ?? "";
  switch (name) {
    case "NotAuthorizedException":
      return /attempts exceeded/i.test(message) ? "Too many attempts. Wait a moment, then try again." : "Incorrect email or password.";
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "CodeMismatchException":
      return "That code isn't right. Check it and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Request a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Wait a few minutes, then try again.";
    case "InvalidPasswordException":
      return message || "That password doesn't meet the policy.";
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in instead.";
    case "EmptySignInUsername":
    case "EmptySignInPassword":
      return "Enter your email and password.";
    case "NetworkError":
      return "Couldn't reach Amazon Cognito. Check your connection.";
    default:
      return message || "Something went wrong. Please try again.";
  }
}

const POLICY = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
  { label: "Symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];
const meetsPolicy = (p: string) => POLICY.every((r) => r.test(p));

export function LoginView() {
  const router = useRouter();
  const { refresh } = useAuthState();
  const { status, email: signedInEmail, signOut } = useSession();
  const [stage, setStage] = useState<Stage>({ k: "signIn" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Prefill the last email used on this device (stored only in this browser).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) queueMicrotask(() => setEmail((e) => e || saved));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const go = (next: Stage) => {
    setError(null);
    setInfo(null);
    setStage(next);
  };

  const finish = async () => {
    try {
      window.localStorage.setItem(REMEMBER_KEY, email.trim());
    } catch {
      /* storage unavailable */
    }
    await refresh();
    router.replace("/dashboard");
  };

  /** Routes every Cognito "next step" to the matching screen. */
  const handleNext = async ({ nextStep }: SignInOutput) => {
    switch (nextStep.signInStep) {
      case "DONE":
        return finish();
      case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
        return go({ k: "code", method: "TOTP" });
      case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
        return go({ k: "code", method: "SMS", destination: nextStep.codeDeliveryDetails?.destination });
      case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
        return go({ k: "code", method: "EMAIL", destination: nextStep.codeDeliveryDetails?.destination });
      case "CONTINUE_SIGN_IN_WITH_MFA_SELECTION":
        return go({ k: "mfaSelect", types: nextStep.allowedMFATypes ?? [], setup: false });
      case "CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION":
        return go({ k: "mfaSelect", types: nextStep.allowedMFATypes ?? [], setup: true });
      case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP":
        return go({
          k: "totpSetup",
          secret: nextStep.totpSetupDetails.sharedSecret,
          uri: nextStep.totpSetupDetails.getSetupUri("SecureVault", email.trim()).toString(),
        });
      case "CONTINUE_SIGN_IN_WITH_EMAIL_SETUP":
        return go({ k: "emailSetup" });
      case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
        return go({ k: "newPassword" });
      case "CONFIRM_SIGN_UP":
        await resendSignUpCode({ username: email.trim() }).catch(() => {});
        return go({ k: "confirmSignUp" });
      case "RESET_PASSWORD":
        await resetPassword({ username: email.trim() });
        return go({ k: "forgotConfirm" });
      default:
        return go({ k: "unsupported", step: nextStep.signInStep });
    }
  };

  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "UserAlreadyAuthenticatedException") return finish();
      if (name === "UserNotConfirmedException") {
        await resendSignUpCode({ username: email.trim() }).catch(() => {});
        return go({ k: "confirmSignUp" });
      }
      if (name === "PasswordResetRequiredException") {
        await resetPassword({ username: email.trim() }).catch(() => {});
        return go({ k: "forgotConfirm" });
      }
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = run(async () => {
    const out = await signIn({ username: email.trim(), password, options: { authFlowType: "USER_SRP_AUTH" } });
    setPassword("");
    await handleNext(out);
  });
  const answer = (value: string) => run(async () => handleNext(await confirmSignIn({ challengeResponse: value })));

  const signedIn = status === "signedIn";

  return (
    <div className="sv-ambient relative flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* Architectural grid, faded toward the edges. Static: no JS, no animation cost. */}
      <div aria-hidden className="sv-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(75%_65%_at_30%_40%,#000,transparent)]" />

      <header className="relative mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="leading-none">
            <span className="block text-[15px] font-semibold tracking-[-0.01em]">SecureVault</span>
            <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink-3">Inspection Lane</span>
          </span>
        </div>
        <p className="hidden items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 sm:flex">
          <span className="size-1.5 rounded-full bg-success" aria-hidden /> Clearance gate · ap-southeast-2
        </p>
      </header>

      <main className="relative mx-auto grid w-full max-w-[1180px] flex-1 items-center gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.15fr_440px] lg:gap-16">
        {/* The facility */}
        <section className="animate-rise max-lg:text-center" aria-labelledby="gate-title">
          <p className="eyebrow">Clearance gate</p>
          <h1 id="gate-title" className="mt-3 text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] sm:text-[44px]">
            Every document is screened
            <br className="hidden sm:block" /> <span className="text-titanium">before it&apos;s trusted.</span>
          </h1>
          <p className="mx-auto mt-4 hidden max-w-md text-[14.5px] leading-relaxed text-ink-2 sm:block lg:mx-0">
            Files are checked in, stored privately, inspected for personal data and archived with a recorded chain of activity.
          </p>

          <GateDiagram className="mt-9 hidden lg:block" />

          <ul className="mx-auto mt-8 grid max-w-md gap-2.5 text-left text-[12.5px] text-ink-2 max-lg:hidden">
            <Fact icon={<Lock />}>Private Amazon S3 storage. Nothing is publicly reachable.</Fact>
            <Fact icon={<FileClock />}>Downloads use short-lived signed links, issued per request.</Fact>
            <Fact icon={<ScrollText />}>Every download attempt, allowed or denied, is recorded.</Fact>
          </ul>
        </section>

        {/* Authentication card */}
        <section aria-labelledby="auth-title" className="animate-rise [animation-delay:60ms]">
          <div className="plate-raised relative overflow-hidden rounded-[22px] p-6 sm:p-8">
            {/* Checkpoint header strip */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--color-primary),transparent)] opacity-70" />
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-line pb-4">
              <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3">
                <KeyRound className="size-3.5 text-primary-hi" aria-hidden /> Identity check
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink-3">SRP · Cognito</span>
            </div>
            {signedIn && stage.k === "signIn" ? (
              <div>
                <h2 id="auth-title" className="text-[21px] font-semibold tracking-[-0.025em]">
                  Already cleared
                </h2>
                <p className="mt-1 text-[13px] text-ink-3">This device holds an active session.</p>
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-line bg-surface-1 p-3">
                  <Avatar email={signedInEmail} tone="accent" className="size-9" />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{signedInEmail}</p>
                    <p className="text-[12px] text-ink-3">Signed in with Cognito</p>
                  </div>
                </div>
                <Button variant="primary" size="lg" className="mt-5 h-11 w-full rounded-xl" onClick={() => router.replace("/dashboard")}>
                  Enter the inspection lane <ArrowRight />
                </Button>
                <Button variant="ghost" className="mt-2 w-full" onClick={() => void signOut()}>
                  Use a different account
                </Button>
              </div>
            ) : (
              <div key={stage.k} className="animate-rise">
                {error && (
                  <Notice tone="danger" icon={<CircleAlert />} className="mb-5">
                    <span id="auth-error">{error}</span>
                  </Notice>
                )}
                {info && !error && (
                  <Notice tone="info" icon={<Check />} className="mb-5">
                    {info}
                  </Notice>
                )}

                {stage.k === "signIn" && (
                  <form onSubmit={onSignIn} noValidate>
                    <Heading title="Sign in" sub="Present your SecureVault credentials to pass the gate." />
                    <Field id="auth-email" label="Email">
                      <TextInput id="auth-email" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={setEmail} placeholder="you@company.com" autoFocus={!email} aria-invalid={!!error || undefined} aria-describedby={error ? "auth-error" : undefined} />
                    </Field>
                    <Field
                      id="auth-password"
                      label="Password"
                      aside={
                        <button type="button" onClick={() => go({ k: "forgot" })} className="text-[12px] font-medium text-primary-hi hover:text-foreground">
                          Forgot password?
                        </button>
                      }
                    >
                      <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete="current-password" autoFocus={!!email} invalid={!!error} />
                    </Field>
                    <Submit busy={busy} disabled={!email.trim() || !password}>
                      Sign in
                    </Submit>
                    <p className="mt-5 text-center text-[13px] text-ink-3">
                      New to SecureVault?{" "}
                      <button type="button" onClick={() => go({ k: "signUp" })} className="font-medium text-primary-hi hover:text-foreground">
                        Create an account
                      </button>
                    </p>
                  </form>
                )}

                {stage.k === "code" && (
                  <CodeForm
                    title={stage.method === "TOTP" ? "Enter your authenticator code" : "Check your messages"}
                    sub={
                      stage.method === "TOTP"
                        ? "Open your authenticator app and enter the 6-digit code for SecureVault."
                        : `We sent a code to ${stage.destination ?? (stage.method === "SMS" ? "your phone" : "your email")}.`
                    }
                    icon={stage.method === "TOTP" ? <Smartphone /> : <KeyRound />}
                    busy={busy}
                    onSubmit={(code) => answer(code)()}
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "mfaSelect" && (
                  <div>
                    <Heading
                      title={stage.setup ? "Set up a second step" : "Choose how to verify"}
                      sub={stage.setup ? "Your account requires multi-factor authentication." : "Pick a verification method for this sign-in."}
                    />
                    <div className="mt-5 space-y-2">
                      {stage.types.map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={busy}
                          onClick={() => answer(t)()}
                          className="flex h-12 w-full items-center gap-3 rounded-xl border border-line-strong bg-tint/[0.03] px-4 text-left text-[14px] transition-colors hover:border-primary/50 hover:bg-primary/[0.06]"
                        >
                          {t === "TOTP" ? <Smartphone className="size-4 text-primary-hi" /> : <KeyRound className="size-4 text-primary-hi" />}
                          {t === "TOTP" ? "Authenticator app" : t === "SMS" ? "Text message" : "Email code"}
                        </button>
                      ))}
                    </div>
                    <BackLink onClick={() => go({ k: "signIn" })} />
                  </div>
                )}

                {stage.k === "totpSetup" && (
                  <TotpSetup secret={stage.secret} uri={stage.uri} busy={busy} onSubmit={(code) => answer(code)()} onBack={() => go({ k: "signIn" })} />
                )}

                {stage.k === "emailSetup" && (
                  <SingleFieldForm
                    title="Add an email for codes"
                    sub="Cognito will send sign-in codes to this address."
                    label="Email"
                    type="email"
                    initial={email}
                    busy={busy}
                    submit="Send code"
                    onSubmit={(v) => answer(v)()}
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "newPassword" && (
                  <NewPasswordForm
                    title="Choose a new password"
                    sub="Your administrator requires a new password before you continue."
                    busy={busy}
                    onSubmit={(pw) => answer(pw)()}
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "forgot" && (
                  <SingleFieldForm
                    title="Reset your password"
                    sub="We'll email you a verification code."
                    label="Email"
                    type="email"
                    initial={email}
                    busy={busy}
                    submit="Send code"
                    onSubmit={(v) =>
                      run(async () => {
                        setEmail(v);
                        const out = await resetPassword({ username: v.trim() });
                        go({ k: "forgotConfirm", destination: out.nextStep.codeDeliveryDetails?.destination });
                      })()
                    }
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "forgotConfirm" && (
                  <NewPasswordForm
                    title="Set a new password"
                    sub={`Enter the code sent to ${stage.destination ?? "your email"} and choose a new password.`}
                    withCode
                    busy={busy}
                    onSubmit={(pw, code) =>
                      run(async () => {
                        await confirmResetPassword({ username: email.trim(), confirmationCode: code ?? "", newPassword: pw });
                        go({ k: "signIn" });
                        setInfo("Password updated. Sign in with your new password.");
                      })()
                    }
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "signUp" && (
                  <SignUpForm
                    initialEmail={email}
                    busy={busy}
                    onSubmit={(em, pw) =>
                      run(async () => {
                        setEmail(em);
                        const out = await signUp({
                          username: em.trim(),
                          password: pw,
                          options: { userAttributes: { email: em.trim() }, autoSignIn: true },
                        });
                        if (out.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
                          go({ k: "confirmSignUp", destination: out.nextStep.codeDeliveryDetails?.destination });
                        } else if (out.nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
                          await handleNext(await autoSignIn());
                        } else {
                          go({ k: "signIn" });
                          setInfo("Account created. Sign in to continue.");
                        }
                      })()
                    }
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "confirmSignUp" && (
                  <CodeForm
                    title="Confirm your email"
                    sub={`Enter the code sent to ${stage.destination ?? email.trim() ?? "your email"}.`}
                    icon={<KeyRound />}
                    busy={busy}
                    onSubmit={(code) =>
                      run(async () => {
                        const out = await confirmSignUp({ username: email.trim(), confirmationCode: code });
                        if (out.nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
                          await handleNext(await autoSignIn());
                        } else {
                          go({ k: "signIn" });
                          setInfo("Email confirmed. Sign in to continue.");
                        }
                      })()
                    }
                    onResend={() =>
                      run(async () => {
                        await resendSignUpCode({ username: email.trim() });
                        setInfo("A new code is on its way.");
                      })()
                    }
                    onBack={() => go({ k: "signIn" })}
                  />
                )}

                {stage.k === "unsupported" && (
                  <div>
                    <Heading title="This sign-in needs another method" sub={`Cognito asked for a step SecureVault doesn't support yet (${stage.step}). Contact your administrator.`} />
                    <BackLink onClick={() => go({ k: "signIn" })} />
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-3">
            <Lock className="size-3" /> Secure Remote Password sign-in with Amazon Cognito · your password never leaves this device
          </p>
        </section>
      </main>
    </div>
  );
}

/* ── Form building blocks ─────────────────────────────── */

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 id="auth-title" className="text-[21px] font-semibold tracking-[-0.025em]">
        {title}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{sub}</p>
    </>
  );
}

// The label is a sibling of any extra controls (e.g. "Forgot password?") so it names only its input.
function Field({ id, label, aside, children }: { id: string; label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-2">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-line-strong bg-surface-1 px-3.5 text-[14.5px] text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-[160ms] hover:border-tint/25 focus:border-primary/70 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_16%,transparent)] focus-visible:outline-none aria-[invalid=true]:border-danger/60";

function TextInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) {
  return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className={inputClass} />;
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "auth-error" : undefined}
        className={cn(inputClass, "pr-11")}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-tint/[0.06] hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}

function Submit({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="primary" size="lg" className="mt-6 h-11 w-full rounded-xl text-[14.5px]" disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" /> : null}
      {children}
      {!busy && <ArrowRight />}
    </Button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground">
      <ArrowLeft className="size-3.5" /> Back to sign in
    </button>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      aria-label="Verification code"
      placeholder="000000"
      className={cn(inputClass, "tabular text-center text-[20px] tracking-[0.5em] placeholder:tracking-[0.5em]")}
    />
  );
}

function CodeForm({
  title,
  sub,
  icon,
  busy,
  onSubmit,
  onResend,
  onBack,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  busy: boolean;
  onSubmit: (code: string) => void;
  onResend?: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      <span className="mb-4 flex size-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary-hi [&_svg]:size-5">{icon}</span>
      <Heading title={title} sub={sub} />
      <div className="mt-5">
        <CodeInput value={code} onChange={setCode} />
      </div>
      <Submit busy={busy} disabled={code.length !== 6}>
        Verify
      </Submit>
      <div className="flex items-center justify-between">
        <BackLink onClick={onBack} />
        {onResend && (
          <button type="button" onClick={onResend} className="mt-5 text-[13px] font-medium text-primary-hi hover:text-foreground">
            Resend code
          </button>
        )}
      </div>
    </form>
  );
}

function TotpSetup({ secret, uri, busy, onSubmit, onBack }: { secret: string; uri: string; busy: boolean; onSubmit: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code);
      }}
    >
      <Heading title="Set up your authenticator" sub="Add SecureVault to an authenticator app, then enter the 6-digit code it shows." />
      <div className="mt-5 rounded-xl border border-line bg-surface-1 p-3.5">
        <p className="eyebrow">Setup key</p>
        <p className="mt-1.5 break-all font-mono text-[13px] tracking-wider text-foreground">{secret.match(/.{1,4}/g)?.join(" ")}</p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(secret).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy key"}
          </Button>
          <a href={uri} className="inline-flex h-7 items-center rounded-lg px-2.5 text-[12.5px] font-medium text-primary-hi hover:text-foreground">
            Open in authenticator app
          </a>
        </div>
      </div>
      <div className="mt-4">
        <CodeInput value={code} onChange={setCode} />
      </div>
      <Submit busy={busy} disabled={code.length !== 6}>
        Verify and continue
      </Submit>
      <BackLink onClick={onBack} />
    </form>
  );
}

function SingleFieldForm({
  title,
  sub,
  label,
  type,
  initial,
  busy,
  submit,
  onSubmit,
  onBack,
}: {
  title: string;
  sub: string;
  label: string;
  type: string;
  initial: string;
  busy: boolean;
  submit: string;
  onSubmit: (v: string) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <Heading title={title} sub={sub} />
      <Field id="auth-single" label={label}>
        <TextInput id="auth-single" type={type} value={value} onChange={setValue} autoComplete="username" autoFocus />
      </Field>
      <Submit busy={busy} disabled={!value.trim()}>
        {submit}
      </Submit>
      <BackLink onClick={onBack} />
    </form>
  );
}

function PolicyList({ password }: { password: string }) {
  return (
    <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]" aria-label="Password requirements">
      {POLICY.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={cn("flex items-center gap-1 transition-colors", ok ? "text-success" : "text-ink-3")}>
            <Check className={cn("size-3", !ok && "opacity-30")} aria-hidden />
            <span>
              <span className="sr-only">{ok ? "Met: " : "Not met: "}</span>
              {r.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NewPasswordForm({
  title,
  sub,
  withCode,
  busy,
  onSubmit,
  onBack,
}: {
  title: string;
  sub: string;
  withCode?: boolean;
  busy: boolean;
  onSubmit: (password: string, code?: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(pw, code);
      }}
    >
      <Heading title={title} sub={sub} />
      {withCode && (
        <div className="mt-5">
          <CodeInput value={code} onChange={setCode} />
        </div>
      )}
      <Field id="auth-new-password" label="New password">
        <PasswordInput id="auth-new-password" value={pw} onChange={setPw} autoComplete="new-password" autoFocus={!withCode} />
      </Field>
      <PolicyList password={pw} />
      <Submit busy={busy} disabled={!meetsPolicy(pw) || (withCode && code.length !== 6)}>
        Save password
      </Submit>
      <BackLink onClick={onBack} />
    </form>
  );
}

function SignUpForm({ initialEmail, busy, onSubmit, onBack }: { initialEmail: string; busy: boolean; onSubmit: (email: string, pw: string) => void; onBack: () => void }) {
  const [em, setEm] = useState(initialEmail);
  const [pw, setPw] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(em, pw);
      }}
    >
      <Heading title="Create your account" sub="You'll confirm your email with a code. An administrator assigns your role." />
      <Field id="signup-email" label="Email">
        <TextInput id="signup-email" type="email" value={em} onChange={setEm} autoComplete="username" inputMode="email" autoFocus placeholder="you@company.com" />
      </Field>
      <Field id="signup-password" label="Password">
        <PasswordInput id="signup-password" value={pw} onChange={setPw} autoComplete="new-password" />
      </Field>
      <PolicyList password={pw} />
      <Submit busy={busy} disabled={!em.trim() || !meetsPolicy(pw)}>
        Create account
      </Submit>
      <BackLink onClick={onBack} />
    </form>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-1 text-primary-hi [&_svg]:size-3.5">{icon}</span>
      {children}
    </li>
  );
}

/**
 * The lane every document passes through, drawn as a quiet architectural
 * diagram. Purely illustrative (aria-hidden): the steps named here are the
 * vault's real stages, and nothing moves.
 */
function GateDiagram({ className }: { className?: string }) {
  const steps = ["Check-in", "Storage", "Inspection", "Classification", "Archive"];
  const xs = steps.map((_, i) => 34 + i * 118);
  return (
    <div className={cn("relative max-w-[560px]", className)} aria-hidden>
      <svg viewBox="0 0 540 132" className="w-full">
        <defs>
          <linearGradient id="gate-rail" x1="0" x2="1">
            <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.1" />
            <stop offset="0.45" stopColor="var(--color-primary)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--color-titanium)" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        {/* floor */}
        <path d="M0 96H540" stroke="var(--color-tint)" strokeOpacity="0.08" />
        <path d="M34 96H506" stroke="url(#gate-rail)" strokeWidth="1.5" />
        {/* checkpoint arch over inspection */}
        <path d={`M${xs[2] - 30} 96V44a30 30 0 0 1 60 0v52`} fill="none" stroke="var(--color-titanium)" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d={`M${xs[2] - 22} 96V46a22 22 0 0 1 44 0v50`} fill="none" stroke="var(--color-primary)" strokeOpacity="0.35" strokeDasharray="2 4" />
        {xs.map((x, i) => (
          <g key={steps[i]}>
            <circle cx={x} cy={96} r={i === 2 ? 5 : 3.5} fill="var(--color-background)" stroke={i <= 2 ? "var(--color-primary)" : "var(--color-titanium)"} strokeOpacity={i <= 2 ? 1 : 0.6} strokeWidth="1.5" />
            <text x={x} y={122} textAnchor="middle" fontSize="10" letterSpacing="1.4" fill="var(--color-ink-3)" fontFamily="var(--font-geist-mono), ui-monospace, monospace">
              {steps[i].toUpperCase()}
            </text>
          </g>
        ))}
        {/* a document approaching the gate */}
        <g transform={`translate(${xs[1] + 26} 62)`}>
          <path d="M2 0h14l8 8v22a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2Z" fill="var(--color-surface-3)" stroke="var(--color-line-strong)" />
          <path d="M16 0v6a2 2 0 0 0 2 2h6" fill="none" stroke="var(--color-line-strong)" />
          <path d="M5 14h12M5 19h9" stroke="var(--color-tint)" strokeOpacity="0.25" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
