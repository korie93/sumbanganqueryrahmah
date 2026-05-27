export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4;

export type PasswordStrengthLabel =
  | "Very Weak"
  | "Weak"
  | "Fair"
  | "Strong"
  | "Very Strong";

export type PasswordStrengthEvaluation = {
  ariaLabel: string;
  feedback: string[];
  label: PasswordStrengthLabel;
  level: PasswordStrengthLevel;
  malayLabel: string;
  score: number;
};

const MIN_RECOMMENDED_PASSWORD_LENGTH = 12;

const STRENGTH_LABELS: Array<{
  label: PasswordStrengthLabel;
  level: PasswordStrengthLevel;
  malayLabel: string;
}> = [
  { level: 0, label: "Very Weak", malayLabel: "Sangat Lemah" },
  { level: 1, label: "Weak", malayLabel: "Lemah" },
  { level: 2, label: "Fair", malayLabel: "Sederhana" },
  { level: 3, label: "Strong", malayLabel: "Kuat" },
  { level: 4, label: "Very Strong", malayLabel: "Sangat Kuat" },
];

const COMMON_PASSWORD_WORDS = [
  "admin",
  "password",
  "passw0rd",
  "qwerty",
  "rahmah",
  "sumbangan",
  "welcome",
] as const;

const SEQUENCE_SOURCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
] as const;

function hasSequentialPattern(raw: string): boolean {
  const normalized = raw.toLowerCase();
  for (const source of SEQUENCE_SOURCES) {
    const forward = source;
    const reverse = [...source].reverse().join("");
    for (const sequenceSource of [forward, reverse]) {
      for (let index = 0; index <= sequenceSource.length - 3; index += 1) {
        if (normalized.includes(sequenceSource.slice(index, index + 3))) {
          return true;
        }
      }
    }
  }

  return false;
}

function getLevelFromScore(score: number): PasswordStrengthLevel {
  if (score >= 6) return 4;
  if (score >= 5) return 3;
  if (score >= 3) return 2;
  if (score >= 2) return 1;
  return 0;
}

export function evaluatePasswordStrength(raw: string): PasswordStrengthEvaluation {
  const normalized = raw.toLowerCase();
  const hasLowercase = /[a-z]/.test(raw);
  const hasUppercase = /[A-Z]/.test(raw);
  const hasNumber = /\d/.test(raw);
  const hasSymbol = /[^A-Za-z0-9]/.test(raw);
  const hasCommonWord = COMMON_PASSWORD_WORDS.some((word) => normalized.includes(word));
  const hasRepetition = /(.)\1{2,}/.test(raw);
  const hasSequence = hasSequentialPattern(raw);

  let score = 0;
  if (raw.length >= MIN_RECOMMENDED_PASSWORD_LENGTH) {
    score += 2;
  } else if (raw.length >= 8) {
    score += 1;
  }

  if (hasLowercase) score += 1;
  if (hasUppercase) score += 1;
  if (hasNumber) score += 1;
  if (hasSymbol) score += 1;

  if (hasCommonWord) score -= 1;
  if (hasRepetition) score -= 1;
  if (hasSequence) score -= 1;

  const boundedScore = Math.max(0, Math.min(score, 6));
  const level = getLevelFromScore(boundedScore);
  const { label, malayLabel } = STRENGTH_LABELS[level];
  const feedback: string[] = [];

  if (raw.length < MIN_RECOMMENDED_PASSWORD_LENGTH) {
    feedback.push("Use 12+ chars");
  }
  if (!hasUppercase) feedback.push("Add uppercase");
  if (!hasLowercase) feedback.push("Add lowercase");
  if (!hasNumber) feedback.push("Add number");
  if (!hasSymbol) feedback.push("Add symbol");
  if (hasCommonWord) feedback.push("Avoid common words");
  if (hasRepetition) feedback.push("Avoid repeated characters");
  if (hasSequence) feedback.push("Avoid predictable sequences");

  return {
    ariaLabel: `Password strength: ${label}`,
    feedback,
    label,
    level,
    malayLabel,
    score: boundedScore,
  };
}
