import { requireChatGPTUser } from "./chatgpt-auth";
import { loadDashboard } from "@/lib/skiller-data";
import { SkillerApp } from "./skiller-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  try {
    const data = await loadDashboard(user);
    return <SkillerApp initialData={data} />;
  } catch (error) {
    console.error("SKILLER bootstrap error", error);
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6 text-[#132348]">
        <section className="w-full max-w-md rounded-[28px] border border-[#dbe3ef] bg-white p-7 shadow-[0_24px_60px_rgba(19,35,72,.10)]">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#e9efff] text-xl font-black text-[#2868f5]">S</div>
          <h1 className="text-2xl font-black tracking-tight">Не удалось открыть личный протокол</h1>
          <p className="mt-3 leading-7 text-[#66738b]">Данные в безопасности. Обновите страницу через минуту — система попробует подключиться снова.</p>
          <a className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#2868f5] px-5 font-bold text-white" href="/">Попробовать снова</a>
        </section>
      </main>
    );
  }
}
