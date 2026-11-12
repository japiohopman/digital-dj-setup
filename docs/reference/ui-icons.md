# UI icon assets

The app uses its own SVG assets from `public/icons/`. Keep them organised by purpose, for example `public/icons/UI/` for interface controls.

## Registering an icon

1. Add the SVG to the appropriate folder under `public/icons/`.
2. Add a semantic key and its public path to `UI_ICON_PATHS` in `src/components/ui/UiIcon.tsx`.
3. Add the same public path to `PUBLIC_APP_ASSETS` in `src/pwa/serviceWorkerSource.ts` so the public SVG is available offline after installation.
4. Use the shared component where the icon belongs:

   ```tsx
   <UiIcon name="albumCrate" className="workspace-menu__trigger-icon" />
   ```

Use the semantic key in application code rather than repeating file paths or constructing URLs at call sites. `getUiIconUrl` prefixes Vite's configured `BASE_URL`, so the same registration works on root hosting and the GitHub Pages project site.

## Accessibility

`UiIcon` renders an empty-alt, `aria-hidden` image because it is decorative. The surrounding button or link must still provide a clear accessible name through visible text or an explicit ARIA label. Do not use the icon itself as the only accessible label.

## Styling

Size and colour the SVG through the consuming control's CSS class. Keep source SVGs as the authored asset; use CSS filters for presentation-specific tinting instead of duplicating or editing the same icon for each control.
