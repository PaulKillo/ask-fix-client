// Мини-приложение «Закрепление клиента» для агентов партнёров АСК Групп.

const CONFIG = window.APP_CONFIG;
const WebApp = window.WebApp;
const inMax = Boolean(WebApp && WebApp.initData);

const form = document.getElementById('form');
const $ = (id) => document.getElementById(id);
const field = (name) => form.elements[name];

const AGENT_KEY = 'ask_agent';
const OTHER = '__other__';

// ---------- Утилиты ----------

function haptic(kind) {
  try {
    if (kind === 'light') WebApp?.HapticFeedback?.impactOccurred('light');
    else WebApp?.HapticFeedback?.notificationOccurred(kind);
  } catch (_) {}
}

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

// Приводит номер к виду +7 900 000-00-00 по мере ввода
function formatPhone(raw) {
  let d = digitsOf(raw);
  if (!d) return '';
  if (d[0] === '8') d = `7${d.slice(1)}`;
  if (d[0] !== '7') d = `7${d}`;
  d = d.slice(0, 11);
  const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
  let out = '+7';
  if (p[0]) out += ` ${p[0]}`;
  if (p[1]) out += ` ${p[1]}`;
  if (p[2]) out += `-${p[2]}`;
  if (p[3]) out += `-${p[3]}`;
  return out;
}
const phoneValid = (s) => digitsOf(formatPhone(s)).length === 11;

const formatMoney = (raw) => {
  const d = digitsOf(raw).replace(/^0+/, '').slice(0, 12);
  return d ? Number(d).toLocaleString('ru-RU') : '';
};

const radioValue = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;

// ---------- Данные агента (запоминаем на устройстве) ----------

function loadAgent() {
  try { return JSON.parse(localStorage.getItem(AGENT_KEY)) || null; } catch (_) { return null; }
}

function saveAgent(agent) {
  try { localStorage.setItem(AGENT_KEY, JSON.stringify(agent)); } catch (_) {}
}

function readAgent() {
  const listed = field('agency').value !== OTHER;
  return {
    name: field('agentName').value.trim(),
    phone: formatPhone(field('agentPhone').value),
    agency: listed ? field('agency').value : field('agencyOther').value.trim(),
    agencyListed: listed,
  };
}

function fillAgent(agent) {
  field('agentName').value = agent.name || '';
  field('agentPhone').value = agent.phone || '';
  if (agent.agencyListed && CONFIG.agencies.includes(agent.agency)) {
    field('agency').value = agent.agency;
  } else if (agent.agency) {
    field('agency').value = OTHER;
    field('agencyOther').value = agent.agency;
  }
  syncAgencyOther();
}

function showAgentSummary(agent) {
  const box = $('agentSummary');
  box.replaceChildren();
  const name = document.createElement('b');
  name.textContent = agent.name;
  box.append(name, `${agent.agency} · ${agent.phone}`);
  box.hidden = false;
  $('agentFields').hidden = true;
  $('agentEdit').hidden = false;
}

function showAgentFields() {
  $('agentSummary').hidden = true;
  $('agentFields').hidden = false;
  $('agentEdit').hidden = true;
}

function syncAgencyOther() {
  $('agencyOtherField').hidden = field('agency').value !== OTHER;
}

// ---------- Проверка формы ----------

function validate() {
  const bad = [];
  const mark = (el, ok) => { el.classList.toggle('invalid', !ok); if (!ok) bad.push(el); };

  const agentVisible = !$('agentFields').hidden;
  const agent = readAgent();
  const agentOk = agent.name && phoneValid(agent.phone) && agent.agency;
  if (agentVisible || !agentOk) {
    if (!agentVisible) showAgentFields();
    mark(field('agentName'), Boolean(agent.name));
    mark(field('agentPhone'), phoneValid(agent.phone));
    mark(field('agency'), Boolean(field('agency').value));
    if (field('agency').value === OTHER) mark(field('agencyOther'), Boolean(agent.agency));
  }

  mark(field('clientName'), Boolean(field('clientName').value.trim()));
  mark(field('clientPhone'), phoneValid(field('clientPhone').value));
  for (const name of ['hasLand', 'hasDownPayment', 'temperature', 'houseType']) {
    mark(form.querySelector(`[data-name="${name}"]`), Boolean(radioValue(name)));
  }
  mark(field('budget'), Number(digitsOf(field('budget').value)) > 0);
  mark(form.querySelector('[data-name="consent"]'), field('consent').checked);

  return bad;
}

