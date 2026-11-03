"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Check, CircleAlert, ExternalLink, Info, Minus, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUsers, type DirectoryUser } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useAudit, useFiles } from "@/lib/store";
import { formatFull, relativeTime } from "@/lib/format";
import { cognitoRegion, cognitoUserPoolId } from "@/lib/authConfig";
import { destinations } from "@/lib/access";
import { hasRealActor, isDenied } from "@/lib/vault";
import type { UserRole } from "@/lib/types";
import { PageToolbar } from "@/components/shell/PageToolbar";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState, Notice, Panel, RowsSkeleton, SearchField, SectionLabel } from "@/components/ui/primitives";
import { Avatar } from "@/components/vault/tags";
import { MacieStatusPanel } from "@/components/vault/MacieResult";

interface Person {
  email: string;
  roles: Set<string>;
  uploads: number;
  downloads: number;
  denied: number;
  lastSeen: string;
}

const consoleUrl = `https://${cognitoRegion}.console.aws.amazon.com/cognito/v2/idp/user-pools/${cognitoUserPoolId}/users?region=${cognitoRegion}`;

export function PeopleView() {
  const { email, groups, role, profile, expiresAt: tokenExpiry } = useSession();
  const { files, loading: filesLoading, error: filesError } = useFiles();
  const { events, loading: auditLoading, error: auditError } = useAudit();
  const [query, setQuery] = useState("");

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    const touch = (who: string, at?: string) => {
      let p = map.get(who);
      if (!p) {
        p = { email: who, roles: new Set(), uploads: 0, downloads: 0, denied: 0, lastSeen: "" };
        map.set(who, p);
      }
      if (at && (!p.lastSeen || Date.parse(at) > Date.parse(p.lastSeen))) p.lastSeen = at;
      return p;
    };
    for (const f of files) {
      if (!f.uploadedBy) continue;
      touch(f.uploadedBy, f.uploadedAt || f.createdAt).uploads++;
    }
    for (const e of events) {
      if (!hasRealActor(e)) continue;
      const p = touch(e.userEmail, e.timestamp);
      if (e.userRole) p.roles.add(e.userRole);
      if (isDenied(e)) p.denied++;
      else if (e.action === "FILE_DOWNLOADED") p.downloads++;
    }
    return [...map.values()].sort((a, b) => Date.parse(b.lastSeen || "0") - Date.parse(a.lastSeen || "0"));
  }, [files, events]);

  const visible = people.filter((p) => p.email.toLowerCase().includes(query.trim().toLowerCase()));
  const loading = filesLoading || auditLoading;
  const loadError = filesError && auditError ? filesError : null;

  const emailVerified = profile?.email_verified;
  const authTime = typeof profile?.auth_time === "number" ? new Date(profile.auth_time * 1000).toISOString() : undefined;
  const expiresAt = tokenExpiry ? new Date(tokenExpiry * 1000).toISOString() : undefined;
  const amr = profile?.amr as string[] | undefined;
  const auditorDenialSeen = events.some((e) => e.userRole === "Auditor" && e.action === "DOWNLOAD_DENIED");

  return (
    <div className="min-h-full">
      <PageToolbar
        title="People & Access"
        subtitle="Who is in the vault and what each role can do"
        actions={
          <a href={consoleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md")}>
            Manage in Cognito <ExternalLink className="size-3.5" />
          </a>
        }
      />

      <div className="mx-auto w-full max-w-[980px] space-y-8 px-4 py-6 sm:px-6">
        <Notice tone="info" icon={<Info />}>
          The directory lists every Cognito account with its group, MFA setting and status. Inviting, disabling or changing roles is done in
          the AWS Cognito console.
        </Notice>

        {/* You */}
        <section aria-labelledby="you">
          <SectionLabel>
            <span id="you">Your session</span>
          </SectionLabel>
          <Panel className="mt-2.5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar email={email} tone="accent" className="size-10 text-[13px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium">{email}</p>
                <p className="text-[12.5px] text-ink-3">From your Cognito ID token</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(groups.length ? groups : ["No group"]).map((g) => (
                  <span key={g} className="inline-flex h-6 items-center rounded-md border border-primary/30 bg-primary/10 px-2 text-[12px] font-medium text-primary-hi">
                    {g}
                  </span>
                ))}
              </div>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2.5 border-t border-line pt-4 text-[12.5px] sm:grid-cols-2">
              <Fact label="Email">
                {emailVerified === true ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <BadgeCheck className="size-3.5" /> Verified by Cognito
                  </span>
                ) : emailVerified === false ? (
                  <span className="text-warning">Not verified</span>
                ) : (
                  <span className="text-ink-3">Not in token</span>
                )}
              </Fact>
              <Fact label="Role in this app">{role}</Fact>
              <Fact label="Signed in">{authTime ? formatFull(authTime) : "Not in token"}</Fact>
              <Fact label="ID token">{expiresAt ? `Valid until ${formatFull(expiresAt)} · renews automatically` : "Unknown"}</Fact>
              <Fact label="Multi-factor">
                {amr?.length ? amr.join(", ") : <span className="text-ink-3">Not reported in the token — configured in Cognito</span>}
              </Fact>
            </dl>
          </Panel>
        </section>

        {/* Account directory — live from Cognito via GET /users (Admin only) */}
        <section aria-labelledby="directory">
          <SectionLabel>
            <span id="directory">Directory</span>
          </SectionLabel>
          <Panel className="mt-2.5 overflow-hidden">
            <Directory me={email} />
          </Panel>
        </section>

        {/* Data discovery — Amazon Macie job (Admin) */}
        <section aria-labelledby="macie">
          <SectionLabel>
            <span id="macie">Sensitive-data discovery</span>
          </SectionLabel>
          <Panel className="mt-2.5 overflow-hidden">
            <MacieStatusPanel />
          </Panel>
        </section>

        {/* People in records */}
        <section aria-labelledby="people" className="reveal">
          <SectionLabel
            action={<SearchField label="Search people" value={query} onChange={setQuery} placeholder="Search email" className="w-44 sm:w-56" />}
          >
            <span id="people">Seen in vault records</span>
          </SectionLabel>
          <Panel className="mt-2.5 overflow-hidden">
            {loadError ? (
              <div className="p-3">
                <Notice tone="danger" icon={<CircleAlert />}>
                  {loadError}
                </Notice>
              </div>
            ) : loading ? (
              <RowsSkeleton rows={4} />
            ) : visible.length === 0 ? (
              <EmptyState icon={<UsersRound />} title={people.length ? "No one matches" : "No one in the records yet"}>
                People appear here once they upload a document or a download attempt is logged.
              </EmptyState>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-[11.5px] text-ink-3">
                      <th scope="col" className="px-4 py-2 font-medium">Person</th>
                      <th scope="col" className="px-3 py-2 font-medium">Roles recorded</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Uploads</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Downloads</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Denied</th>
                      <th scope="col" className="px-3 py-2 font-medium">Last activity</th>
                      <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((p) => (
                      <tr key={p.email} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar email={p.email} tone={p.email === email ? "accent" : "neutral"} />
                            <span className="min-w-0">
                              <span className="block max-w-[240px] truncate text-foreground">{p.email}</span>
                              {p.email === email && <span className="text-[11.5px] text-ink-3">You</span>}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {p.roles.size ? (
                            <span className="flex flex-wrap gap-1">
                              {[...p.roles].map((r) => (
                                <span key={r} className="rounded-md border border-line-strong bg-white/[0.03] px-1.5 py-0.5 text-[11.5px] text-ink-2">
                                  {r}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right text-ink-2">{p.uploads}</td>
                        <td className="tabular px-3 py-2.5 text-right text-ink-2">{p.downloads}</td>
                        <td className={cn("tabular px-3 py-2.5 text-right", p.denied ? "text-danger" : "text-ink-2")}>{p.denied}</td>
                        <td className="px-3 py-2.5 text-ink-3" title={formatFull(p.lastSeen)}>
                          {relativeTime(p.lastSeen) || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            href={`/audit-logs?q=${encodeURIComponent(p.email)}`}
                            className="whitespace-nowrap text-[12px] font-medium text-primary-hi hover:text-white"
                          >
                            Activity
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Roles are those recorded on each audit event at the time it happened — not a live account lookup. MFA and account status
            aren&apos;t available without a directory API.
          </p>
        </section>

        {/* Matrix */}
        <section aria-labelledby="matrix" className="reveal">
          <SectionLabel>
            <span id="matrix">Who can do what</span>
          </SectionLabel>
          <Panel className="mt-2.5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] text-ink-3">
                  <th scope="col" className="px-4 py-2 font-medium">Capability</th>
                  {(["Admin", "User", "Auditor"] as UserRole[]).map((r) => (
                    <th key={r} scope="col" className={cn("px-3 py-2 text-center font-medium", r === role && "text-primary-hi")}>
                      {r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {destinations.map((d) => (
                  <MatrixRow key={d.href} label={`Open ${d.label}`} note="App navigation" cells={(r) => (d.roles.includes(r) ? "yes" : "no")} />
                ))}
                <MatrixRow
                  label="Download documents"
                  note={auditorDenialSeen ? "Server — Auditor refusal seen in the audit log" : "Server decides each request"}
                  cells={(r) => (r === "Auditor" ? "no" : "yes")}
                />
                <MatrixRow label="Activity scope" note="App view" cells={(r) => (r === "User" ? "own" : "all")} />
              </tbody>
            </table>
          </Panel>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-3">
            <li className="flex items-center gap-1.5">
              <Check className="size-3 text-success" /> Allowed
            </li>
            <li className="flex items-center gap-1.5">
              <Minus className="size-3" /> Not allowed
            </li>
            <li>App rules shape this interface; the API remains the authority on data access.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Directory({ me }: { me: string }) {
  const [state, setState] = useState<{ k: "loading" } | { k: "error"; message: string } | { k: "ok"; users: DirectoryUser[] }>({ k: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    getUsers()
      .then((r) => alive && setState({ k: "ok", users: r.users ?? [] }))
      .catch((e: unknown) => alive && setState({ k: "error", message: e instanceof Error ? e.message : "Couldn't load the directory." }));
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (state.k === "loading") return <RowsSkeleton rows={4} />;
  if (state.k === "error")
    return (
      <div className="p-3">
        <Notice
          tone="danger"
          icon={<CircleAlert />}
          action={
            <button
              type="button"
              className="text-[12.5px] font-medium text-primary-hi hover:text-white"
              onClick={() => {
                setState({ k: "loading" });
                setAttempt((a) => a + 1);
              }}
            >
              Retry
            </button>
          }
        >
          {state.message}
        </Notice>
      </div>
    );

  const term = q.trim().toLowerCase();
  const users = state.users.filter((u) => !term || `${u.email ?? ""} ${u.username} ${u.groups.join(" ")}`.toLowerCase().includes(term));
  const mfa = (u: DirectoryUser) =>
    u.mfaSettings?.length ? u.mfaSettings.map((m) => (m === "SOFTWARE_TOKEN_MFA" ? "Authenticator" : m === "SMS_MFA" ? "SMS" : m === "EMAIL_OTP" ? "Email" : m)).join(", ") : "Not set up";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="text-[12px] text-ink-3">
          {state.users.length} account{state.users.length === 1 ? "" : "s"} in Cognito
        </span>
        <SearchField label="Search accounts" value={q} onChange={setQ} placeholder="Search accounts" className="w-44 sm:w-56" />
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-ink-3">
              <th scope="col" className="px-4 py-2 font-medium">Account</th>
              <th scope="col" className="px-3 py-2 font-medium">Role</th>
              <th scope="col" className="px-3 py-2 font-medium">MFA</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.sub ?? u.username} className="transition-colors hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Avatar email={u.email ?? u.username} tone={u.email === me ? "accent" : "neutral"} />
                    <span className="min-w-0">
                      <span className="block max-w-[260px] truncate text-foreground">{u.email ?? u.username}</span>
                      <span className="text-[11.5px] text-ink-3">
                        {u.email === me ? "You · " : ""}
                        {u.emailVerified ? "Email verified" : "Email not verified"}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {u.groups.length ? (
                    <span className="flex flex-wrap gap-1">
                      {u.groups.map((g) => (
                        <span key={g} className="rounded-md border border-line-strong bg-white/[0.03] px-1.5 py-0.5 text-[11.5px] text-ink-2">
                          {g}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink-3">No group</span>
                  )}
                </td>
                <td className={cn("px-3 py-2.5", u.mfaSettings?.length ? "text-success" : "text-ink-3")}>{mfa(u)}</td>
                <td className="px-3 py-2.5">
                  <span className={cn("inline-flex items-center gap-1.5", u.enabled ? "text-ink-2" : "text-danger")}>
                    <span className={cn("size-1.5 rounded-full", u.enabled ? (u.status === "CONFIRMED" ? "bg-success" : "bg-warning") : "bg-danger")} aria-hidden />
                    {u.enabled ? (u.status === "CONFIRMED" ? "Active" : u.status.replace(/_/g, " ").toLowerCase()) : "Disabled"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-ink-3" title={formatFull(u.createdAt)}>
                  {relativeTime(u.createdAt) || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">No accounts match.</p>}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </div>
  );
}

function MatrixRow({ label, note, cells }: { label: string; note: string; cells: (r: UserRole) => "yes" | "no" | "own" | "all" }) {
  return (
    <tr>
      <th scope="row" className="px-4 py-2.5 font-normal">
        <span className="block text-foreground">{label}</span>
        <span className="text-[11.5px] text-ink-3">{note}</span>
      </th>
      {(["Admin", "User", "Auditor"] as UserRole[]).map((r) => {
        const v = cells(r);
        return (
          <td key={r} className="px-3 py-2.5 text-center">
            {v === "yes" && <Check className="mx-auto size-4 text-success" aria-label="Allowed" />}
            {v === "no" && <Minus className="mx-auto size-4 text-ink-3" aria-label="Not allowed" />}
            {(v === "own" || v === "all") && <span className="text-[12px] text-ink-2">{v === "own" ? "Own events" : "Everyone"}</span>}
          </td>
        );
      })}
    </tr>
  );
}
