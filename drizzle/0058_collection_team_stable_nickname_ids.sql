-- Collection V9: team ownership and membership are keyed by immutable nickname
-- UUIDs. The legacy text columns remain as compatibility/display snapshots,
-- but they are no longer the relational source of truth.
ALTER TABLE public.admin_groups
  ADD COLUMN IF NOT EXISTS leader_nickname_id uuid;
--> statement-breakpoint
ALTER TABLE public.admin_group_members
  ADD COLUMN IF NOT EXISTS member_nickname_id uuid;
--> statement-breakpoint
LOCK TABLE public.admin_groups, public.admin_group_members, public.collection_staff_nicknames
  IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
UPDATE public.admin_groups admin_group
SET leader_nickname_id = nickname.id
FROM public.collection_staff_nicknames nickname
WHERE admin_group.leader_nickname_id IS NULL
  AND lower(trim(nickname.nickname)) = lower(trim(admin_group.leader_nickname));
--> statement-breakpoint
UPDATE public.admin_group_members member
SET member_nickname_id = nickname.id
FROM public.collection_staff_nicknames nickname
WHERE member.member_nickname_id IS NULL
  AND lower(trim(nickname.nickname)) = lower(trim(member.member_nickname));
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_groups
    WHERE leader_nickname_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate Collection teams: an admin_groups leader nickname has no collection_staff_nicknames match.'
      USING HINT = 'Create or repair the referenced staff nickname, then rerun migration 0058.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_group_members
    WHERE member_nickname_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate Collection teams: an admin_group_members nickname has no collection_staff_nicknames match.'
      USING HINT = 'Create or repair the referenced staff nickname, then rerun migration 0058.';
  END IF;
END $$;
--> statement-breakpoint
-- Canonicalize the retained display snapshots once the UUID backfill has been
-- proven complete. Application reads resolve current names through the UUIDs.
UPDATE public.admin_groups admin_group
SET leader_nickname = nickname.nickname
FROM public.collection_staff_nicknames nickname
WHERE nickname.id = admin_group.leader_nickname_id
  AND admin_group.leader_nickname IS DISTINCT FROM nickname.nickname;
--> statement-breakpoint
UPDATE public.admin_group_members member
SET member_nickname = nickname.nickname
FROM public.collection_staff_nicknames nickname
WHERE nickname.id = member.member_nickname_id
  AND member.member_nickname IS DISTINCT FROM nickname.nickname;
--> statement-breakpoint
ALTER TABLE public.admin_groups
  ALTER COLUMN leader_nickname_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.admin_group_members
  ALTER COLUMN member_nickname_id SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_admin_groups_leader_nickname_id'
      AND conrelid = 'public.admin_groups'::regclass
  ) THEN
    ALTER TABLE public.admin_groups
      ADD CONSTRAINT fk_admin_groups_leader_nickname_id
      FOREIGN KEY (leader_nickname_id)
      REFERENCES public.collection_staff_nicknames(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_admin_group_members_member_nickname_id'
      AND conrelid = 'public.admin_group_members'::regclass
  ) THEN
    ALTER TABLE public.admin_group_members
      ADD CONSTRAINT fk_admin_group_members_member_nickname_id
      FOREIGN KEY (member_nickname_id)
      REFERENCES public.collection_staff_nicknames(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_groups_leader_nickname_id_unique
  ON public.admin_groups(leader_nickname_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_group_member_nickname_id_unique
  ON public.admin_group_members(admin_group_id, member_nickname_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_group_members_member_nickname_id_unique
  ON public.admin_group_members(member_nickname_id);
--> statement-breakpoint
COMMENT ON COLUMN public.admin_groups.leader_nickname_id IS
  'Stable team-leader identity and relational source of truth. leader_nickname is a compatibility/display snapshot.';
--> statement-breakpoint
COMMENT ON COLUMN public.admin_group_members.member_nickname_id IS
  'Stable team-member identity and relational source of truth. member_nickname is a compatibility/display snapshot.';
