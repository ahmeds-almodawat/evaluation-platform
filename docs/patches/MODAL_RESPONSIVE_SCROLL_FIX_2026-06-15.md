# Modal Responsive Scroll Fix - 2026-06-15

## Reason
Some popup/dialog windows could grow taller than the visible browser viewport. On laptops or when browser zoom is above 100%, users had to zoom out to reach confirmation/cancel buttons.

## Changes
- Updated the shared `DialogContent` component to use a viewport-safe max height.
- Updated the shared `AlertDialogContent` component to use a viewport-safe max height.
- Added internal scrolling to long dialogs.
- Added responsive viewport width so dialogs do not overflow horizontally.
- Added overscroll containment to keep scrolling inside the modal.

## Files changed
- `src/components/ui/dialog.tsx`
- `src/components/ui/alert-dialog.tsx`

## Safety
- No database changes.
- No evaluation logic changes.
- No import/export logic changes.
- Applies globally to existing dialogs without updating every popup one by one.

## Validation
- `npm run typecheck` passed.
- `npm run test -- --run` passed.
- `npm run lint` passed with existing warnings only.
- `npm run build` passed with existing large export chunk warning only.
