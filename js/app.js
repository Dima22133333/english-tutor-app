(() => {
  'use strict';

  if (!SUPABASE_URL || SUPABASE_URL.includes('ВСТАВЬ_СЮДА') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('ВСТАВЬ_СЮДА')) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#F5F7FA;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">⚙️</div>
          <h2 style="margin:0 0 10px;">Приложение почти готово</h2>
          <p style="color:#555;line-height:1.6;">Осталось вставить данные своего проекта Supabase в файл <code>js/config.js</code> — Project URL и anon key (Settings → API в панели Supabase).</p>
        </div>
      </div>`;
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#F5F7FA;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">📡</div>
          <h2 style="margin:0 0 10px;">Не загрузилась библиотека Supabase</h2>
          <p style="color:#555;line-height:1.6;">Проверь интернет-соединение и обнови страницу (потяни вниз на телефоне или нажми ⌘R на компьютере). Если не поможет — сообщи об этом в чате.</p>
        </div>
      </div>`;
    return;
  }

  let sb;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;text-align:center;background:#F5F7FA;">
        <div style="max-width:440px;background:#fff;border-radius:20px;padding:36px;box-shadow:0 8px 24px rgba(0,0,0,.08);">
          <div style="font-size:36px;margin-bottom:10px;">⚠️</div>
          <h2 style="margin:0 0 10px;">Ошибка подключения к базе данных</h2>
          <p style="color:#555;line-height:1.6;">${escapeHtml(e.message)}</p>
        </div>
      </div>`;
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const fmtMoney = (n) => `${Number(n || 0).toLocaleString('ru-RU')} ₴`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const STATUS_LABEL = { planned: 'Запланирован', done: 'Проведён', cancelled: 'Отменён' };

  let currentStudents = [];
  let currentStudentId = null;
  let currentLessons = [];
  let currentPayments = [];

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
    if (data.session) {
      showApp();
    } else {
      showAuth();
    }
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
    $('#loginBtn').textContent = 'Входим…';
    let error;
    try {
      ({ error } = await sb.auth.signInWithPassword({ email, password }));
    } catch (e2) {
      $('#loginBtn').textContent = 'Войти';
      errEl.textContent = 'Ошибка сети: ' + e2.message + '. Проверь интернет и попробуй ещё раз.';
      return;
    }
    $('#loginBtn').textContent = 'Войти';
    if (error) { errEl.textContent = 'Не удалось войти: ' + translateAuthError(error.message); return; }
    showApp();
  });

  $('#signupBtn').addEventListener('click', async () => {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const errEl = $('#authError');
    errEl.textContent = '';
    if (!email || password.length < 6) { errEl.textContent = 'Введи email и пароль от 6 символов'; return; }
    $('#signupBtn').textContent = 'Создаём…';
    const { error } = await sb.auth.signUp({ email, password });
    $('#signupBtn').textContent = 'Создать аккаунт (первый раз)';
    if (error) { errEl.textContent = 'Не удалось создать аккаунт: ' + translateAuthError(error.message); return; }
    toast('Аккаунт создан! Теперь нажми «Войти»');
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    showAuth();
  });

  function translateAuthError(msg) {
    if (/invalid login credentials/i.test(msg)) return 'неверный email или пароль';
    if (/email not confirmed/i.test(msg)) return 'нужно подтвердить email (см. письмо), либо отключи подтверждение в настройках Supabase';
    if (/already registered/i.test(msg)) return 'такой аккаунт уже есть, просто войди';
    return msg;
  }

  /* ---------------- Students: list ---------------- */
  async function loadStudents() {
    const [studentsRes, lessonsRes, paymentsRes] = await Promise.all([
      sb.from('students').select('*').order('created_at', { ascending: true }),
      sb.from('lessons').select('student_id,status'),
      sb.from('payments').select('student_id,amount')
    ]);
    const { data: students, error } = studentsRes;
    if (error) { toast('Ошибка загрузки учеников', true); return; }
    const { data: lessons } = lessonsRes;
    const { data: payments } = paymentsRes;

    currentStudents = (students || []).map(s => {
      const doneCount = (lessons || []).filter(l => l.student_id === s.id && l.status === 'done').length;
      const paid = (payments || []).filter(p => p.student_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0);
      const owed = doneCount * Number(s.price_per_lesson) - paid;
      return { ...s, doneCount, paid, owed };
    });

    renderStudentList();
  }

  function renderStudentList() {
    const grid = $('#studentsGrid');
    grid.innerHTML = '';
    $('#emptyState').hidden = currentStudents.length > 0;

    const totalOwed = currentStudents.reduce((s, st) => s + Math.max(st.owed, 0), 0);
    const totalPaid = currentStudents.reduce((s, st) => s + st.paid, 0);
    $('#totalsRow').innerHTML = `
      <span class="chip">Учеников: <b>${currentStudents.length}</b></span>
      <span class="chip">Собрано: <b>${fmtMoney(totalPaid)}</b></span>
      <span class="chip ${totalOwed > 0 ? 'warn' : ''}">Должны: <b>${fmtMoney(totalOwed)}</b></span>
    `;

    currentStudents.forEach(s => {
      const card = el('div', 'student-card');
      const balCls = s.owed > 0 ? 'due' : 'ok';
      const balText = s.owed > 0 ? `Должен ${fmtMoney(s.owed)}` : (s.owed < 0 ? `Переплата ${fmtMoney(-s.owed)}` : 'Оплачено');
      card.innerHTML = `
        <div class="student-card__name">${escapeHtml(s.name)}</div>
        <span class="student-card__phone">${escapeHtml(s.phone || 'без телефона')}</span>
        <span class="student-card__balance ${balCls}">${balText}</span>
      `;
      card.addEventListener('click', () => openStudent(s.id));
      grid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  /* ---------------- Add / edit / delete student ---------------- */
  $('#addStudentBtn').addEventListener('click', () => openStudentForm());
  $('#editStudentBtn').addEventListener('click', () => {
    const s = currentStudents.find(x => x.id === currentStudentId);
    openStudentForm(s);
  });

  function openStudentForm(student) {
    openModal(student ? 'Изменить ученика' : 'Новый ученик', `
      <div class="field"><label>Имя</label><input type="text" id="fName" required value="${student ? escapeHtml(student.name) : ''}" placeholder="Например, Оля Петренко"></div>
      <div class="field"><label>Телефон (необязательно)</label><input type="tel" id="fPhone" value="${student ? escapeHtml(student.phone || '') : ''}" placeholder="+380 __ ___ __ __"></div>
      <div class="field"><label>Цена одного урока, ₴</label><input type="number" id="fPrice" required min="0" step="1" value="${student ? student.price_per_lesson : ''}" placeholder="300"></div>
      <button type="submit" class="btn btn-primary btn-block">${student ? 'Сохранить' : 'Добавить'}</button>
    `, async (form) => {
      const name = form.querySelector('#fName').value.trim();
      const phone = form.querySelector('#fPhone').value.trim();
      const price = Number(form.querySelector('#fPrice').value);
      if (!name || !(price >= 0)) return;

      if (student) {
        const { error } = await sb.from('students').update({ name, phone, price_per_lesson: price }).eq('id', student.id);
        if (error) return toast('Не удалось сохранить', true);
        toast('Сохранено');
      } else {
        const { error } = await sb.from('students').insert({ name, phone, price_per_lesson: price, user_id: (await sb.auth.getUser()).data.user.id });
        if (error) return toast('Не удалось добавить', true);
        toast('Ученик добавлен');
      }
      closeModal();
      await loadStudents();
      if (student) await openStudent(student.id);
    });
  }

  $('#deleteStudentBtn').addEventListener('click', async () => {
    const s = currentStudents.find(x => x.id === currentStudentId);
    if (!s) return;
    if (!confirm(`Удалить ученика «${s.name}» вместе со всеми уроками и оплатами? Это необратимо.`)) return;
    const { error } = await sb.from('students').delete().eq('id', s.id);
    if (error) return toast('Не удалось удалить', true);
    toast('Ученик удалён');
    goToList();
    await loadStudents();
  });

  /* ---------------- Student detail ---------------- */
  async function openStudent(id) {
    currentStudentId = id;
    $('#listView').hidden = true;
    $('#studentView').hidden = false;

    const s = currentStudents.find(x => x.id === id);
    $('#studentName').textContent = s.name;
    $('#studentPhone').textContent = s.phone || '';

    const [{ data: lessons }, { data: payments }] = await Promise.all([
      sb.from('lessons').select('*').eq('student_id', id).order('lesson_date', { ascending: false }),
      sb.from('payments').select('*').eq('student_id', id).order('payment_date', { ascending: false })
    ]);
    currentLessons = lessons || [];
    currentPayments = payments || [];
    renderStudentDetail(s);
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
          <span class="list-row__date">${fmtDate(l.lesson_date)}</span>
        </div>
        <div class="list-row__right">
          <button class="status-badge ${l.status}" data-toggle="${l.id}">${STATUS_LABEL[l.status]}</button>
          <button class="row-del" data-del-lesson="${l.id}" title="Удалить">✕</button>
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
          <button class="row-del" data-del-payment="${p.id}" title="Удалить">✕</button>
        </div>`;
      paymentsList.appendChild(row);
    });
  }

  $('#backBtn').addEventListener('click', goToList);
  function goToList() {
    $('#studentView').hidden = true;
    $('#listView').hidden = false;
    currentStudentId = null;
  }

  const STATUS_CYCLE = { planned: 'done', done: 'cancelled', cancelled: 'planned' };

  $('#lessonsList').addEventListener('click', async (e) => {
    const toggleId = e.target.getAttribute('data-toggle');
    const delId = e.target.getAttribute('data-del-lesson');
    if (toggleId) {
      const lesson = currentLessons.find(l => l.id === toggleId);
      const next = STATUS_CYCLE[lesson.status];
      const { error } = await sb.from('lessons').update({ status: next }).eq('id', toggleId);
      if (error) return toast('Не удалось изменить статус', true);
      lesson.status = next;
      const s = currentStudents.find(x => x.id === currentStudentId);
      renderStudentDetail(s);
      loadStudents();
    }
    if (delId) {
      if (!confirm('Удалить этот урок?')) return;
      const { error } = await sb.from('lessons').delete().eq('id', delId);
      if (error) return toast('Не удалось удалить', true);
      currentLessons = currentLessons.filter(l => l.id !== delId);
      const s = currentStudents.find(x => x.id === currentStudentId);
      renderStudentDetail(s);
      loadStudents();
    }
  });

  $('#paymentsList').addEventListener('click', async (e) => {
    const delId = e.target.getAttribute('data-del-payment');
    if (!delId) return;
    if (!confirm('Удалить эту оплату?')) return;
    const { error } = await sb.from('payments').delete().eq('id', delId);
    if (error) return toast('Не удалось удалить', true);
    currentPayments = currentPayments.filter(p => p.id !== delId);
    const s = currentStudents.find(x => x.id === currentStudentId);
    renderStudentDetail(s);
    loadStudents();
  });

  /* ---------------- Add lesson / payment ---------------- */
  $('#addLessonBtn').addEventListener('click', () => {
    openModal('Новый урок', `
      <div class="field"><label>Дата</label><input type="date" id="fDate" required value="${todayISO()}"></div>
      <div class="field"><label>Статус</label>
        <select id="fStatus">
          <option value="done">Проведён</option>
          <option value="planned">Запланирован</option>
          <option value="cancelled">Отменён</option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Добавить</button>
    `, async (form) => {
      const lesson_date = form.querySelector('#fDate').value;
      const status = form.querySelector('#fStatus').value;
      const { error } = await sb.from('lessons').insert({
        student_id: currentStudentId, lesson_date, status,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не удалось добавить урок', true);
      closeModal();
      toast('Урок добавлен');
      await openStudent(currentStudentId);
      await loadStudents();
    });
  });

  $('#addPaymentBtn').addEventListener('click', () => {
    openModal('Новая оплата', `
      <div class="field"><label>Дата</label><input type="date" id="fDate" required value="${todayISO()}"></div>
      <div class="field"><label>Сумма, ₴</label><input type="number" id="fAmount" required min="0" step="1" placeholder="1200"></div>
      <div class="field"><label>Комментарий (необязательно)</label><input type="text" id="fComment" placeholder="Например, за 4 урока"></div>
      <button type="submit" class="btn btn-primary btn-block">Добавить</button>
    `, async (form) => {
      const payment_date = form.querySelector('#fDate').value;
      const amount = Number(form.querySelector('#fAmount').value);
      const comment = form.querySelector('#fComment').value.trim();
      if (!(amount > 0)) return;
      const { error } = await sb.from('payments').insert({
        student_id: currentStudentId, payment_date, amount, comment,
        user_id: (await sb.auth.getUser()).data.user.id
      });
      if (error) return toast('Не удалось добавить оплату', true);
      closeModal();
      toast('Оплата добавлена');
      await openStudent(currentStudentId);
      await loadStudents();
    });
  });

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
