export type SignupRequirement =
  | "nickname"
  | "username"
  | "usernameAvailability"
  | "password"
  | "passwordConfirmation"
  | "email"
  | "emailAvailability"
  | "agreements";

export type SignupReadinessInput = {
  readonly emailAvailable: boolean;
  readonly emailEntered: boolean;
  readonly nicknameEntered: boolean;
  readonly passwordConfirmed: boolean;
  readonly passwordValid: boolean;
  readonly privacyAccepted: boolean;
  readonly termsAccepted: boolean;
  readonly usernameAvailable: boolean;
  readonly usernameEntered: boolean;
};

const signupRequirementMessages: Record<SignupRequirement, string> = {
  agreements: "필수 약관에 모두 동의해주세요.",
  email: "이메일을 입력해주세요.",
  emailAvailability: "이메일 중복 확인을 완료해주세요.",
  nickname: "이름을 입력해주세요.",
  password: "비밀번호 조건을 확인해주세요.",
  passwordConfirmation: "비밀번호 확인을 완료해주세요.",
  username: "아이디를 입력해주세요.",
  usernameAvailability: "아이디 중복 확인을 완료해주세요."
};

export function getSignupRequirementMessage(requirement: SignupRequirement): string {
  return signupRequirementMessages[requirement];
}

export function getSignupReadiness(input: SignupReadinessInput): {
  readonly isReady: boolean;
  readonly unmetRequirements: SignupRequirement[];
} {
  const unmetRequirements: SignupRequirement[] = [];

  if (!input.nicknameEntered) unmetRequirements.push("nickname");
  if (!input.usernameEntered) unmetRequirements.push("username");
  if (input.usernameEntered && !input.usernameAvailable) {
    unmetRequirements.push("usernameAvailability");
  }
  if (!input.passwordValid) unmetRequirements.push("password");
  if (!input.passwordConfirmed) unmetRequirements.push("passwordConfirmation");
  if (!input.emailEntered) unmetRequirements.push("email");
  if (input.emailEntered && !input.emailAvailable) {
    unmetRequirements.push("emailAvailability");
  }
  if (!input.termsAccepted || !input.privacyAccepted) unmetRequirements.push("agreements");

  return {
    isReady: unmetRequirements.length === 0,
    unmetRequirements
  };
}
