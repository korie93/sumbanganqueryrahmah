INSERT INTO public.setting_categories (name, description)
VALUES ('Roles & Permissions', 'Role behavior and privilege defaults.')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description;

WITH manager_role_settings (
  key,
  label,
  description,
  value,
  default_value
) AS (
  VALUES
    ('tab_manager_home_enabled', 'Manager Tab: Home', 'Allow manager to open Home tab.', 'true', 'true'),
    ('tab_manager_import_enabled', 'Manager Tab: Import', 'Allow manager to open Import tab.', 'true', 'true'),
    ('tab_manager_saved_enabled', 'Manager Tab: Saved', 'Keep Saved imports unavailable to manager.', 'false', 'false'),
    ('tab_manager_viewer_enabled', 'Manager Tab: Viewer', 'Keep Data Viewer unavailable to manager.', 'false', 'false'),
    ('tab_manager_general_search_enabled', 'Manager Tab: Search', 'Allow manager to open Search tab.', 'true', 'true'),
    ('tab_manager_collection_report_enabled', 'Manager Tab: Collection Report', 'Allow manager read-only Collection access.', 'true', 'true'),
    ('tab_manager_analysis_enabled', 'Manager Tab: Analysis', 'Allow manager to open Analysis tab.', 'true', 'true'),
    ('tab_manager_dashboard_enabled', 'Manager Tab: Dashboard', 'Allow manager to open the read-only login dashboard.', 'true', 'true'),
    ('tab_manager_monitor_enabled', 'Manager Tab: System Monitor', 'Keep System Monitor unavailable to manager.', 'false', 'false'),
    ('tab_manager_activity_enabled', 'Manager Tab: Activity', 'Keep the destructive Activity module unavailable to manager.', 'false', 'false'),
    ('tab_manager_audit_logs_enabled', 'Manager Tab: Audit', 'Keep Audit logs unavailable to manager.', 'false', 'false'),
    ('tab_manager_backup_enabled', 'Manager Tab: Backup', 'Keep Backup and Restore unavailable to manager.', 'false', 'false'),
    ('tab_manager_settings_enabled', 'Manager Tab: Settings', 'Keep Settings unavailable to manager.', 'false', 'false')
),
roles_category AS (
  SELECT id
  FROM public.setting_categories
  WHERE name = 'Roles & Permissions'
  LIMIT 1
)
INSERT INTO public.system_settings (
  category_id,
  key,
  label,
  description,
  type,
  value,
  default_value,
  is_critical,
  updated_at
)
SELECT
  roles_category.id,
  manager_role_settings.key,
  manager_role_settings.label,
  manager_role_settings.description,
  'boolean',
  manager_role_settings.value,
  manager_role_settings.default_value,
  false,
  now()
FROM manager_role_settings
CROSS JOIN roles_category
ON CONFLICT (key) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  default_value = EXCLUDED.default_value,
  is_critical = EXCLUDED.is_critical;

WITH manager_role_settings (key) AS (
  VALUES
    ('tab_manager_home_enabled'),
    ('tab_manager_import_enabled'),
    ('tab_manager_saved_enabled'),
    ('tab_manager_viewer_enabled'),
    ('tab_manager_general_search_enabled'),
    ('tab_manager_collection_report_enabled'),
    ('tab_manager_analysis_enabled'),
    ('tab_manager_dashboard_enabled'),
    ('tab_manager_monitor_enabled'),
    ('tab_manager_activity_enabled'),
    ('tab_manager_audit_logs_enabled'),
    ('tab_manager_backup_enabled'),
    ('tab_manager_settings_enabled')
),
role_permissions (role, can_view, can_edit) AS (
  VALUES
    ('superuser', true, true),
    ('admin', true, false),
    ('manager', false, false),
    ('user', false, false)
)
INSERT INTO public.role_setting_permissions (
  role,
  setting_key,
  can_view,
  can_edit
)
SELECT
  role_permissions.role,
  manager_role_settings.key,
  role_permissions.can_view,
  role_permissions.can_edit
FROM manager_role_settings
CROSS JOIN role_permissions
ON CONFLICT (role, setting_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_edit = EXCLUDED.can_edit;
