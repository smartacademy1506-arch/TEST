/** Jour pédagogique : date calendaire 'YYYY-MM-DD' en Africa/Douala (UTC+1, sans heure d'été). CDC PED-02. */
export type PedagogicDay = string;

const DAY_MS = 86_400_000;
const DOUALA_OFFSET_MS = 3_600_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: PedagogicDay): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`Jour pédagogique invalide : ${day}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(t).toISOString().slice(0, 10) !== day) throw new RangeError(`Jour pédagogique invalide : ${day}`);
  return t;
}

/** Les instants sont stockés en UTC ; le jour pédagogique en dérive. */
export function pedagogicDay(instant: Date): PedagogicDay {
  return new Date(instant.getTime() + DOUALA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: PedagogicDay, n: number): PedagogicDay {
  return new Date(parseDay(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Nombre de jours de `from` à `to` (positif si `to` est après `from`). */
export function diffDays(from: PedagogicDay, to: PedagogicDay): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}
