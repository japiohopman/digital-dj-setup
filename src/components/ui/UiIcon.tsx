import type { JSX } from 'react';

/** Maps semantic UI icon names to paths inside the public/icons directory. */
export const UI_ICON_PATHS = {
  albumCrate: 'icons/UI/album_crate.svg',
} as const;

export type UiIconName = keyof typeof UI_ICON_PATHS;

/**
 * Resolves an owned public icon against Vite's configured base path.
 * This keeps icons working both at the site root and under the GitHub Pages project path.
 */
export function getUiIconUrl(
  name: UiIconName,
  basePath: string = import.meta.env.BASE_URL,
): string {
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${normalizedBasePath}${UI_ICON_PATHS[name]}`;
}

export interface UiIconProps {
  /** Semantic name registered in UI_ICON_PATHS. */
  name: UiIconName;
  /** Optional class for sizing and visual treatment by the consuming control. */
  className?: string;
}

/**
 * Renders a decorative, app-owned SVG icon.
 * The surrounding control must provide its own accessible name and semantics.
 */
export function UiIcon({ name, className }: UiIconProps): JSX.Element {
  return (
    <img
      className={className}
      src={getUiIconUrl(name)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
