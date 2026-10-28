import { useId } from "preact/hooks";
import { Icon } from "./Icon.jsx";

/**
 * 카드: 흰 바탕 데이터 영역. 제목이 있으면 section 의 이름표가 된다.
 * @param {{
 *   title?: string,
 *   description?: any,
 *   icon?: string,
 *   tone?: import("../lib/game.js").Tone,
 *   action?: any,
 *   headingLevel?: 2 | 3,
 *   id?: string,
 *   class?: string,
 *   children?: any
 * }} props
 */
export function Card({ title, description, icon, tone = "sky", action, headingLevel = 2, id, class: className = "", children }) {
  const titleId = `card-${useId()}`;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section id={id} class={`card ${className}`} aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <header class="card__head">
          <div class="card__heading">
            {icon ? (
              <span class={`card__icon tone-${tone}`}>
                <Icon name={icon} size={20} />
              </span>
            ) : null}
            <div class="card__titles">
              <Heading id={titleId} class="card__title">
                {title}
              </Heading>
              {description ? <p class="card__desc">{description}</p> : null}
            </div>
          </div>
          {action ? <div class="card__action">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
