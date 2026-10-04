import { useEffect, useRef, useState } from "react";
import { Camera, Copy, Info, Trash2 } from "lucide-react";
import type { User } from "@/app/types";
import { AccountAvatar } from "@/components/AccountAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { AccountAvatarUpload } from "@shared/account-avatar";
import { removeAccountAvatar, updateAccountAvatar } from "@/lib/api/account-avatar";
import { formatAccountCreatedAt, safeAccountAvatarUrl, syncAccountProfile } from "@/lib/account-profile";
import { getAuthErrorMessage } from "@/lib/auth-flow-feedback";
import { AvatarEditor } from "./account/AvatarEditor";
import { validateAvatarSource } from "./account/avatar-crop";
import "./personal-account.css";
import "./account/Account.css";

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The photo could not be read. Please choose it again."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

/** An identity/session change unmounts every pending crop, viewer and mutation. */
export default function AccountPage({ user }: { user: User }) {
  return <AccountProfile key={`${user.id}:${user.username}:${user.role}:${user.sessionExpiresAt ?? ""}`} user={user} />;
}

function AccountProfile({ user }: { user: User }) {
  const [selected, setSelected] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const avatarUrl = safeAccountAvatarUrl(user.avatarUrl);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current?.abort(); requestRef.current = null; };
  }, []);

  const choosePhoto = (file: File | undefined) => {
    if (requestRef.current) return;
    setError(""); setNotice("");
    if (!file) return;
    const problem = validateAvatarSource(file);
    if (problem) { setError(problem); return; }
    setSelected(file);
  };

  const mutatePhoto = async (file?: File) => {
    if (requestRef.current || !user.id) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const active = () => mountedRef.current && !controller.signal.aborted;
    setSaving(true); setError(""); setNotice("");
    try {
      const contentBase64 = file ? await fileBase64(file) : null;
      if (!active()) return;
      const updated = file ? await updateAccountAvatar({ fileName: file.name,
        mimeType: file.type as AccountAvatarUpload["mimeType"], contentBase64: contentBase64! }, controller.signal)
        : await removeAccountAvatar(controller.signal);
      if (!active()) return;
      if (updated.id !== user.id || updated.username !== user.username) throw new Error("The account changed. Reload this page before trying again.");
      syncAccountProfile({
        id: user.id, username: user.username, role: user.role, sessionExpiresAt: user.sessionExpiresAt,
        avatarUrl: updated.avatarUrl ?? null, createdAt: updated.createdAt ?? user.createdAt,
      }, "avatar");
      setSelected(null); setRemoveOpen(false);
      setNotice(file ? "Profile picture updated." : "Profile picture removed.");
    } catch (cause) {
      if (active()) setError(getAuthErrorMessage(cause, "The profile picture could not be changed. Please try again.", undefined, "en"));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (active()) setSaving(false);
    }
  };
  const copyUsername = async () => {
    setNotice(""); setError("");
    try {
      await navigator.clipboard.writeText(user.username);
      if (mountedRef.current) setNotice("Username copied.");
    } catch { if (mountedRef.current) setError("The username could not be copied. Select and copy it manually."); }
  };

  return <div className="personal-page personal-account-page" data-testid="account-page">
    <header className="personal-page-header"><h1>Account</h1><p>Manage your personal profile information.</p></header>
    <section className="account-profile-hero" aria-label="Profile picture" aria-busy={saving}>
      <Dialog>
        <DialogTrigger asChild><button type="button" className="account-avatar-button" aria-label="View profile picture" disabled={saving}>
          <span data-testid="avatar-preview" className="account-avatar-large"><AccountAvatar username={user.username} avatarUrl={avatarUrl} className="h-full w-full text-5xl" /></span>
        </button></DialogTrigger>
        <DialogContent className="account-photo-dialog account-viewer-dialog">
          <DialogHeader><DialogTitle>Profile picture</DialogTitle><DialogDescription>Current profile picture for {user.username}.</DialogDescription></DialogHeader>
          <div className="account-avatar-viewer"><AccountAvatar username={user.username} avatarUrl={avatarUrl} className="h-full w-full text-6xl" /></div>
        </DialogContent>
      </Dialog>
      <div className="account-profile-identity"><p className="account-profile-name">{user.username}</p><span className="account-role-label">{user.role}</span></div>
      <p className="account-photo-help">Select your photo to view it larger.</p>
      <div className="account-photo-actions">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
          aria-label="Choose profile picture" data-testid="avatar-input" disabled={saving || Boolean(selected)}
          onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <Button ref={changeRef} type="button" variant="outline" disabled={saving} onClick={() => inputRef.current?.click()}><Camera aria-hidden="true" />Change photo</Button>
        {avatarUrl ? <AlertDialog open={removeOpen} onOpenChange={(open) => { if (!saving) { setRemoveOpen(open); setError(""); } }}>
          <AlertDialogTrigger asChild><Button type="button" variant="ghost" disabled={saving}><Trash2 aria-hidden="true" />Remove photo</Button></AlertDialogTrigger>
          <AlertDialogContent className="account-photo-dialog" aria-busy={saving} onCloseAutoFocus={(event) => { event.preventDefault(); changeRef.current?.focus(); }}>
            <AlertDialogHeader><AlertDialogTitle>Remove profile photo?</AlertDialogTitle><AlertDialogDescription>Your initials will appear instead. You can upload a new photo later.</AlertDialogDescription></AlertDialogHeader>
            {error ? <p role="alert" className="personal-error">{error}</p> : null}
            <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => { event.preventDefault(); void mutatePhoto(); }}>{saving ? "Removing…" : "Remove photo"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog> : null}
      </div>
      <p className="account-photo-help">PNG, JPEG or WebP. Up to 1 MB and 2048 × 2048 pixels.</p>
    </section>
    {selected ? <AvatarEditor file={selected} saving={saving} error={error} onSave={mutatePhoto}
      onClose={() => { setSelected(null); setError(""); }} returnFocus={() => changeRef.current?.focus()} /> : null}
    {error && !selected && !removeOpen ? <p role="alert" className="personal-error">{error}</p> : null}
    {notice ? <p role="status" className="personal-notice">{notice}</p> : null}
    <section className="account-details-section" aria-labelledby="account-details-heading">
      <h2 id="account-details-heading">Account details</h2>
      <dl className="personal-details">
        <div className="personal-row account-username-row"><dt>Username</dt><dd><span data-testid="account-username">{user.username}</span><Button type="button" variant="ghost" size="icon" aria-label="Copy username" onClick={() => void copyUsername()}><Copy aria-hidden="true" /></Button></dd></div>
        <div className="personal-row"><dt>Email</dt><dd data-testid="account-email">{user.email || "Not provided"}</dd></div>
        <div className="personal-row"><dt>Account created</dt><dd data-testid="account-created-at">{formatAccountCreatedAt(user.createdAt)}</dd></div>
      </dl>
    </section>
    {!user.email ? <p className="account-email-note"><Info aria-hidden="true" /><span>No email is set for this account. Contact your administrator to add or update it.</span></p> : null}
    <p className="personal-footnote">Username, email and account creation date are read-only.</p>
  </div>;
}
