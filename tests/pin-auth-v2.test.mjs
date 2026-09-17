import fs from 'node:fs';
import assert from 'node:assert/strict';
import { protectEmployeeLoginButtons } from '../public/pin-userlist-guard.mjs';

function makeButton(name) {
  const classes = new Set();
  return {
    dataset: { loginUser: name },
    textContent: name,
    classList: { add: value => classes.add(value), contains: value => classes.has(value) },
    classes
  };
}

const anna = makeButton('Anna Ozola');
const newEmployee = makeButton('Jānis Āboliņš');
const root = {
  querySelectorAll(selector) {
    assert.equal(selector, '#userList [data-login-user]');
    return [anna, newEmployee];
  }
};

assert.equal(protectEmployeeLoginButtons(root), 2);
assert.equal(anna.dataset.id, 'anna');
assert.equal(newEmployee.dataset.id, 'user-janis-abolins');
assert.equal(anna.classList.contains('main-entry-employee'), true);
assert.equal(newEmployee.classList.contains('main-entry-employee'), true);
assert.equal(newEmployee.dataset.pinProtected, 'true');

const pinAuth = fs.readFileSync(new URL('../pin-auth.js', import.meta.url), 'utf8');
const pinApi = fs.readFileSync(new URL('../server/pin-auth-handler.js', import.meta.url), 'utf8');
const statusApi = fs.readFileSync(new URL('../api/status.js', import.meta.url), 'utf8');
const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');
const vite = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

assert.match(pinAuth, /\/api\/pin-auth/);
assert.match(pinAuth, /\[data-login-user\]/);
assert.match(pinAuth, /credentials:\s*'same-origin'/);
assert.doesNotMatch(pinAuth, /einsteins_employee_pins/);
assert.doesNotMatch(pinAuth, /crypto\.subtle/);
assert.doesNotMatch(pinAuth, /SHA-256/);
assert.match(pinAuth, /#startManager/);
assert.match(pinAuth, /syncUser/);
assert.match(pinAuth, /DEFAULT_PIN='0000'/);
assert.match(pinAuth, /PIN_DIGITS=4/);
assert.match(pinAuth, /PIN jābūt tieši 4 cipariem/);
assert.match(pinAuth, /Noklusējuma PIN visiem jaunajiem lietotājiem/);
assert.match(pinAuth, /Pašreizējais PIN/);
assert.match(pinAuth, /Pielāgots PIN/);
assert.match(pinAuth, /adminUsers/);

assert.match(pinApi, /scryptSync/);
assert.match(pinApi, /timingSafeEqual/);
assert.match(pinApi, /MAX_ATTEMPTS = 5/);
assert.match(pinApi, /LOCK_SECONDS = 30/);
assert.match(pinApi, /DEFAULT_PIN = '0000'/);
assert.match(pinApi, /PIN_DIGITS = 4/);
assert.ok(pinApi.includes('return /^\\d{4}$/.test'), 'server must enforce exactly four digits');
assert.doesNotMatch(pinApi, /4–6 digit PIN/);
assert.match(pinApi, /usesDefaultPin/);
assert.match(pinApi, /includePinDisplay/);
assert.match(pinApi, /action === 'adminUsers'/);
assert.match(pinApi, /makePinRecord\(DEFAULT_PIN\)/);
assert.match(pinApi, /INSERT INTO app_users[\s\S]*pin_salt[\s\S]*pin_hash/);
assert.match(pinApi, /HttpOnly/);
assert.match(pinApi, /SameSite=Lax/);
assert.match(pinApi, /app_sessions/);
assert.match(pinApi, /sameOriginWrite/);
assert.match(pinApi, /syncUser/);
assert.match(pinApi, /bootstrapEnabled:\s*false/);

assert.match(statusApi, /pinAuthHandler/);
assert.match(vercel, /\/api\/pin-auth/);
assert.match(vercel, /\/api\/status/);
assert.match(vite, /pin-auth\.js/);
assert.match(vite, /pin-userlist-guard\.mjs/);

console.log('Server-side four-digit employee and manager PIN auth regression checks passed');
