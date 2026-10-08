# Responsive interface validation

The Tailwind 4 redesign changes presentation only. Candidature statistics and confirmed persistence remain unchanged.

## Review and verification

- TypeScript, production Vite build and all 37 existing tests passed against an exact staged checkout.
- Browser checks covered seven pages (including a candidature detail), light and dark themes, at 390, 768 and 1440 pixels. No global horizontal overflow was observed; wide tables scroll locally.
- Modal keyboard focus wraps, Escape closes, and the mobile navigation closes when following a link. Icon actions now have accessible names and stay visible without a hover device.
- Profile drafts survived a two-tab revision conflict and a server outage. Explicit synchronization followed by saving confirmed the draft after server restart.
- Theme preference is applied by a same-origin script before the application renders. Storage contains only the theme preference after legacy migration.
- Temporary fixture server and control tabs were closed. The real user database was not used.

## Limits

The existing large PDF parsing bundle warning remains. Browser checks do not constitute a formal WCAG audit. An independent PR review is still required before merging.
