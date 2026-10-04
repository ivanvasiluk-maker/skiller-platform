export type AddressForm = "formal" | "informal";
export type GrammaticalGender = "neutral" | "masculine" | "feminine";
export type CommunicationPreferences = {
  address_form?: AddressForm;
  grammatical_gender?: GrammaticalGender;
};

export function communicationInstructions(profile: CommunicationPreferences): string {
  const address = profile.address_form === "informal" ? "ты" : "Вы";
  const gender = profile.grammatical_gender === "masculine"
    ? "Используй мужской род, когда говоришь о пользователе."
    : profile.grammatical_gender === "feminine"
      ? "Используй женский род, когда говоришь о пользователе."
      : "Избегай форм, зависящих от пола пользователя; переформулируй их нейтрально.";
  return `Сохранённые настройки обращения: обращайся к пользователю на «${address}». ${gender} Обращение и род независимы; не определяй их по имени или тексту сообщений. Эти настройки уточняют общие правила обращения.`;
}
