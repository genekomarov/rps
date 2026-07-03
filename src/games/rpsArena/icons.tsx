import type { ReactNode } from "react";
import type { ArenaPiece, Weapon } from "./logic";

interface IconProps {
  className?: string;
  title?: string;
}

function ArenaIcon({ className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {children}
    </svg>
  );
}

export function RockIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Камень"}>
      <path
        d="M12 3.5 16.2 5.8 18.5 10l-1.2 5.2-4.3 2.8-4.5-2.1L6.8 10.2 9.5 5.5 12 3.5Z"
        fill="#9ca3af"
        stroke="#4b5563"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M10.2 8.4h3.6M9.8 11.2h4.4" stroke="#6b7280" strokeWidth="1" strokeLinecap="round" />
    </ArenaIcon>
  );
}

export function PaperIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Бумага"}>
      <path d="M7 4.5h8.2L18 7.3v12.2H7V4.5Z" fill="#f8fafc" stroke="#64748b" strokeWidth="1.2" />
      <path d="M15.2 4.5 18 7.3H15.8c-.9 0-1.6-.7-1.6-1.6V4.5Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1.2" />
      <path d="M9.5 11h6M9.5 14h6M9.5 17h4" stroke="#94a3b8" strokeWidth="1.1" strokeLinecap="round" />
    </ArenaIcon>
  );
}

export function ScissorsIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Ножницы"}>
      <circle cx="8.2" cy="7.2" r="2.2" fill="none" stroke="#374151" strokeWidth="1.4" />
      <circle cx="8.2" cy="16.8" r="2.2" fill="none" stroke="#374151" strokeWidth="1.4" />
      <path
        d="M10.2 8.8 18.5 3.5M10.2 15.2 18.5 20.5"
        stroke="#374151"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10.2 8.8 18.5 20.5M10.2 15.2 18.5 3.5"
        stroke="#ef4444"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </ArenaIcon>
  );
}

export function FlagIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Знамя"}>
      <path d="M6.5 4.5v15" stroke="#78350f" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.5 5.5h9.5l-2.2 3.2 2.2 3.1H6.5V5.5Z" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" />
    </ArenaIcon>
  );
}

export function TrapIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Ловушка"}>
      <ellipse cx="12" cy="14.5" rx="7" ry="4.2" fill="#111827" />
      <ellipse cx="12" cy="13.8" rx="5.2" ry="2.6" fill="#1f2937" />
      <path
        d="M6.2 11.8 7.6 9.8l1.8 1.4 2-2.4 2.1 2.2 2.2-2.1 1.9 2.3 1.8-1.7"
        fill="none"
        stroke="#92400e"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </ArenaIcon>
  );
}

export function HiddenCardIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Скрытая карта"}>
      <rect x="5.5" y="3.5" width="13" height="17" rx="2" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1.2" />
      <path
        d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5"
        stroke="#93c5fd"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="9.5" y="6.5" width="5" height="5" transform="rotate(45 12 9)" fill="none" stroke="#bfdbfe" strokeWidth="1" />
    </ArenaIcon>
  );
}

export function UnknownIcon({ className, title }: IconProps) {
  return (
    <ArenaIcon className={className} title={title ?? "Неизвестно"}>
      <circle cx="12" cy="12" r="8" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.2" />
      <path
        d="M9.4 9.1c.2-1.7 1.5-2.8 3.3-2.8 1.9 0 3.2 1.1 3.2 2.7 0 1.2-.6 1.9-1.8 2.6-1 .6-1.4 1.1-1.4 2.1"
        fill="none"
        stroke="#4b5563"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.1" r="1" fill="#4b5563" />
    </ArenaIcon>
  );
}

export function WeaponIcon({ weapon, className, title }: IconProps & { weapon: Weapon }) {
  switch (weapon) {
    case "rock":
      return <RockIcon className={className} title={title} />;
    case "paper":
      return <PaperIcon className={className} title={title} />;
    case "scissors":
      return <ScissorsIcon className={className} title={title} />;
  }
}

export function ArenaPieceIcon({
  piece,
  isOwn,
  className,
}: {
  piece: ArenaPiece;
  isOwn: boolean;
  className?: string;
}) {
  if (!isOwn && !piece.revealed) {
    return <HiddenCardIcon className={className} />;
  }

  if (piece.kind === "flag") {
    return <FlagIcon className={className} />;
  }

  if (piece.kind === "trap") {
    return <TrapIcon className={className} />;
  }

  if (piece.weapon) {
    return <WeaponIcon weapon={piece.weapon} className={className} />;
  }

  return <UnknownIcon className={className} />;
}
