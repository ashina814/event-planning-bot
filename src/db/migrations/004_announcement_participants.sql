ALTER TABLE announcements ADD COLUMN enable_participants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE announcements ADD COLUMN participants_emojis TEXT;
