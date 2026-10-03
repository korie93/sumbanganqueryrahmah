import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { safeAccountAvatarUrl } from "@/lib/account-profile";

/** Renders the current account's private image with a decorative initials fallback. */
export function AccountAvatar({ username, avatarUrl, className }: {
  username: string; avatarUrl?: string | null | undefined; className?: string | undefined;
}) {
  return <Avatar className={className} aria-hidden="true">
    <AvatarImage src={safeAccountAvatarUrl(avatarUrl)} alt="" className="object-cover" />
    <AvatarFallback>{[...username.trim()][0]?.toUpperCase() || "?"}</AvatarFallback>
  </Avatar>;
}
