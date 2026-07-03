import type { PhaseMeta, PeerListItem, ResolvePhaseInput, SessionPhase } from "../types";

export const PHASE = {
  SETUP: "setup",
  READY: "ready",
  HOST_OFFER: "host-offer",
  GUEST_ANSWER: "guest-answer",
  CONNECTING: "connecting",
  CHAT: "chat",
} as const satisfies Record<string, SessionPhase>;

export function resolvePhase({
  nickname,
  hostOfferCode,
  answerCode,
  peers,
  busy,
}: ResolvePhaseInput): SessionPhase {
  if (busy) return PHASE.CONNECTING;
  if (peers.length > 0) return PHASE.CHAT;
  if (answerCode) return PHASE.GUEST_ANSWER;
  if (hostOfferCode) return PHASE.HOST_OFFER;
  if (nickname?.trim()) return PHASE.READY;
  return PHASE.SETUP;
}

export function getPhaseMeta(phase: SessionPhase | string): PhaseMeta {
  switch (phase) {
    case PHASE.SETUP:
      return {
        title: "Шаг 1. Введите ник",
        hint: "Сохраните ник, чтобы начать подключение.",
      };
    case PHASE.READY:
      return {
        title: "Шаг 2. Выберите роль",
        hint: "Хост нажимает «Создать приглашение». Гость вставляет или сканирует код хоста.",
      };
    case PHASE.HOST_OFFER:
      return {
        title: "Шаг 3. Хост — передайте приглашение",
        hint: "Отправьте QR или текст гостю. Затем дождитесь ответного кода от гостя и вставьте его ниже.",
      };
    case PHASE.GUEST_ANSWER:
      return {
        title: "Шаг 3. Гость — передайте ответ",
        hint: "Отправьте QR или текст хосту. Не закрывайте вкладку, пока хост не применит ответ.",
      };
    case PHASE.CONNECTING:
      return {
        title: "Шаг 4. Устанавливаем соединение",
        hint: "Идёт обмен сетевыми данными WebRTC. При failed хост выдаст новое приглашение — передайте его гостю и вставьте новый ответ. При проблемах — «Сбросить сессию».",
      };
    case PHASE.CHAT:
      return {
        title: "Соединение установлено",
        hint: "P2P-канал открыт. Перейдите на главную, чтобы выбрать игру.",
      };
    default:
      return { title: "Подключение", hint: "" };
  }
}

export type { PeerListItem };
