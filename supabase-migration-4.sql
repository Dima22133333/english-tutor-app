-- Міграція №4: посилання на онлайн-урок.
alter table students add column if not exists meeting_link text;
