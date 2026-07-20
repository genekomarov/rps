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
    <section className="card arena-tiebreak">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <div className="actions">
        {WEAPONS.map((weapon) => (
          <button
            key={weapon}
            type="button"
            className="arena-tiebreak-button"
            onClick={() => onChoose(weapon)}
          >
            <WeaponIcon weapon={weapon} className="arena-icon" />
            {weaponLabel(weapon)}
          </button>
        ))}
      </div>
    </section>
  );
}
