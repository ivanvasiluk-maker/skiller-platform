function wallTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
/** Reject nonexistent or ambiguous local times rather than silently changing the agreement. */
export function reminderInstant(local: string, timezone: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !timezone || timezone.length > 80) throw new Error("Проверьте дату, время и часовой пояс.");
  const base = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 16) !== local) throw new Error("Укажите существующие дату и время.");
  const offsets = new Set<number>();
  try {
    for (let hour = -36; hour <= 36; hour += 6) {
      const sample = base + hour * 3600000;
      offsets.add(Date.parse(`${wallTime(new Date(sample), timezone)}:00Z`) - sample);
    }
  } catch { throw new Error("Проверьте часовой пояс."); }
  const candidates = [...offsets].map(offset => base - offset).filter(value => wallTime(new Date(value), timezone) === local);
  if (candidates.length !== 1) throw new Error("При переводе часов это время отсутствует или встречается дважды. Выберите другое время.");
  const instant = candidates[0];
  if (instant < now + 60000) throw new Error("Выберите время хотя бы на минуту позже текущего.");
  if (instant > now + 366 * 86400000) throw new Error("Выберите время в пределах ближайшего года.");
  return new Date(instant).toISOString();
}
