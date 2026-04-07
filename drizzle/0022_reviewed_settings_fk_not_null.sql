DELETE FROM public.setting_options so
WHERE so.setting_id IS NULL
  OR NOT EXISTS (
    SELECT 1
    FROM public.system_settings s
    WHERE s.id = so.setting_id
  );
--> statement-breakpoint
DELETE FROM public.system_settings s
WHERE s.category_id IS NULL
  OR NOT EXISTS (
    SELECT 1
    FROM public.setting_categories c
    WHERE c.id = s.category_id
  );
--> statement-breakpoint
ALTER TABLE "setting_options" ALTER COLUMN "setting_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ALTER COLUMN "category_id" SET NOT NULL;
