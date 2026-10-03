import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { User } from "@/app/types";
import { AccountAvatar } from "@/components/AccountAvatar";
import { Button } from "@/components/ui/button";
import { ACCOUNT_AVATAR_MAX_BYTES, ACCOUNT_AVATAR_MIME_TYPES, type AccountAvatarUpload } from "@shared/account-avatar";
import { updateAccountAvatar } from "@/lib/api/account-avatar";
import { formatAccountCreatedAt, syncAccountProfile } from "@/lib/account-profile";
import { getApiErrorMessage } from "@/lib/api-errors";
import "./personal-account.css";

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The photo could not be read. Please choose it again."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

export default function AccountPage({ user }: { user: User }) {
  const [selected, setSelected] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const accountKey = `${user.id}:${user.username}`;
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;
  useEffect(() => {
    mountedRef.current = true;
    setSelected(null); setError(""); setNotice(""); setSaving(false);
    return () => { mountedRef.current = false; requestRef.current?.abort(); requestRef.current = null; };
  }, [accountKey]);
  useEffect(() => {
    if (!selected) { setPreview(null); return; }
    const url = URL.createObjectURL(selected);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  const choosePhoto = (file: File | undefined) => {
    setError(""); setNotice(""); setSelected(null);
    if (!file) return;
    if (!file.size || file.size > ACCOUNT_AVATAR_MAX_BYTES || !(ACCOUNT_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
      || !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError("Choose a PNG, JPEG or WebP photo up to 1 MB."); return;
    }
    setSelected(file);
  };
  const savePhoto = async () => {
    if (!selected || requestRef.current || !user.id) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const actorKey = accountKey;
    const active = () => mountedRef.current && accountKeyRef.current === actorKey && !controller.signal.aborted;
    setSaving(true); setError(""); setNotice("");
    try {
      const contentBase64 = await fileBase64(selected);
      if (!active()) return;
      const updated = await updateAccountAvatar({ fileName: selected.name,
        mimeType: selected.type as AccountAvatarUpload["mimeType"], contentBase64 }, controller.signal);
      if (!active()) return;
      if (updated.id !== user.id || updated.username !== user.username) throw new Error("The account changed. Reload this page before trying again.");
      syncAccountProfile({
        id: user.id, username: user.username, role: user.role, sessionExpiresAt: user.sessionExpiresAt,
        avatarUrl: updated.avatarUrl ?? null, createdAt: updated.createdAt ?? user.createdAt,
      }, "avatar");
      setSelected(null); setNotice("Profile picture updated.");
    } catch (cause) {
      if (active()) setError(getApiErrorMessage(cause, "The profile picture could not be saved. Please try again."));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (active()) setSaving(false);
    }
  };

  return <div className="personal-page" data-testid="account-page">
    <header className="personal-page-header"><h1>Account</h1><p>Manage your personal profile information.</p></header>
    <section className="personal-section" aria-labelledby="account-photo-title" aria-busy={saving}>
      <h2 id="account-photo-title">Profile picture</h2>
      <div className="personal-photo-row">
        <div data-testid="avatar-preview" className="personal-avatar-preview">
          {preview ? <img src={preview} alt="New profile picture preview" onError={() => { setSelected(null); setError("The photo could not be displayed. Choose a valid image."); }} />
            : <AccountAvatar username={user.username} avatarUrl={user.avatarUrl} className="h-full w-full text-2xl" />}
        </div>
        <div className="personal-photo-actions">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
            aria-label="Choose profile picture" data-testid="avatar-input" disabled={saving}
            onChange={(event) => { choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
          <Button type="button" variant="outline" disabled={saving} onClick={() => inputRef.current?.click()}><Camera aria-hidden="true" className="mr-2 h-4 w-4" />Change photo</Button>
          <p>PNG, JPEG or WebP. Up to 1 MB and 2048 × 2048 pixels.</p>
        </div>
      </div>
      {selected ? <div className="personal-photo-save">
        <Button data-testid="avatar-save" disabled={saving} onClick={() => void savePhoto()}>{saving ? "Saving…" : "Save photo"}</Button>
        <Button variant="ghost" disabled={saving} onClick={() => { setSelected(null); setError(""); }}>Cancel</Button>
      </div> : null}
      {error ? <p role="alert" className="personal-error">{error}</p> : null}
      {notice ? <p role="status" className="personal-notice">{notice}</p> : null}
    </section>
    <dl className="personal-details">
      <div className="personal-row"><dt>Username</dt><dd data-testid="account-username">{user.username}</dd></div>
      <div className="personal-row"><dt>Email</dt><dd data-testid="account-email">{user.email || "Not provided"}</dd></div>
      <div className="personal-row"><dt>Account created</dt><dd data-testid="account-created-at">{formatAccountCreatedAt(user.createdAt)}</dd></div>
    </dl>
    <p className="personal-footnote">Username, email and account creation date are read-only.</p>
  </div>;
}
