-- backend/migrations/20260217_0908_add_departments_to_users.sql
-- Adding department information for manager assignment logic

ALTER TABLE users ADD COLUMN owning_department VARCHAR(100) NULL;

-- Update migration tracking
-- This allows the manager assignment logic to find the appropriate manager for a department
