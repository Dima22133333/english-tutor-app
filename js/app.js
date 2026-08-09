(() => {
  'use strict';

  if (!SUPABASE_URL || SUPABASE_URL.includes('ВСТАВЬ_СЮДА') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('ВСТАВЬ_СЮДА')) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#FAF5F7;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">⚙️</div>
          <h2 style="margin:0 0 10px;">Додаток майже готовий</h2>
          <p style="color:#555;line-height:1.6;">Залишилось вставити дані свого проєкту Supabase у файл <code>js/config.js</code> — Project URL і anon key (Settings → API у панелі Supabase).</p>
        </div>
      </div>`;
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#FAF5F7;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">📡</div>
          <h2 style="margin:0 0 10px;">Не завантажилась бібліотека Supabase</h2>
          <p style="color:#555;line-height:1.6;">Перевір інтернет-з'єднання і онови сторінку. Якщо не допоможе — напиши в чат.</p>
        </div>
      </div>`;
    return;
  }

  let sb;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#FAF5F7;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">⚠️</div>
          <h2 style="margin:0 0 10px;">Помилка підключення до бази даних</h2>
          <p style="color:#555;line-height:1.6;">${e.message}</p>
        </div>
      </div>`;
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const fmtMoney = (n) => `${Number(n || 0).toLocaleString('uk-UA')} ₴`;
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtDateLong = (d) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', weekday: 'long' });
  const toISODate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => toISODate(new Date());

  const DURATIONS = [30, 40, 45, 50, 55, 60, 80, 90];
  const WEEKDAYS = [
    { v: 1, l: 'Пн' }, { v: 2, l: 'Вт' }, { v: 3, l: 'Ср' }, { v: 4, l: 'Чт' },
    { v: 5, l: 'Пт' }, { v: 6, l: 'Сб' }, { v: 0, l: 'Нд' }
  ];

  function slotRowHtml(slot) {
    const weekday = slot ? slot.weekday : '';
    const time = slot ? (slot.slot_time || '').slice(0, 5) : '';
    const duration = slot ? slot.duration_minutes : 60;
    return `<div class="slot-row">
      <select class="slot-day"><option value="">День</option>${WEEKDAYS.map(w => `<option value="${w.v}" ${String(weekday) === String(w.v) ? 'selected' : ''}>${w.l}</option>`).join('')}</select>
      <input type="time" class="slot-time" value="${time}">
      <select class="slot-duration">${DURATIONS.map(d => `<option value="${d}" ${duration === d ? 'selected' : ''}>${d} хв</option>`).join('')}</select>
      <button type="button" class="row-del slot-remove">✕</button>
    </div>`;
  }

  function wireSlotBuilder(form) {
    const builder = form.querySelector('#slotBuilder');
    form.querySelector('#slotAddBtn').addEventListener('click', () => {
      builder.insertAdjacentHTML('beforeend', slotRowHtml(null));
    });
    builder.addEventListener('click', (e) => {
      if (e.target.classList.contains('slot-remove')) e.target.closest('.slot-row').remove();
    });
  }

  function collectSlots(form) {
    return [...form.querySelectorAll('.slot-row')]
      .map(r => ({
        weekday: r.querySelector('.slot-day').value,
        time: r.querySelector('.slot-time').value,
        duration: Number(r.querySelector('.slot-duration').value)
      }))
      .filter(s => s.weekday !== '' && s.time);
  }

  async function saveSlots(entityId, userId, slots) {
    await sb.from('schedule_slots').delete().eq('student_id', entityId);
    if (slots.length) {
      await sb.from('schedule_slots').insert(slots.map(s => ({
        student_id: entityId, user_id: userId, weekday: Number(s.weekday), slot_time: s.time, duration_minutes: s.duration
      })));
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  let currentStudents = [];
  let currentGroupMembers = [];
  let currentStudentId = null;
  let currentLessons = [];
  let currentPayments = [];
  let scheduleDate = new Date();
  let searchQuery = '';
  let debtorsOnly = false;

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-error', !!isError);
    t.classList.add('is-visible');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('is-visible'), 2600);
  }

  /* ---------------- Auth ---------------- */
  const authScreen = $('#authScreen');
  const appRoot = $('#app');

  async function checkSession() {
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(); else showAuth();
  }

  function showAuth() {
    authScreen.hidden = false;
    appRoot.hidden = true;
  }

  async function showApp() {
    authScreen.hidden = true;
    appRoot.hidden = false;
    await loadStudents();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const errEl = $('#authError');
    errEl.textContent = '';
    $('#loginBtn').textContent = 'Входимо…';
    let error;
    try {
      ({ error } = await sb.auth.signInWithPassword({ email, password }));
    } catch (e2) {
      $('#loginBtn').textContent = 'Увійти';
      errEl.textContent = 'Помилка мережі: ' + e2.message + '. Перевір інтернет і спробуй ще раз.';
      return;
    }
    $('#loginBtn').textContent = 'Увійти';
    if (error) { errEl.textContent = 'Не вдалося увійти: ' + translateAuthError(error.message); return; }
    showApp();
  });

  $('#logoutBtn').addEventListener('click', async () => {
    if (!confirm('Ви впевнені, що хочете вийти?')) return;
    await sb.auth.signOut();
    showAuth();
  });

  function translateAuthError(msg) {
    if (/invalid login credentials/i.test(msg)) return 'невірний email або пароль';
    if (/email not confirmed/i.test(msg)) return 'потрібно підтвердити email (див. лист), або вимкни підтвердження в налаштуваннях Supabase';
    return msg;
  }

  /* ---------------- Nav tabs ---------------- */
  $('#navStudents').addEventListener('click', () => switchTab('students'));
  $('#navSchedule').addEventListener('click', () => switchTab('schedule'));
  $('#navStats').addEventListener('click', () => switchTab('stats'));

  function switchTab(tab) {
    $('#navStudents').classList.toggle('is-active', tab === 'students');
    $('#navSchedule').classList.toggle('is-active', tab === 'schedule');
    $('#navStats').classList.toggle('is-active', tab === 'stats');
    $('#listView').hidden = tab !== 'students';
    $('#scheduleView').hidden = tab !== 'schedule';
    $('#statsView').hidden = tab !== 'stats';
    $('#studentView').hidden = true;
    if (tab === 'schedule') renderSchedule();
    if (tab === 'stats') renderStats();
  }

  /* ---------------- Students & groups: list ---------------- */
  async function loadStudents() {
    const [studentsRes, lessonsRes, paymentsRes, membersRes, slotsRes] = await Promise.all([
      sb.from('students').select('*').order('created_at', { ascending: true }),
      sb.from('lessons').select('id,student_id,status,lesson_date,lesson_time,duration_minutes,note'),
      sb.from('payments').select('student_id,amount'),
      sb.from('group_members').select('group_id,student_id'),
      sb.from('schedule_slots').select('student_id,weekday,slot_time,duration_minutes')
    ]);
    if (studentsRes.error) { toast('Помилка завантаження учнів', true); return; }

    const students = studentsRes.data || [];
    const lessons = lessonsRes.data || [];
    const payments = paymentsRes.data || [];
    currentGroupMembers = membersRes.data || [];
    window.__allLessons = lessons;
    window.__allSlots = slotsRes.data || [];

    currentStudents = students.map(s => {
      const doneCount = lessons.filter(l => l.student_id === s.id && l.status === 'done').length;
      const paid = payments.filter(p => p.student_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0);
      const owed = doneCount * Number(s.price_per_lesson) - paid;
      return { ...s, doneCount, paid, owed };
    });

    renderStudentList(lessons);
  }

  function renderStudentList(lessons) {
    if (lessons) window.__lastLessons = lessons;
    lessons = lessons || window.__lastLessons;
    const grid = $('#studentsGrid');
    grid.innerHTML = '';

    const totalOwed = currentStudents.reduce((s, st) => s + Math.max(st.owed, 0), 0);
    const totalPaid = currentStudents.reduce((s, st) => s + st.paid, 0);

    const monthPrefix = todayISO().slice(0, 7);
    const monthEarnings = currentStudents.reduce((sum, s) => {
      const doneThisMonth = (lessons || []).filter(l => l.student_id === s.id && l.status === 'done' && l.lesson_date.startsWith(monthPrefix)).length;
      return sum + doneThisMonth * Number(s.price_per_lesson);
    }, 0);

    $('#totalsRow').innerHTML = `
      <span class="chip">Учнів/груп: <b>${currentStudents.length}</b></span>
      <span class="chip">Оплачено: <b>${fmtMoney(totalPaid)}</b></span>
      <span class="chip ${totalOwed > 0 ? 'warn' : ''}">Заборгованість: <b>${fmtMoney(totalOwed)}</b></span>
      <span class="chip highlight">Заробіток за місяць: <b>${fmtMoney(monthEarnings)}</b></span>
    `;

    const q = searchQuery.trim().toLowerCase();
    const visible = currentStudents.filter(s => {
      if (debtorsOnly && !(s.owed > 0)) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });

    $('#emptyState').hidden = currentStudents.length > 0;
    $('#noResultsState').hidden = !(currentStudents.length > 0 && visible.length === 0);

    visible.forEach(s => {
      const card = el('div', 'student-card');
      const balCls = s.owed > 0 ? 'due' : (s.owed < 0 ? 'ok' : 'watch');
      const balText = s.owed > 0 ? `Борг ${fmtMoney(s.owed)}` : (s.owed < 0 ? `Переплата ${fmtMoney(-s.owed)}` : 'Не оплачено');
      const subLabel = s.is_group ? memberNamesFor(s.id) || 'Без учасників' : (s.phone || 'без телефону');
      card.innerHTML = `
        <div class="student-card__name">${escapeHtml(s.name)}${s.is_group ? '<span class="group-badge">Група</span>' : ''}</div>
        <span class="student-card__phone">${escapeHtml(subLabel)}</span>
        <span class="student-card__balance ${balCls}">${balText}</span>
      `;
      card.addEventListener('click', () => openStudent(s.id));
      grid.appendChild(card);
    });
  }

  $('#studentSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderStudentList();
  });
  $('#debtorsFilterBtn').addEventListener('click', () => {
    debtorsOnly = !debtorsOnly;
    $('#debtorsFilterBtn').classList.toggle('is-active', debtorsOnly);
    renderStudentList();
  });

  function memberNamesFor(groupId) {
    const ids = currentGroupMembers.filter(m => m.group_id === groupId).map(m => m.student_id);
    return ids.map(id => currentStudents.find(s => s.id === id)?.name).filter(Boolean).join(', ');
  }

  /* ---------------- Add / edit / delete student ---------------- */
  $('#addStudentBtn').addEventListener('click', () => openStudentForm());
  $('#addGroupBtn').addEventListener('click', () => openGroupForm());
  $('#editStudentBtn').addEventListener('click', () => {
    const s = currentStudents.find(x => x.id === currentStudentId);
    if (s.is_group) openGroupForm(s); else openStudentForm(s);
  });

  async function openStudentForm(student) {
    const existingSlots = student ? (window.__allSlots || []).filter(s => s.student_id === student.id) : [];
    openModal(student ? 'Змінити учня' : 'Новий учень', `
      <div class="field"><label>Ім'я</label><input type="text" id="fName" required value="${student ? escapeHtml(student.name) : ''}" placeholder="Наприклад, Оля Петренко"></div>
      <div class="field"><label>Телефон (необов'язково)</label><input type="tel" id="fPhone" value="${student ? escapeHtml(student.phone || '') : ''}" placeholder="+380 __ ___ __ __"></div>
      <div class="field"><label>Ціна одного уроку, ₴</label><input type="number" id="fPrice" required min="0" step="1" value="${student ? student.price_per_lesson : ''}" placeholder="300"></div>
      <div class="field"><label>Посилання на урок (необов'язково)</label><input type="url" id="fMeetingLink" value="${student ? escapeHtml(student.meeting_link || '') : ''}" placeholder="https://meet.google.com/..."></div>
      <div class="field"><label>Графік занять (необов'язково)</label>
        <div class="slot-builder" id="slotBuilder">${(existingSlots.length ? existingSlots : [null]).map(slotRowHtml).join('')}</div>
        <button type="button" class="slot-add" id="slotAddBtn">+ Додати ще один час</button>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${student ? 'Зберегти' : 'Додати'}</button>
    `, async (form) => {
      const name = form.querySelector('#fName').value.trim();
      const phone = form.querySelector('#fPhone').value.trim();
      const price = Number(form.querySelector('#fPrice').value);
      const meeting_link = form.querySelector('#fMeetingLink').value.trim();
      if (!name || !(price >= 0)) return;
      const slots = collectSlots(form);
      const userId = (await sb.auth.getUser()).data.user.id;
      let entityId = student?.id;

      if (student) {
        const { error } = await sb.from('students').update({ name, phone, price_per_lesson: price, meeting_link }).eq('id', student.id);
        if (error) return toast('Не вдалося зберегти', true);
        toast('Збережено');
      } else {
        const { data, error } = await sb.from('students').insert({ name, phone, price_per_lesson: price, meeting_link, is_group: false, user_id: userId }).select().single();
        if (error) return toast('Не вдалося додати', true);
        entityId = data.id;
        toast('Учня додано');
      }
      await saveSlots(entityId, userId, slots);
      closeModal();
      await loadStudents();
      if (student) await openStudent(student.id);
    });
    wireSlotBuilder($('#modalForm'));
  }

  function openGroupForm(group) {
    const individuals = currentStudents.filter(s => !s.is_group);
    const memberIds = group ? currentGroupMembers.filter(m => m.group_id === group.id).map(m => m.student_id) : [];
    const checklistHtml = individuals.length
      ? individuals.map(s => `<label><input type="checkbox" value="${s.id}" ${memberIds.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`).join('')
      : '<span class="empty">Спершу додай окремих учнів, щоб включити їх у групу</span>';
    const existingSlots = group ? (window.__allSlots || []).filter(s => s.student_id === group.id) : [];

    openModal(group ? 'Змінити групу' : 'Нова група', `
      <div class="field"><label>Назва групи</label><input type="text" id="fName" required value="${group ? escapeHtml(group.name) : ''}" placeholder="Наприклад, Група А2 (вівторок)"></div>
      <div class="field"><label>Ціна групового заняття, ₴</label><input type="number" id="fPrice" required min="0" step="1" value="${group ? group.price_per_lesson : ''}" placeholder="600"></div>
      <div class="field"><label>Посилання на урок (необов'язково)</label><input type="url" id="fMeetingLink" value="${group ? escapeHtml(group.meeting_link || '') : ''}" placeholder="https://meet.google.com/..."></div>
      <div class="field"><label>Учасники групи</label><div class="member-checklist" id="fMembers">${checklistHtml}</div></div>
      <div class="field"><label>Графік занять (необов'язково)</label>
        <div class="slot-builder" id="slotBuilder">${(existingSlots.length ? existingSlots : [null]).map(slotRowHtml).join('')}</div>
        <button type="button" class="slot-add" id="slotAddBtn">+ Додати ще один час</button>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${group ? 'Зберегти' : 'Створити групу'}</button>
    `, async (form) => {
      const name = form.querySelector('#fName').value.trim();
      const price = Number(form.querySelector('#fPrice').value);
      const meeting_link = form.querySelector('#fMeetingLink').value.trim();
      const memberIdsNew = [...form.querySelectorAll('#fMembers input:checked')].map(i => i.value);
      const slots = collectSlots(form);
      if (!name || !(price >= 0)) return;

      const userId = (await sb.auth.getUser()).data.user.id;
      let groupId = group?.id;

      if (group) {
        const { error } = await sb.from('students').update({ name, price_per_lesson: price, meeting_link }).eq('id', group.id);
        if (error) return toast('Не вдалося зберегти', true);
        await sb.from('group_members').delete().eq('group_id', group.id);
      } else {
        const { data, error } = await sb.from('students').insert({ name, price_per_lesson: price, meeting_link, is_group: true, user_id: userId }).select().single();
        if (error) return toast('Не вдалося створити групу', true);
        groupId = data.id;
      }

      if (memberIdsNew.length) {
        const rows = memberIdsNew.map(sid => ({ group_id: groupId, student_id: sid, user_id: userId }));
        await sb.from('group_members').insert(rows);
      }
      await saveSlots(groupId, userId, slots);

      toast(group ? 'Групу оновлено' : 'Групу створено');
      closeModal();
      await loadStudents();
      if (group) await openStudent(group.id);
    });
    wireSlotBuilder($('#modalForm'));
  }

  $('#deleteStudentBtn').addEventListener('click', async () => {
    const s = currentStudents.find(x => x.id === currentStudentId);
    if (!s) return;
    const label = s.is_group ? 'групу' : 'учня';
    if (!confirm(`Видалити ${label} «${s.name}» разом з усіма уроками й оплатами? Це незворотно.`)) return;
    const { error } = await sb.from('students').delete().eq('id', s.id);
    if (error) return toast('Не вдалося видалити', true);
    toast('Видалено');
    goToList();
    await loadStudents();
  });

  $('#reportBtn').addEventListener('click', () => {
    const s = currentStudents.find(x => x.id === currentStudentId);
    if (!s) return;
    const monthPrefix = todayISO().slice(0, 7);
    const monthLabel = new Date().toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });

    const monthLessons = currentLessons.filter(l => l.lesson_date.startsWith(monthPrefix) && l.status === 'done');
    const monthPayments = currentPayments.filter(p => p.payment_date.startsWith(monthPrefix));
    const sumLessons = monthLessons.length * Number(s.price_per_lesson);
    const sumPaid = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const doneCountTotal = currentLessons.filter(l => l.status === 'done').length;
    const paidTotal = currentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const owedTotal = doneCountTotal * Number(s.price_per_lesson) - paidTotal;

    const lessonsListText = monthLessons.length
      ? monthLessons.slice().sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))
          .map(l => `— ${fmtDate(l.lesson_date)}${l.lesson_time ? ' о ' + l.lesson_time.slice(0, 5) : ''}${l.duration_minutes ? ` (${l.duration_minutes} хв)` : ''}`).join('\n')
      : 'уроків не було';

    const balanceLine = owedTotal > 0 ? `Борг: ${fmtMoney(owedTotal)}` : (owedTotal < 0 ? `Переплата: ${fmtMoney(-owedTotal)}` : 'Оплачено повністю');

    const report = `Звіт за ${monthLabel}\n${s.is_group ? 'Група' : 'Учень'}: ${s.name}\n\nПроведені уроки:\n${lessonsListText}\n\nУсього уроків за місяць: ${monthLessons.length}\nСума за уроки: ${fmtMoney(sumLessons)}\nОплачено за місяць: ${fmtMoney(sumPaid)}\n\nЗагальний баланс: ${balanceLine}`;

    openModal('Звіт за місяць', `
      <textarea class="report-text" id="reportTextArea" readonly>${escapeHtml(report)}</textarea>
      <div class="report-actions">
        <button type="button" class="btn btn-ghost" id="reportCopyBtn">Копіювати</button>
        <button type="button" class="btn btn-primary" id="reportShareBtn">Поділитися</button>
      </div>
    `, () => {});

    $('#reportCopyBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(report);
        toast('Скопійовано');
      } catch {
        $('#reportTextArea').select();
        document.execCommand('copy');
        toast('Скопійовано');
      }
    });
    const shareBtn = $('#reportShareBtn');
    if (navigator.share) {
      shareBtn.addEventListener('click', () => navigator.share({ text: report }).catch(() => {}));
    } else {
      shareBtn.hidden = true;
    }
  });

  /* ---------------- Student/group detail ---------------- */
  async function openStudent(id) {
    currentStudentId = id;
    switchTabInternal();
    $('#listView').hidden = true;
    $('#scheduleView').hidden = true;
    $('#statsView').hidden = true;
    $('#studentView').hidden = false;

    const s = currentStudents.find(x => x.id === id);
    $('#studentName').textContent = s.name;
    $('#balPriceLabel').textContent = s.is_group ? 'Ціна заняття' : 'Ціна уроку';

    const meetingBtn = $('#meetingLinkBtn');
    if (s.meeting_link) {
      meetingBtn.href = s.meeting_link;
      meetingBtn.hidden = false;
    } else {
      meetingBtn.hidden = true;
    }

    if (s.is_group) {
      $('#studentPhone').textContent = '';
      const chipsWrap = $('#memberChips');
      const names = currentGroupMembers.filter(m => m.group_id === id).map(m => currentStudents.find(st => st.id === m.student_id)?.name).filter(Boolean);
      chipsWrap.innerHTML = names.length ? names.map(n => `<span>${escapeHtml(n)}</span>`).join('') : '<span>Без учасників</span>';
      chipsWrap.hidden = false;
    } else {
      $('#studentPhone').textContent = s.phone || '';
      $('#memberChips').hidden = true;
    }

    const [{ data: lessons }, { data: payments }] = await Promise.all([
      sb.from('lessons').select('*').eq('student_id', id).order('lesson_date', { ascending: false }),
      sb.from('payments').select('*').eq('student_id', id).order('payment_date', { ascending: false })
    ]);
    currentLessons = lessons || [];
    currentPayments = payments || [];
    renderStudentDetail(s);
  }

  function switchTabInternal() {
    $('#navStudents').classList.remove('is-active');
    $('#navSchedule').classList.remove('is-active');
    $('#navStats').classList.remove('is-active');
  }

  function renderStudentDetail(s) {
    const doneCount = currentLessons.filter(l => l.status === 'done').length;
    const paid = currentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const owed = doneCount * Number(s.price_per_lesson) - paid;
    const paidLessons = s.price_per_lesson > 0 ? Math.floor(paid / Number(s.price_per_lesson)) : 0;
    const remaining = paidLessons - doneCount;

    $('#balLessons').textContent = doneCount;
    $('#balPrice').textContent = fmtMoney(s.price_per_lesson);
    $('#balPaid').textContent = fmtMoney(paid);
    const balRemaining = $('#balRemaining');
    balRemaining.textContent = remaining > 0 ? remaining : (remaining === 0 ? '0 (не оплачено)' : `${remaining} (не оплачено)`);
    balRemaining.closest('.balance-item').classList.toggle('balance-item--warn', remaining <= 0);
    const balDue = $('#balDue');
    balDue.textContent = owed > 0 ? fmtMoney(owed) : (owed < 0 ? `+${fmtMoney(-owed)}` : '0 ₴');
    balDue.closest('.balance-item').classList.toggle('is-due', owed > 0);

    const lessonsList = $('#lessonsList');
    lessonsList.innerHTML = '';
    $('#lessonsEmpty').hidden = currentLessons.length > 0;
    currentLessons.forEach(l => {
      const row = el('li', 'list-row list-row--stacked');
      const durationLabel = l.duration_minutes ? ` · ${l.duration_minutes} хв` : '';
      row.innerHTML = `
        <div class="list-row__top">
          <div class="list-row__main">
            <span class="list-row__date">${fmtDate(l.lesson_date)}${l.lesson_time ? ' · ' + l.lesson_time.slice(0, 5) : ''}${durationLabel}</span>
          </div>
          <div class="list-row__right">
            <select class="status-select ${l.status}" data-lesson="${l.id}">
              <option value="planned" ${l.status === 'planned' ? 'selected' : ''}>Заплановано</option>
              <option value="done" ${l.status === 'done' ? 'selected' : ''}>Проведено</option>
              <option value="rescheduled" ${l.status === 'rescheduled' ? 'selected' : ''}>Перенесено</option>
              <option value="cancelled" ${l.status === 'cancelled' ? 'selected' : ''}>Скасовано</option>
            </select>
            <button class="row-note" data-note-lesson="${l.id}" title="Нотатка">📝</button>
            <button class="row-del" data-del-lesson="${l.id}" title="Видалити">✕</button>
          </div>
        </div>
        ${l.note ? `<p class="list-row__note">${escapeHtml(l.note)}</p>` : ''}`;
      lessonsList.appendChild(row);
    });

    const paymentsList = $('#paymentsList');
    paymentsList.innerHTML = '';
    $('#paymentsEmpty').hidden = currentPayments.length > 0;
    currentPayments.forEach(p => {
      const row = el('li', 'list-row');
      row.innerHTML = `
        <div class="list-row__main">
          <span class="list-row__date">${fmtDate(p.payment_date)}</span>
          ${p.comment ? `<span class="list-row__sub">${escapeHtml(p.comment)}</span>` : ''}
        </div>
        <div class="list-row__right">
          <span class="amount-tag">+${fmtMoney(p.amount)}</span>
          <button class="row-del" data-del-payment="${p.id}" title="Видалити">✕</button>
        </div>`;
      paymentsList.appendChild(row);
    });
  }

  $('#backBtn').addEventListener('click', goToList);
  function goToList() {
    $('#studentView').hidden = true;
    $('#listView').hidden = false;
    $('#navStudents').classList.add('is-active');
    currentStudentId = null;
  }

  $('#lessonsList').addEventListener('change', async (e) => {
    const lessonId = e.target.getAttribute('data-lesson');
    if (!lessonId) return;
    const next = e.target.value;
    const { error } = await sb.from('lessons').update({ status: next }).eq('id', lessonId);
    if (error) return toast('Не вдалося змінити статус', true);
    const lesson = currentLessons.find(l => l.id === lessonId);
    if (lesson) lesson.status = next;
    e.target.className = `status-select ${next}`;
    renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
    loadStudents();
  });

  $('#lessonsList').addEventListener('click', async (e) => {
    const delId = e.target.getAttribute('data-del-lesson');
    if (delId) {
      if (!confirm('Видалити цей урок?')) return;
      const { error } = await sb.from('lessons').delete().eq('id', delId);
      if (error) return toast('Не вдалося видалити', true);
      currentLessons = currentLessons.filter(l => l.id !== delId);
      renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
      loadStudents();
      return;
    }

    const noteId = e.target.getAttribute('data-note-lesson');
    if (noteId) {
      const lesson = currentLessons.find(l => l.id === noteId);
      openModal('Нотатка до уроку', `
        <div class="field"><label>${fmtDate(lesson.lesson_date)}${lesson.lesson_time ? ' · ' + lesson.lesson_time.slice(0, 5) : ''}</label>
          <textarea id="fNoteEdit" rows="4" placeholder="Наприклад: повторити Present Perfect">${escapeHtml(lesson.note || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Зберегти</button>
      `, async (form) => {
        const note = form.querySelector('#fNoteEdit').value.trim();
        const { error } = await sb.from('lessons').update({ note }).eq('id', noteId);
        if (error) return toast('Не вдалося зберегти нотатку', true);
        lesson.note = note;
        closeModal();
        toast('Нотатку збережено');
        renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
      });
    }
  });

  $('#paymentsList').addEventListener('click', async (e) => {
    const delId = e.target.getAttribute('data-del-payment');
    if (!delId) return;
    if (!confirm('Видалити цю оплату?')) return;
    const { error } = await sb.from('payments').delete().eq('id', delId);
    if (error) return toast('Не вдалося видалити', true);
    currentPayments = currentPayments.filter(p => p.id !== delId);
    renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
    loadStudents();
  });

  /* ---------------- Add lesson / payment ---------------- */
  $('#addLessonBtn').addEventListener('click', () => {
    openModal('Новий урок', `
      <div class="field-row">
        <div class="field"><label>Дата</label><input type="date" id="fDate" required value="${todayISO()}"></div>
        <div class="field"><label>Час (необов'язково)</label><input type="time" id="fTime"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Тривалість</label>
          <select id="fDuration">${DURATIONS.map(d => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${d} хв</option>`).join('')}</select>
        </div>
        <div class="field"><label>Статус</label>
          <select id="fStatus">
            <option value="planned">Заплановано</option>
            <option value="done">Проведено</option>
            <option value="rescheduled">Перенесено</option>
            <option value="cancelled">Скасовано</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Нотатка до цього уроку (необов'язково)</label><textarea id="fNote" rows="2" placeholder="Наприклад: повторити Present Perfect"></textarea></div>
      <button type="submit" class="btn btn-primary btn-block">Додати</button>
    `, async (form) => {
      const lesson_date = form.querySelector('#fDate').value;
      const lesson_time = form.querySelector('#fTime').value || null;
      const duration_minutes = Number(form.querySelector('#fDuration').value);
      const status = form.querySelector('#fStatus').value;
      const note = form.querySelector('#fNote').value.trim();
      const { error } = await sb.from('lessons').insert({
        student_id: currentStudentId, lesson_date, lesson_time, duration_minutes, status, note,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не вдалося додати урок', true);
      closeModal();
      toast('Урок додано');
      await openStudent(currentStudentId);
      await loadStudents();
    });
    const dateInput = $('#modalForm #fDate');
    const statusSelect = $('#modalForm #fStatus');
    const updateDefaultStatus = () => { statusSelect.value = dateInput.value > todayISO() ? 'planned' : 'done'; };
    updateDefaultStatus();
    dateInput.addEventListener('change', updateDefaultStatus);
  });

  $('#addPaymentBtn').addEventListener('click', () => {
    openModal('Нова оплата', `
      <div class="field"><label>Дата</label><input type="date" id="fDate" required value="${todayISO()}"></div>
      <div class="field"><label>Сума, ₴</label><input type="number" id="fAmount" required min="0" step="1" placeholder="1200"></div>
      <div class="field"><label>Коментар (необов'язково)</label><input type="text" id="fComment" placeholder="Наприклад, за 4 уроки"></div>
      <button type="submit" class="btn btn-primary btn-block">Додати</button>
    `, async (form) => {
      const payment_date = form.querySelector('#fDate').value;
      const amount = Number(form.querySelector('#fAmount').value);
      const comment = form.querySelector('#fComment').value.trim();
      if (!(amount > 0)) return;
      const { error } = await sb.from('payments').insert({
        student_id: currentStudentId, payment_date, amount, comment,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не вдалося додати оплату', true);
      closeModal();
      toast('Оплату додано');
      await openStudent(currentStudentId);
      await loadStudents();
    });
  });

  /* ---------------- Schedule ---------------- */
  $('#schedPrev').addEventListener('click', () => { scheduleDate.setDate(scheduleDate.getDate() - 1); renderSchedule(); });
  $('#schedNext').addEventListener('click', () => { scheduleDate.setDate(scheduleDate.getDate() + 1); renderSchedule(); });
  $('#schedToday').addEventListener('click', () => { scheduleDate = new Date(); renderSchedule(); });

  $('#addOneTimeLessonBtn').addEventListener('click', () => {
    if (!currentStudents.length) return toast('Спершу додай учня', true);
    const studentOptions = currentStudents.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.is_group ? ' (група)' : ''}</option>`).join('');
    openModal('Разовий урок', `
      <div class="field"><label>Учень / група</label><select id="fStudent">${studentOptions}</select></div>
      <div class="field-row">
        <div class="field"><label>Дата</label><input type="date" id="fDate" required value="${toISODate(scheduleDate)}"></div>
        <div class="field"><label>Час (необов'язково)</label><input type="time" id="fTime"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Тривалість</label>
          <select id="fDuration">${DURATIONS.map(d => `<option value="${d}" ${d === 60 ? 'selected' : ''}>${d} хв</option>`).join('')}</select>
        </div>
        <div class="field"><label>Статус</label>
          <select id="fStatus">
            <option value="planned">Заплановано</option>
            <option value="done">Проведено</option>
            <option value="rescheduled">Перенесено</option>
            <option value="cancelled">Скасовано</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Нотатка (необов'язково)</label><textarea id="fNote" rows="2" placeholder="Наприклад: перенесли з понеділка"></textarea></div>
      <button type="submit" class="btn btn-primary btn-block">Додати</button>
    `, async (form) => {
      const student_id = form.querySelector('#fStudent').value;
      const lesson_date = form.querySelector('#fDate').value;
      const lesson_time = form.querySelector('#fTime').value || null;
      const duration_minutes = Number(form.querySelector('#fDuration').value);
      const status = form.querySelector('#fStatus').value;
      const note = form.querySelector('#fNote').value.trim();
      const { error } = await sb.from('lessons').insert({
        student_id, lesson_date, lesson_time, duration_minutes, status, note,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не вдалося додати урок', true);
      closeModal();
      toast('Урок додано');
      await loadStudents();
      renderSchedule();
    });
    const dateInput = $('#modalForm #fDate');
    const statusSelect = $('#modalForm #fStatus');
    const updateDefaultStatus = () => { statusSelect.value = dateInput.value > todayISO() ? 'planned' : 'done'; };
    updateDefaultStatus();
    dateInput.addEventListener('change', updateDefaultStatus);
  });

  $('#scheduleList').addEventListener('change', async (e) => {
    const select = e.target;
    if (!select.classList.contains('status-select')) return;
    const status = select.value;

    const lessonId = select.getAttribute('data-lesson');
    if (lessonId) {
      const { error } = await sb.from('lessons').update({ status }).eq('id', lessonId);
      if (error) return toast('Не вдалося змінити статус', true);
      toast('Статус оновлено');
      await loadStudents();
      renderSchedule();
      return;
    }

    const studentId = select.getAttribute('data-new-student');
    if (studentId) {
      const lesson_time = select.getAttribute('data-new-time') || null;
      const duration_minutes = Number(select.getAttribute('data-new-duration')) || null;
      const { error } = await sb.from('lessons').insert({
        student_id: studentId, lesson_date: toISODate(scheduleDate), lesson_time, duration_minutes, status,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не вдалося додати урок', true);
      toast('Урок додано');
      await loadStudents();
      renderSchedule();
    }
  });

  function renderSchedule() {
    const iso = toISODate(scheduleDate);
    const isToday = iso === todayISO();
    const weekday = scheduleDate.getDay();
    $('#schedDateLabel').textContent = isToday ? 'Сьогодні' : fmtDateLong(scheduleDate);
    $('#schedDateSub').textContent = isToday ? fmtDateLong(scheduleDate) : '';

    const actualLessons = (window.__allLessons || []).filter(l => l.lesson_date === iso);
    const actualStudentIds = new Set(actualLessons.map(l => l.student_id));
    const templateSlots = (window.__allSlots || []).filter(sl => sl.weekday === weekday && !actualStudentIds.has(sl.student_id));

    const entries = [
      ...actualLessons.map(l => ({ type: 'actual', id: l.id, time: l.lesson_time, duration: l.duration_minutes, studentId: l.student_id, status: l.status, note: l.note })),
      ...templateSlots.map(sl => ({ type: 'template', time: sl.slot_time, duration: sl.duration_minutes, studentId: sl.student_id }))
    ];
    entries.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    const list = $('#scheduleList');
    list.innerHTML = '';
    $('#scheduleEmpty').hidden = entries.length > 0;

    entries.forEach(entry => {
      const s = currentStudents.find(x => x.id === entry.studentId);
      if (!s) return;
      const row = el('li', 'list-row' + (entry.type === 'template' ? ' is-template' : ''));
      const timeLabel = entry.time ? entry.time.slice(0, 5) : '';
      const durationLabel = entry.duration ? ` (${entry.duration} хв)` : '';
      const selectAttrs = entry.type === 'actual'
        ? `data-lesson="${entry.id}"`
        : `data-new-student="${entry.studentId}" data-new-time="${entry.time || ''}" data-new-duration="${entry.duration || 60}"`;
      const rightHtml = `
        <select class="status-select ${entry.type === 'actual' ? entry.status : ''}" ${selectAttrs}>
          ${entry.type === 'template' ? '<option value="" disabled selected>За розкладом</option>' : ''}
          <option value="planned" ${entry.status === 'planned' ? 'selected' : ''}>Заплановано</option>
          <option value="done" ${entry.status === 'done' ? 'selected' : ''}>Проведено</option>
          <option value="rescheduled" ${entry.status === 'rescheduled' ? 'selected' : ''}>Перенесено</option>
          <option value="cancelled" ${entry.status === 'cancelled' ? 'selected' : ''}>Скасовано</option>
        </select>`;
      row.innerHTML = `
        <div class="list-row__main">
          <span class="list-row__name">${escapeHtml(s.name)}${s.is_group ? ' <span class="group-badge">Група</span>' : ''}</span>
          ${timeLabel ? `<span class="list-row__time">${timeLabel}${durationLabel}</span>` : ''}
          ${entry.note ? `<span class="list-row__sub">📝 ${escapeHtml(entry.note)}</span>` : ''}
        </div>
        <div class="list-row__right">${rightHtml}</div>`;
      row.querySelector('.list-row__main').addEventListener('click', () => openStudent(s.id));
      list.appendChild(row);
    });

    renderWeekGrid();
  }

  function renderWeekGrid() {
    const table = $('#weekGrid');
    const slots = window.__allSlots || [];
    $('#weekGridEmpty').hidden = slots.length > 0;
    if (!slots.length) { table.innerHTML = ''; return; }

    const times = [...new Set(slots.map(sl => sl.slot_time))].sort();

    let html = '<thead><tr><th>Час</th>' + WEEKDAYS.map(w => `<th>${w.l}</th>`).join('') + '</tr></thead><tbody>';
    times.forEach(time => {
      html += `<tr><td>${time.slice(0, 5)}</td>`;
      WEEKDAYS.forEach(w => {
        const cellSlots = slots.filter(sl => sl.slot_time === time && sl.weekday === w.v);
        const cellHtml = cellSlots.map(sl => {
          const s = currentStudents.find(x => x.id === sl.student_id);
          if (!s) return '';
          return `<span class="week-grid__entry">${escapeHtml(s.name)} <small>(${sl.duration_minutes} хв)</small></span>`;
        }).join('');
        html += `<td>${cellHtml}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function renderStats() {
    const lessons = window.__allLessons || [];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        prefix: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('uk-UA', { month: 'short' })
      });
    }
    const earnings = months.map(m => {
      const sum = currentStudents.reduce((total, s) => {
        const count = lessons.filter(l => l.student_id === s.id && l.status === 'done' && l.lesson_date.startsWith(m.prefix)).length;
        return total + count * Number(s.price_per_lesson);
      }, 0);
      return { ...m, sum };
    });
    const maxEarn = Math.max(...earnings.map(e => e.sum), 1);
    $('#earningsChart').innerHTML = earnings.map(e => `
      <div class="bar-chart__col">
        <span class="bar-chart__value">${e.sum ? fmtMoney(e.sum) : ''}</span>
        <div class="bar-chart__bar" style="height:${Math.max((e.sum / maxEarn) * 100, 2)}%"></div>
        <span class="bar-chart__label">${e.label}</span>
      </div>
    `).join('');

    const cancelRows = currentStudents.map(s => {
      const sLessons = lessons.filter(l => l.student_id === s.id);
      const total = sLessons.length;
      const bad = sLessons.filter(l => l.status === 'cancelled' || l.status === 'rescheduled').length;
      return { name: s.name, pct: total ? Math.round((bad / total) * 100) : 0, total };
    }).filter(r => r.total > 0).sort((a, b) => b.pct - a.pct);

    $('#cancelChartEmpty').hidden = cancelRows.length > 0;
    $('#cancelChart').innerHTML = cancelRows.map(r => `
      <div class="hbar-row">
        <span class="hbar-row__name">${escapeHtml(r.name)}</span>
        <div class="hbar-row__track"><div class="hbar-row__fill" style="width:${r.pct}%"></div></div>
        <span class="hbar-row__pct">${r.pct}%</span>
      </div>
    `).join('');
  }

  /* ---------------- Modal helper ---------------- */
  const modal = $('#modal');
  function openModal(title, formHtml, onSubmit) {
    $('#modalTitle').textContent = title;
    const form = $('#modalForm');
    form.innerHTML = formHtml;
    modal.classList.add('is-open');
    form.onsubmit = (e) => { e.preventDefault(); onSubmit(form); };
    setTimeout(() => form.querySelector('input, select')?.focus(), 50);
  }
  function closeModal() { modal.classList.remove('is-open'); }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ---------------- Go ---------------- */
  checkSession();
})();
