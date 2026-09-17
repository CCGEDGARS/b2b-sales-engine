const KNOWN_EMPLOYEE_IDS = new Map([
  ['Anna Ozola', 'anna'],
  ['Mārtiņš Kalniņš', 'martins'],
  ['Laura Bērziņa', 'laura']
]);

function text(value) {
  return String(value ?? '').trim();
}

function slugifyEmployeeName(name) {
  return text(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('lv')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'employee';
}

function employeeIdForName(name) {
  return KNOWN_EMPLOYEE_IDS.get(name) || `user-${slugifyEmployeeName(name)}`;
}

export function protectEmployeeLoginButtons(root = document) {
  const buttons = root.querySelectorAll?.('#userList [data-login-user]') || [];
  buttons.forEach(button => {
    const name = text(button.dataset.loginUser || button.textContent);
    if (!name) return;
    button.classList.add('main-entry-employee');
    if (!text(button.dataset.id)) button.dataset.id = employeeIdForName(name);
    button.dataset.pinProtected = 'true';
  });
  return buttons.length;
}

function boot() {
  protectEmployeeLoginButtons();
  const userList = document.getElementById('userList');
  if (userList) {
    new MutationObserver(() => protectEmployeeLoginButtons(userList)).observe(userList, { childList: true, subtree: true });
  }
  new MutationObserver(mutations => {
    if (mutations.some(mutation => [...mutation.addedNodes].some(node =>
      node.nodeType === 1 && (node.id === 'userList' || node.querySelector?.('#userList'))
    ))) protectEmployeeLoginButtons();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