function showError(text) {
  const box = $('formError');
  box.textContent = text;
  box.hidden = !text;
}

// ---------- Отправка ----------

async function submit(event) {
  event.preventDefault();
  showError('');

  const bad = validate();
  if (bad.length) {
    showError('Заполните отмеченные поля.');
    bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    haptic('error');
    return;
  }

  if (!inMax) {
    showError('Отправка работает только внутри MAX. Откройте приложение из бота.');
    return;
  }

  const agent = readAgent();
  const payload = {
    initData: WebApp.initData,
    agent,
    client: {
      name: field('clientName').value.trim(),
      phone: formatPhone(field('clientPhone').value),
      hasLand: radioValue('hasLand') === 'true',
      hasDownPayment: radioValue('hasDownPayment') === 'true',
      temperature: radioValue('temperature'),
      houseType: radioValue('houseType'),
      budget: Number(digitsOf(field('budget').value)),
      district: field('district').value.trim(),
      consent: field('consent').checked,
    },
  };

  const button = $('submit');
  button.disabled = true;
  button.textContent = 'Отправляем…';

  try {
    const res = await fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);

    saveAgent(agent);
    haptic('success');
    try { WebApp.disableClosingConfirmation(); } catch (_) {}
    form.hidden = true;
    $('done').hidden = false;
    window.scrollTo(0, 0);
  } catch (e) {
    const offline = e instanceof TypeError;
    showError(offline ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : e.message);
    haptic('error');
  } finally {
    button.disabled = false;
    button.textContent = 'Отправить на закрепление';
  }
}

function resetClient() {
  for (const name of ['clientName', 'clientPhone', 'budget', 'district']) field(name).value = '';
  form.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
  field('consent').checked = false;
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  showError('');

  const agent = loadAgent();
  if (agent) showAgentSummary(agent);

  $('done').hidden = true;
  form.hidden = false;
  window.scrollTo(0, 0);
}

// ---------- Инициализация ----------

function init() {
  $('fixDays').textContent = CONFIG.fixDays;
  if (!inMax) $('notInMax').hidden = false;

  const select = field('agency');
  for (const name of CONFIG.agencies) select.add(new Option(name, name));
  select.add(new Option('Другое агентство', OTHER));
  select.addEventListener('change', syncAgencyOther);

  const saved = loadAgent();
  if (saved) {
    fillAgent(saved);
    showAgentSummary(saved);
  } else if (inMax) {
    // Подставим имя из профиля MAX как подсказку
    const u = WebApp.initDataUnsafe?.user;
    const name = [u?.last_name, u?.first_name].filter(Boolean).join(' ');
    if (name) field('agentName').value = name;
  }

  $('agentEdit').addEventListener('click', showAgentFields);

  for (const name of ['agentPhone', 'clientPhone']) {
    field(name).addEventListener('input', (e) => { e.target.value = formatPhone(e.target.value); });
  }
  field('budget').addEventListener('input', (e) => { e.target.value = formatMoney(e.target.value); });

  // Снимаем красную рамку, как только поле исправлено
  form.addEventListener('input', (e) => {
    e.target.classList.remove('invalid');
    e.target.closest('.invalid')?.classList.remove('invalid');
  });
  form.addEventListener('change', (e) => {
    e.target.closest('.invalid')?.classList.remove('invalid');
    if (e.target.type === 'radio') haptic('light');
  });

  // Предупредить при закрытии, если агент начал заполнять анкету
  form.addEventListener('input', () => {
    try { WebApp?.enableClosingConfirmation(); } catch (_) {}
  });

  form.addEventListener('submit', submit);
  $('again').addEventListener('click', resetClient);

  WebApp?.ready?.();
}

init();
