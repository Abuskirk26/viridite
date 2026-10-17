import { createFileRoute } from "@tanstack/react-router";
import { GameScreen } from "@/components/GameScreen";

export const Route = createFileRoute("/")({ component: GameScreen });
