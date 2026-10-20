-- Stable, summary-only account scope. This does not grant Collection login/write access.
CREATE TABLE IF NOT EXISTS public.collection_dashboard_accounts (
  user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  nickname_id uuid REFERENCES public.collection_staff_nicknames(id) ON DELETE SET NULL ON UPDATE CASCADE,
  account_role text NOT NULL CHECK (account_role IN ('user', 'admin')),
  source text NOT NULL CHECK (source IN ('verified_login', 'superuser')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Import only unambiguous, still-valid server-verified sessions, joined through
-- the stable activity owner. Never infer ownership from matching display names,
-- browser hints, record authorship, or a nickname whose password was reset.
INSERT INTO public.collection_dashboard_accounts (user_id, nickname_id, account_role, source)
SELECT u.id, min(n.id::text)::uuid, u.role, 'verified_login'
FROM public.collection_nickname_sessions s
JOIN public.user_activity a ON a.id = s.activity_id AND a.is_active = true
JOIN public.users u ON u.id = a.user_id
  AND lower(u.username) = lower(s.username) AND u.role = s.user_role AND a.role = u.role
JOIN public.collection_staff_nicknames n ON lower(n.nickname) = lower(s.nickname)
WHERE u.role IN ('user', 'admin') AND u.status = 'active' AND coalesce(u.is_banned, false) = false
  AND n.is_active = true AND n.role_scope IN (u.role, 'both')
  AND n.nickname_password_hash IS NOT NULL
  AND n.must_change_password = false AND n.password_reset_by_superuser = false
  AND (n.password_updated_at IS NULL OR s.verified_at >= n.password_updated_at)
GROUP BY u.id, u.role
HAVING count(DISTINCT n.id) = 1
ON CONFLICT (user_id) DO NOTHING;
