const state = {
  screen: "today",
  situationKind: "stuck",
  risk: "no",
  selectedSkill: "micro-start",
  attempts: Number(localStorage.getItem("skiller-attempts") || 2),
  experiments: Number(localStorage.getItem("skiller-experiments") || 8),
};

const skillContent = {
  "micro-start": {
    title: "Минимальный законченный старт",
    approach: "CBT · ПОВЕДЕНЧЕСКИЙ НАВЫК",
    description: "Откройте нужный файл и оставьте в нём одну черновую строку. Не улучшайте её.",
    recommendation: "Выберите действие, которое оставит наблюдаемый след и займёт не больше двух минут.",
    why: "При такой интенсивности лучше снизить сложность входа, но сохранить движение к задаче.",
    steps: [
      ["Назовите след", "Что должно остаться после действия?"],
      ["Уменьшите до двух минут", "Оставьте только начало, которое можно увидеть."],
      ["Сделайте без улучшения", "Цель — проверить вход, а не закончить задачу."],
    ],
    seconds: 120,
  },
  stop: {
    title: "STOP перед действием",
    approach: "DBT · СТАБИЛИЗАЦИЯ",
    description: "Остановитесь, отступите на полшага, отметьте импульс и выберите действие, которое не ухудшит ситуацию.",
    recommendation: "Сделайте короткую паузу между импульсом и ответом, не требуя от себя сразу успокоиться.",
    why: "Сейчас важнее вернуть возможность выбирать действие, чем немедленно убрать эмоцию.",
    steps: [
      ["Стоп", "Не отвечайте и не продолжайте действие несколько секунд."],
      ["Шаг назад", "Физически отодвиньтесь или положите телефон."],
      ["Наблюдайте и действуйте", "Назовите импульс и выберите безопасный следующий шаг."],
    ],
    seconds: 90,
  },
  "dear-man": {
    title: "Просьба без оправданий",
    approach: "DBT · МЕЖЛИЧНОСТНАЯ ЭФФЕКТИВНОСТЬ",
    description: "Сформулируйте факты, просьбу и пользу коротко — без защиты и длинных объяснений.",
    recommendation: "Соберите одну ясную просьбу, которую можно произнести вслух.",
    why: "Репетиция до разговора повышает шанс сохранить цель и отношения под нагрузкой.",
    steps: [
      ["Опишите факт", "Одно предложение без оценок и чтения мыслей."],
      ["Назовите просьбу", "Что конкретно человек может сделать?"],
      ["Закрепите", "Коротко скажите, чем это поможет вам обоим."],
    ],
    seconds: 240,
  },
};

const screens = [...document.querySelectorAll(".screen")];
const navItems = [...document.querySelectorAll(".nav-item")];
const toast = document.getElementById("toast");
let toastTimer;
let countdown;
let remaining = 0;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function navigate(screenName) {
  state.screen = screenName;
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === `screen-${screenName}`));
  navItems.forEach((item) => {
    const active = item.dataset.screen === screenName;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => item.addEventListener("click", () => navigate(item.dataset.screen)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
document.querySelectorAll("[data-toast]").forEach((button) => button.addEventListener("click", () => showToast(button.dataset.toast)));

document.querySelectorAll(".choice").forEach((choice) => {
  choice.addEventListener("click", () => {
    state.situationKind = choice.dataset.kind;
    document.querySelectorAll(".choice").forEach((item) => item.classList.toggle("active", item === choice));
  });
});

document.querySelectorAll("[data-risk]").forEach((choice) => {
  choice.addEventListener("click", () => {
    state.risk = choice.dataset.risk;
    document.querySelectorAll("[data-risk]").forEach((item) => item.classList.toggle("active", item === choice));
  });
});

const intensity = document.getElementById("intensity");
const intensityOutput = document.getElementById("intensity-output");
intensity.addEventListener("input", () => { intensityOutput.textContent = `${intensity.value} из 10`; });

const recommendation = document.getElementById("recommendation");
const liveHelp = document.getElementById("live-help");
const recommendationTitle = document.getElementById("recommendation-title");
const recommendationApproach = document.getElementById("recommendation-approach");
const recommendationCopy = document.getElementById("recommendation-copy");
const recommendationWhy = document.getElementById("recommendation-why");

document.getElementById("situation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.risk === "yes") {
    recommendation.classList.add("hidden");
    liveHelp.classList.remove("hidden");
    liveHelp.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  liveHelp.classList.add("hidden");
  state.selectedSkill = ["emotion", "conflict"].includes(state.situationKind) ? "stop" : "micro-start";
  const skill = skillContent[state.selectedSkill];
  recommendationTitle.textContent = skill.title;
  recommendationApproach.textContent = skill.approach;
  recommendationCopy.textContent = skill.recommendation;
  recommendationWhy.textContent = skill.why;
  recommendation.classList.remove("hidden");
  recommendation.scrollIntoView({ behavior: "smooth", block: "center" });
});

const sheet = document.getElementById("practice-sheet");
const timer = document.getElementById("timer");

function formatTime(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function openSkill(skillId) {
  state.selectedSkill = skillId;
  const skill = skillContent[skillId];
  document.getElementById("sheet-title").textContent = skill.title;
  document.getElementById("sheet-approach").textContent = skill.approach;
  document.getElementById("sheet-description").textContent = skill.description;
  document.getElementById("skill-steps").innerHTML = skill.steps.map((step, index) => `
    <li><span>${index + 1}</span><p><strong>${step[0]}</strong>${step[1]}</p></li>
  `).join("");
  clearInterval(countdown);
  remaining = skill.seconds;
  timer.textContent = formatTime(remaining);
  countdown = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    timer.textContent = formatTime(remaining);
    if (remaining === 0) clearInterval(countdown);
  }, 1000);
  sheet.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSkill() {
  clearInterval(countdown);
  sheet.classList.add("hidden");
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-start-skill]").forEach((button) => button.addEventListener("click", () => openSkill(button.dataset.startSkill)));
document.getElementById("start-recommendation").addEventListener("click", () => openSkill(state.selectedSkill));
document.getElementById("close-sheet").addEventListener("click", closeSkill);
sheet.addEventListener("click", (event) => { if (event.target === sheet) closeSkill(); });

document.getElementById("finish-skill").addEventListener("click", () => {
  state.attempts = Math.min(5, state.attempts + 1);
  state.experiments += 1;
  localStorage.setItem("skiller-attempts", state.attempts);
  localStorage.setItem("skiller-experiments", state.experiments);
  document.getElementById("attempt-count").textContent = state.attempts;
  document.getElementById("experiment-total").textContent = state.experiments;
  document.querySelectorAll(".attempt").forEach((dot, index) => dot.classList.toggle("done", index < state.attempts));
  closeSkill();
  navigate("protocol");
  showToast("Попытка записана. Карта обновлена как наблюдение, не как окончательный вывод.");
});

document.getElementById("too-hard").addEventListener("click", () => {
  closeSkill();
  showToast("Сложность записана. Следующая версия навыка будет короче.");
});

document.getElementById("master-access").addEventListener("change", (event) => {
  event.target.closest(".switch").querySelector("em").textContent = event.target.checked ? "Доступ включён" : "Доступ выключен";
  showToast(event.target.checked ? "Доступ психолога восстановлен" : "Доступ психолога отозван");
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !sheet.classList.contains("hidden")) closeSkill(); });

document.getElementById("attempt-count").textContent = state.attempts;
document.getElementById("experiment-total").textContent = state.experiments;
document.querySelectorAll(".attempt").forEach((dot, index) => dot.classList.toggle("done", index < state.attempts));

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
