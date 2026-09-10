import { requireChatGPTUser } from "../chatgpt-auth";
import { VoicePreview } from "./voice-preview";

export const dynamic = "force-dynamic";

export default async function VoicePreviewPage() {
  await requireChatGPTUser("/voice-preview");
  return <VoicePreview />;
}
