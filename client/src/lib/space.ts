/**
 * THE SPACE helpers shared by the public site and admin editor.
 */

/** 1–4 → “1–4 guests”; 4–4 → “4 guests”. */
export function formatGuestCapacity(minGuests: number, maxGuests: number): string {
  const min = Number.isFinite(minGuests) ? Math.max(1, minGuests) : 1
  const max = Number.isFinite(maxGuests) ? Math.max(min, maxGuests) : min
  if (min >= max) return `${max} guests`
  return `${min}–${max} guests`
}