import { StateArt } from "./Decor.jsx";
import { Icon } from "./Icon.jsx";

/**
 * 빈 상태: 구름·단풍잎 일러스트 + 다음 행동.
 * @param {{ title: string, description?: any, action?: any, art?: "empty" | "search", compact?: boolean }} props
 */
export function EmptyState({ title, description, action, art = "empty", compact = false }) {
  return (
    <div class={`state${compact ? " state--compact" : ""}`}>
      <StateArt kind={art} />
      <p class="state__title">{title}</p>
      {description ? <p class="state__desc">{description}</p> : null}
      {action ? <div class="state__action">{action}</div> : null}
    </div>
  );
}

/**
 * 오류 상태: 무엇이 안 됐는지 + 다시 시도.
 * @param {{ title?: string, description?: string, detail?: string, onRetry?: () => void, retryLabel?: string, compact?: boolean }} props
 */
export function ErrorState({
  title = "정보를 불러오지 못했어요",
  description,
  detail,
  onRetry,
  retryLabel = "다시 시도",
  compact = false
}) {
  return (
    <div class={`state state--error${compact ? " state--compact" : ""}`} role="alert">
      <StateArt kind="error" />
      <p class="state__title">{title}</p>
      {description ? <p class="state__desc">{description}</p> : null}
      {detail ? <p class="state__detail num">{detail}</p> : null}
      {onRetry ? (
        <div class="state__action">
          <button type="button" class="btn btn--secondary" onClick={onRetry}>
            <Icon name="refresh" size={20} />
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
