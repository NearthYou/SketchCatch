import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const signupPageSource = readAppFile("signup/page.tsx");
const signupFormSource = readAppFile("signup/signup-form.tsx");
const authShellSource = readWebFile("components/auth/auth-shell.tsx");
const authStylesSource = readWebFile("components/auth/auth.css");

test("signup route renders the shared authentication shell", () => {
  assert.match(signupPageSource, /AuthShell/);
  assert.match(signupPageSource, /<SignupForm \/>/);
  assert.doesNotMatch(signupPageSource, /RoutePlaceholder/);
});

test("signup keeps the home brand inside the centered card without extra intro copy", () => {
  assert.match(signupPageSource, /brandPlacement="panel"/);
  assert.match(signupPageSource, /<AuthShell[^>]*centered/s);
  assert.doesNotMatch(signupPageSource, /description=/);
  assert.doesNotMatch(signupPageSource, /eyebrow=/);
  assert.match(authShellSource, /<ProductBrand href="\/" \/>/);
});

test("signup consent view actions stay beside their agreement labels", () => {
  assert.match(
    authStylesSource,
    /\.authConsentRow\s*\{[^}]*justify-content:\s*flex-start;[^}]*gap:\s*8px;/s
  );
  assert.doesNotMatch(authStylesSource, /\.authConsentRow\s*\{[^}]*space-between;/s);
});

test("signup fields stay in one narrow column in the requested order", () => {
  assert.doesNotMatch(signupPageSource, /\bwide\b/);

  const fieldMarkers = [
    'name="nickname"',
    'id="signup-username"',
    'id="signup-password"',
    'id="signup-password-confirm"',
    'id="signup-email"'
  ];
  const fieldPositions = fieldMarkers.map((fieldMarker) => signupFormSource.indexOf(fieldMarker));

  assert.ok(fieldPositions.every((position) => position >= 0));
  assert.deepEqual(fieldPositions, [...fieldPositions].sort((left, right) => left - right));
});

test("signup form keeps the authentication contract", () => {
  assert.match(signupFormSource, /const \{ signup[^}]*\} = useAuth\(\)/);
  assert.match(signupFormSource, /await signup\(payload\)/);
  assert.match(signupFormSource, /router\.replace\("\/dashboard"\)/);
});

test("signup password fields keep their controls top-aligned when help text is present", () => {
  assert.match(
    authStylesSource,
    /\.authField\s*\{[^}]*align-content:\s*start;/s
  );
});

test("signup validation feedback uses reserved single-message slots", () => {
  assert.equal(
    [...signupFormSource.matchAll(/className="authFieldFeedback/g)].length,
    4
  );
  assert.match(
    authStylesSource,
    /\.authFieldFeedback\s*\{[^}]*min-height:\s*19px;/s
  );
  assert.match(signupFormSource, /const passwordFeedbackMessage =/);
  assert.doesNotMatch(signupFormSource, /PasswordValidationMessages/);
});

test("signup keeps reserved feedback slots without oversized vertical gaps", () => {
  assert.match(signupFormSource, /<form className="authForm authSignupForm"/);
  assert.match(authStylesSource, /\.authSignupForm\s*\{[^}]*gap:\s*8px;/s);
});

test("signup feedback falls back when a warning helper returns an empty string", () => {
  assert.match(
    signupFormSource,
    /passwordCapsLockWarning \|\| passwordValidationMessage \|\| PASSWORD_POLICY_HELP_TEXT/
  );
  assert.match(
    signupFormSource,
    /passwordConfirmCapsLockWarning \|\| passwordConfirmMismatchMessage/
  );
});

function readAppFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/${path}`, import.meta.url)), "utf8");
}

function readWebFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
