// "Total in words" — see docs/accounts-payable-phase1-design.md §6 for
// the exact printed format confirmed against the real reference PDF:
// "<CURRENCY> <INTEGER PART IN WORDS> AND <DECIMAL PART AS NUMBER-WORDS>
// ONLY" — e.g. "INR FORTY-THREE THOUSAND EIGHT HUNDRED NINETY-SIX AND
// FIFTY-NINE ONLY" for ₹43,896.59. No "Rupees"/"Paise" words anywhere;
// Indian lakhs/crores grouping (thousand, then lakh, then crore), not
// international thousands grouping.

const ONES = [
  "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT",
  "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN",
  "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];

const TENS = [
  "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY",
  "EIGHTY", "NINETY",
];

// Converts an integer 0-99 to words.
function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n]!;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens]! : `${TENS[tens]}-${ONES[ones]}`;
}

// Converts an integer 0-999 to words.
function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} HUNDRED`);
  if (rest > 0) parts.push(twoDigitsToWords(rest));
  return parts.join(" ");
}

// Indian numbering: ones/tens/hundreds, then thousand (10^3), lakh
// (10^5), crore (10^7) — each subsequent group is two digits, not
// three, unlike international thousands/millions grouping.
function integerToWords(n: number): string {
  if (n === 0) return "ZERO";

  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n / 1_00_000) % 100);
  const thousand = Math.floor((n / 1000) % 100);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${threeDigitsToWords(crore)} CRORE`);
  if (lakh > 0) parts.push(`${twoDigitsToWords(lakh)} LAKH`);
  if (thousand > 0) parts.push(`${twoDigitsToWords(thousand)} THOUSAND`);
  if (hundred > 0) parts.push(threeDigitsToWords(hundred));

  return parts.join(" ");
}

export function amountInWords(amount: number, currency = "INR"): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const integerPart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - integerPart) * 100);

  const integerWords = integerToWords(integerPart);
  const decimalWords = twoDigitsToWords(decimalPart);

  return `${currency} ${integerWords} AND ${decimalWords} ONLY`;
}
