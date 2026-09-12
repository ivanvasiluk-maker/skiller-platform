import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { loadDashboard } from "@/lib/skiller-data";
import { SkillerApp } from "@/app/skiller-app";
export const dynamic = "force-dynamic";
export default async function Journal() {
  const user = await requireChatGPTUser("/journal");
  return <><Link href="/" className="block bg-[#132348] p-3 text-center text-sm text-white">← Вернуться к тренеру</Link><SkillerApp initialData={await loadDashboard(user)}/></>;
}
