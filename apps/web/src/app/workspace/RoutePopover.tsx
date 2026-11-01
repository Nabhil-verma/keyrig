import type { ComponentProps } from "react";
import { ProfilePanel } from "../../components/ProfilePanel";
import { Icon } from "../../components/ui/Icon";

type ProfileProps = ComponentProps<typeof ProfilePanel>;

/** The route popover. It floats over the chat, so the chat keeps its width. */
export function RoutePopover({ onClose, ...profile }: ProfileProps & { onClose: () => void }) {
  return (
    <>
      <button
        type="button"
        className="ws-popover-backdrop"
        aria-label="Close the route panel"
        onClick={onClose}
      />
      <div className="ws-popover" role="dialog" aria-label="Route">
        <button type="button" className="icon-button ws-close" aria-label="Close" onClick={onClose}>
          <Icon name="plus" size={15} />
        </button>
        <ProfilePanel {...profile} />
      </div>
    </>
  );
}
