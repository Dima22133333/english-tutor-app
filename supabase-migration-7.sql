-- Міграція №7: розділення статусу "скасовано" на платне й безкоштовне.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.
-- Стара схема дозволяла лише 'planned','done','rescheduled','cancelled'.
-- Додаємо 'cancelled_paid' — скасований урок, за який оплата все одно стягується
-- (він рахується як "проведений" при розрахунку боргу/балансу).
-- Існуючі уроки зі статусом 'cancelled' далі трактуються як безкоштовне скасування — без змін.
alter table lessons drop constraint if exists lessons_status_check;
alter table lessons add constraint lessons_status_check check (status in ('planned','done','rescheduled','cancelled','cancelled_paid'));
