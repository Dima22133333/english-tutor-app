-- Міграція №6: виправлення обмеження на статус уроку.
-- Стара схема дозволяла лише 'planned','done','cancelled' — додаємо 'rescheduled'.
alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check check (status in ('planned','done','rescheduled','cancelled'));
