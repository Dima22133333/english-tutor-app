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

  const STATUS_LABEL = { done: 'Проведено', cancelled: 'Скасовано', rescheduled: 'Перенесено' };
  const STATUS_CYCLE = { done: 'cancelled', cancelled: 'rescheduled', rescheduled: 'done' };

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

  $('#signupBtn').addEventListener('click', async () => {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const errEl = $('#authError');
    errEl.textContent = '';
    if (!email || password.length < 6) { errEl.textContent = 'Введи email і пароль від 6 символів'; return; }
    $('#signupBtn').textContent = 'Створюємо…';
    const { error } = await sb.auth.signUp({ email, password });
    $('#signupBtn').textContent = 'Створити акаунт (перший раз)';
    if (error) { errEl.textContent = 'Не вдалося створити акаунт: ' + translateAuthError(error.message); return; }
    toast('Акаунт створено! Тепер натисни «Увійти»');
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    showAuth();
  });

  function translateAuthError(msg) {
    if (/invalid login credentials/i.test(msg)) return 'невірний email або пароль';
    if (/email not confirmed/i.test(msg)) return 'потрібно підтвердити email (див. лист), або вимкни підтвердження в налаштуваннях Supabase';
    if (/already registered/i.test(msg)) return 'такий акаунт вже є, просто увійди';
    return msg;
  }

  /* ---------------- Nav tabs ---------------- */
  $('#navStudents').addEventListener('click', () => switchTab('students'));
  $('#navSchedule').addEventListener('click', () => switchTab('schedule'));

  function switchTab(tab) {
    $('#navStudents').classList.toggle('is-active', tab === 'students');
    $('#navSchedule').classList.toggle('is-active', tab === 'schedule');
    $('#listView').hidden = tab !== 'students';
    $('#scheduleView').hidden = tab !== 'schedule';
    $('#studentView').hidden = true;
    if (tab === 'schedule') renderSchedule();
  }

  /* ---------------- Students & groups: list ---------------- */
  async function loadStudents() {
    const [studentsRes, lessonsRes, paymentsRes, membersRes] = await Promise.all([
      sb.from('students').select('*').order('created_at', { ascending: true }),
      sb.from('lessons').select('id,student_id,status,lesson_date,lesson_time'),
      sb.from('payments').select('student_id,amount'),
      sb.from('group_members').select('group_id,student_id')
    ]);
    if (studentsRes.error) { toast('Помилка завантаження учнів', true); return; }

    const students = studentsRes.data || [];
    const lessons = lessonsRes.data || [];
    const payments = paymentsRes.data || [];
    currentGroupMembers = membersRes.data || [];
    window.__allLessons = lessons;

    currentStudents = students.map(s => {
      const doneCount = lessons.filter(l => l.student_id === s.id && l.status === 'done').length;
      const paid = payments.filter(p => p.student_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0);
      const owed = doneCount * Number(s.price_per_lesson) - paid;
      return { ...s, doneCount, paid, owed };
    });

    renderStudentList(lessons);
  }

  function renderStudentList(lessons) {
    const grid = $('#studentsGrid');
    grid.innerHTML = '';
    $('#emptyState').hidden = currentStudents.length > 0;

    const totalOwed = currentStudents.reduce((s, st) => s + Math.max(st.owed, 0), 0);
    const totalPaid = currentStudents.reduce((s, st) => s + st.paid, 0);

    const monthPrefix = todayISO().slice(0, 7);
    const monthEarnings = currentStudents.reduce((sum, s) => {
      const doneThisMonth = (lessons || []).filter(l => l.student_id === s.id && l.status === 'done' && l.lesson_date.startsWith(monthPrefix)).length;
      return sum + doneThisMonth * Number(s.price_per_lesson);
    }, 0);

    $('#totalsRow').innerHTML = `
      <span class="chip">Учнів/груп: <b>${currentStudents.length}</b></span>
      <span class="chip">Зібрано: <b>${fmtMoney(totalPaid)}</b></span>
      <span class="chip ${totalOwed > 0 ? 'warn' : ''}">Повинні: <b>${fmtMoney(totalOwed)}</b></span>
      <span class="chip">Заробіток за місяць: <b>${fmtMoney(monthEarnings)}</b></span>
    `;

    currentStudents.forEach(s => {
      const card = el('div', 'student-card');
      const balCls = s.owed > 0 ? 'due' : 'ok';
      const balText = s.owed > 0 ? `Винні ${fmtMoney(s.owed)}` : (s.owed < 0 ? `Переплата ${fmtMoney(-s.owed)}` : 'Оплачено');
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

  function openStudentForm(student) {
    openModal(student ? 'Змінити учня' : 'Новий учень', `
      <div class="field"><label>Ім'я</label><input type="text" id="fName" required value="${student ? escapeHtml(student.name) : ''}" placeholder="Наприклад, Оля Петренко"></div>
      <div class="field"><label>Телефон (необов'язково)</label><input type="tel" id="fPhone" value="${student ? escapeHtml(student.phone || '') : ''}" placeholder="+380 __ ___ __ __"></div>
      <div class="field"><label>Ціна одного уроку, ₴</label><input type="number" id="fPrice" required min="0" step="1" value="${student ? student.price_per_lesson : ''}" placeholder="300"></div>
      <button type="submit" class="btn btn-primary btn-block">${student ? 'Зберегти' : 'Додати'}</button>
    `, async (form) => {
      const name = form.querySelector('#fName').value.trim();
      const phone = form.querySelector('#fPhone').value.trim();
      const price = Number(form.querySelector('#fPrice').value);
      if (!name || !(price >= 0)) return;

      if (student) {
        const { error } = await sb.from('students').update({ name, phone, price_per_lesson: price }).eq('id', student.id);
        if (error) return toast('Не вдалося зберегти', true);
        toast('Збережено');
      } else {
        const { error } = await sb.from('students').insert({ name, phone, price_per_lesson: price, is_group: false, user_id: (await sb.auth.getUser()).data.user.id });
        if (error) return toast('Не вдалося додати', true);
        toast('Учня додано');
      }
      closeModal();
      await loadStudents();
      if (student) await openStudent(student.id);
    });
  }

  function openGroupForm(group) {
    const individuals = currentStudents.filter(s => !s.is_group);
    const memberIds = group ? currentGroupMembers.filter(m => m.group_id === group.id).map(m => m.student_id) : [];
    const checklistHtml = individuals.length
      ? individuals.map(s => `<label><input type="checkbox" value="${s.id}" ${memberIds.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`).join('')
      : '<span class="empty">Спершу додай окремих учнів, щоб включити їх у групу</span>';

    openModal(group ? 'Змінити групу' : 'Нова група', `
      <div class="field"><label>Назва групи</label><input type="text" id="fName" required value="${group ? escapeHtml(group.name) : ''}" placeholder="Наприклад, Група А2 (вівторок)"></div>
      <div class="field"><label>Ціна групового заняття, ₴</label><input type="number" id="fPrice" required min="0" step="1" value="${group ? group.price_per_lesson : ''}" placeholder="600"></div>
      <div class="field"><label>Учасники групи</label><div class="member-checklist" id="fMembers">${checklistHtml}</div></div>
      <button type="submit" class="btn btn-primary btn-block">${group ? 'Зберегти' : 'Створити групу'}</button>
    `, async (form) => {
      const name = form.querySelector('#fName').value.trim();
      const price = Number(form.querySelector('#fPrice').value);
      const memberIdsNew = [...form.querySelectorAll('#fMembers input:checked')].map(i => i.value);
      if (!name || !(price >= 0)) return;

      const userId = (await sb.auth.getUser()).data.user.id;
      let groupId = group?.id;

      if (group) {
        const { error } = await sb.from('students').update({ name, price_per_lesson: price }).eq('id', group.id);
        if (error) return toast('Не вдалося зберегти', true);
        await sb.from('group_members').delete().eq('group_id', group.id);
      } else {
        const { data, error } = await sb.from('students').insert({ name, price_per_lesson: price, is_group: true, user_id: userId }).select().single();
        if (error) return toast('Не вдалося створити групу', true);
        groupId = data.id;
      }

      if (memberIdsNew.length) {
        const rows = memberIdsNew.map(sid => ({ group_id: groupId, student_id: sid, user_id: userId }));
        await sb.from('group_members').insert(rows);
      }

      toast(group ? 'Групу оновлено' : 'Групу створено');
      closeModal();
      await loadStudents();
      if (group) await openStudent(group.id);
    });
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

  /* ---------------- Student/group detail ---------------- */
  async function openStudent(id) {
    currentStudentId = id;
    switchTabInternal();
    $('#listView').hidden = true;
    $('#scheduleView').hidden = true;
    $('#studentView').hidden = false;

    const s = currentStudents.find(x => x.id === id);
    $('#studentName').textContent = s.name;
    $('#balPriceLabel').textContent = s.is_group ? 'Ціна заняття' : 'Ціна уроку';

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
  }

  function renderStudentDetail(s) {
    const doneCount = currentLessons.filter(l => l.status === 'done').length;
    const paid = currentPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const owed = doneCount * Number(s.price_per_lesson) - paid;

    $('#balLessons').textContent = doneCount;
    $('#balPrice').textContent = fmtMoney(s.price_per_lesson);
    $('#balPaid').textContent = fmtMoney(paid);
    const balDue = $('#balDue');
    balDue.textContent = owed > 0 ? fmtMoney(owed) : (owed < 0 ? `+${fmtMoney(-owed)}` : '0 ₴');
    balDue.closest('.balance-item').classList.toggle('is-due', owed > 0);

    const lessonsList = $('#lessonsList');
    lessonsList.innerHTML = '';
    $('#lessonsEmpty').hidden = currentLessons.length > 0;
    currentLessons.forEach(l => {
      const row = el('li', 'list-row');
      row.innerHTML = `
        <div class="list-row__main">
          <span class="list-row__date">${fmtDate(l.lesson_date)}${l.lesson_time ? ' · ' + l.lesson_time.slice(0, 5) : ''}</span>
        </div>
        <div class="list-row__right">
          <button class="status-badge ${l.status}" data-toggle="${l.id}">${STATUS_LABEL[l.status]}</button>
          <button class="row-del" data-del-lesson="${l.id}" title="Видалити">✕</button>
        </div>`;
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

  $('#lessonsList').addEventListener('click', async (e) => {
    const toggleId = e.target.getAttribute('data-toggle');
    const delId = e.target.getAttribute('data-del-lesson');
    if (toggleId) {
      const lesson = currentLessons.find(l => l.id === toggleId);
      const next = STATUS_CYCLE[lesson.status];
      const { error } = await sb.from('lessons').update({ status: next }).eq('id', toggleId);
      if (error) return toast('Не вдалося змінити статус', true);
      lesson.status = next;
      renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
      loadStudents();
    }
    if (delId) {
      if (!confirm('Видалити цей урок?')) return;
      const { error } = await sb.from('lessons').delete().eq('id', delId);
      if (error) return toast('Не вдалося видалити', true);
      currentLessons = currentLessons.filter(l => l.id !== delId);
      renderStudentDetail(currentStudents.find(x => x.id === currentStudentId));
      loadStudents();
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
      <div class="field"><label>Статус</label>
        <select id="fStatus">
          <option value="done">Проведено</option>
          <option value="rescheduled">Перенесено</option>
          <option value="cancelled">Скасовано</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Додати</button>
    `, async (form) => {
      const lesson_date = form.querySelector('#fDate').value;
      const lesson_time = form.querySelector('#fTime').value || null;
      const status = form.querySelector('#fStatus').value;
      const { error } = await sb.from('lessons').insert({
        student_id: currentStudentId, lesson_date, lesson_time, status,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не вдалося додати урок', true);
      closeModal();
      toast('Урок додано');
      await openStudent(currentStudentId);
      await loadStudents();
    });
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

  function renderSchedule() {
    const iso = toISODate(scheduleDate);
    const isToday = iso === todayISO();
    $('#schedDateLabel').textContent = isToday ? 'Сьогодні' : fmtDateLong(scheduleDate);
    $('#schedDateSub').textContent = isToday ? fmtDateLong(scheduleDate) : '';

    const lessons = (window.__allLessons || []).filter(l => l.lesson_date === iso);
    lessons.sort((a, b) => (a.lesson_time || '99:99').localeCompare(b.lesson_time || '99:99'));

    const list = $('#scheduleList');
    list.innerHTML = '';
    $('#scheduleEmpty').hidden = lessons.length > 0;

    lessons.forEach(l => {
      const s = currentStudents.find(x => x.id === l.student_id);
      if (!s) return;
      const row = el('li', 'list-row');
      row.innerHTML = `
        <div class="list-row__main">
          <span class="list-row__name">${escapeHtml(s.name)}${s.is_group ? ' <span class="group-badge">Група</span>' : ''}</span>
          ${l.lesson_time ? `<span class="list-row__time">${l.lesson_time.slice(0, 5)}</span>` : ''}
        </div>
        <div class="list-row__right">
          <span class="status-badge ${l.status}">${STATUS_LABEL[l.status]}</span>
        </div>`;
      row.addEventListener('click', () => openStudent(s.id));
      list.appendChild(row);
    });
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
