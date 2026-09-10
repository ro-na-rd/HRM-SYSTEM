export const RATING_LABELS = {
  1: 'Needs improvement',
  2: 'Below expectations',
  3: 'Meets expectations',
  4: 'Exceeds expectations',
  5: 'Outstanding',
};

export function ratingText(rating) {
  if (!rating) return 'Not rated';
  return `${rating}/5 — ${RATING_LABELS[rating] || ''}`.trim();
}
