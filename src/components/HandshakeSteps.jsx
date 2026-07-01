import { PHASE } from "../lib/sessionPhase";

const STEPS = [
  { id: PHASE.SETUP, label: "Ник" },
  { id: PHASE.READY, label: "Роль" },
  { id: PHASE.HOST_OFFER, label: "Приглашение" },
  { id: PHASE.GUEST_ANSWER, label: "Ответ" },
  { id: PHASE.CHAT, label: "Чат" },
];

function stepIndex(phase) {
  if (phase === PHASE.CONNECTING) return 3;
  if (phase === PHASE.GUEST_ANSWER) return 3;
  if (phase === PHASE.HOST_OFFER) return 2;
  if (phase === PHASE.READY) return 1;
  if (phase === PHASE.CHAT) return 4;
  return 0;
}

export default function HandshakeSteps({ phase, title, hint, busyLabel }) {
  const active = stepIndex(phase);

  return (
    <section className="card handshake-steps">
      <ol className="step-list">
        {STEPS.map((step, index) => {
          const state = index < active ? "done" : index === active ? "current" : "todo";
          return (
            <li key={step.id} className={`step-item step-${state}`}>
              <span className="step-marker">{index + 1}</span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      {busyLabel ? <p className="busy-label">{busyLabel}</p> : null}
    </section>
  );
}
