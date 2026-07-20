import { weaponLabel, type Weapon } from "./logic";
import { WeaponIcon } from "./icons";

const WEAPONS: Weapon[] = ["rock", "paper", "scissors"];

interface ArenaDuelProps {
  title: string;
  description: string;
  onChoose: (weapon: Weapon) => void;
}

export function ArenaDuel({ title, description, onChoose }: ArenaDuelProps) {
  return (
    <section className="card arena-tiebreak arena-duel-panel">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <div className="arena-duel-choices" role="group" aria-label="Выбор жеста">
        {WEAPONS.map((weapon) => (
          <button
            key={weapon}
            type="button"
            className="arena-duel-choice"
            aria-label={weaponLabel(weapon)}
            title={weaponLabel(weapon)}
            onClick={() => onChoose(weapon)}
          >
            <WeaponIcon weapon={weapon} className="arena-duel-choice-icon" />
          </button>
        ))}
      </div>
    </section>
  );
}
