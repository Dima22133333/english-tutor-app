-- Міграція №5: нотатка до конкретного уроку.
alter table lessons add column if not exists note text;
