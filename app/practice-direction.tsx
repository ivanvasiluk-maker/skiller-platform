"use client";

export function PracticeDirection({ onStart }: { onStart: () => void }) {
  return <section className="practice-direction" aria-labelledby="practice-direction-title">
    <span className="trainer-kicker">С ЧЕГО НАЧНЁМ</span>
    <h1 id="practice-direction-title">С чем хотите поработать?</h1>
    <p>Начнём с одной ситуации. Можно рассказать своими словами — тренер поможет уточнить, что мешает.</p>
    <div className="practice-direction-grid">
      <article className="practice-direction-card">
        <span className="trainer-kicker">КПТ · ПРОКРАСТИНАЦИЯ</span>
        <h2>Откладываю важное</h2>
        <p>Например, нужно написать отчёт, но Вы снова переключаетесь на новости.</p>
        <p>Разберём момент остановки, выберем небольшой шаг и вернёмся к тому, что получилось.</p>
        <button type="button" className="trainer-primary" onClick={onStart}>Разобрать мою ситуацию</button>
      </article>
      <article className="practice-direction-card practice-direction-upcoming">
        <span className="trainer-kicker">В РАЗРАБОТКЕ</span>
        <h2>Тренинг навыков DBT</h2>
        <p>Осознанность, трудные моменты, эмоции и отношения.</p>
        <p>Полный маршрут появится позже. Быстрая практика STOP уже доступна по кнопке «Нужна пауза?».</p>
      </article>
    </div>
    <p className="trainer-caption">SKILLER — тренировка навыков. Здесь можно делать паузы и возвращаться без спешки.</p>
  </section>;
}
