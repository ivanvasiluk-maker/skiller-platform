import { trainers, type TrainerId } from "@/lib/trainers";
export function TrainerCharacter({ id, size = "normal" }: { id: TrainerId; size?: "small" | "normal" | "large" }) {
  // Exact characters from the approved original artwork.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`approved-character ${size}`} src={`/characters/${id}.webp`} alt={trainers[id].name} width={240} height={320}/>;
}
