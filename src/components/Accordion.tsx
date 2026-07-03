import { useId, useState, type ReactNode } from "react";

export interface AccordionItem {
  id: string;
  title: string;
  description?: string;
  content?: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpenId?: string;
}

export default function Accordion({ items, defaultOpenId }: AccordionProps) {
  const baseId = useId();
  const [openId, setOpenId] = useState(defaultOpenId ?? items[0]?.id ?? "");

  return (
    <div className="accordion">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `${baseId}-${item.id}-panel`;
        const triggerId = `${baseId}-${item.id}-trigger`;

        return (
          <section key={item.id} className={`accordion-item${isOpen ? " accordion-item-open" : ""}`}>
            <h3 className="accordion-heading">
              <button
                id={triggerId}
                type="button"
                className="accordion-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId((current) => (current === item.id ? "" : item.id))}
              >
                <span>{item.title}</span>
                <span className="accordion-icon" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className="accordion-panel"
              hidden={!isOpen}
            >
              {item.description ? <p className="muted accordion-description">{item.description}</p> : null}
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
