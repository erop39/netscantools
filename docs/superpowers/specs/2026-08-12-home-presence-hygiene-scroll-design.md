# Home Presence Card and Hygiene Event Scrolling

## Home Presence

- Always render a dedicated `Who's home` card on Home.
- List only online devices marked with the `Who's home` flag.
- Show each person as a compact row with a green presence indicator, linked display name, and IP when available.
- Show `Nobody is home` when no marked device is online.
- Do not mix offline/away devices into this card.

## Hygiene Recent Events

- Keep the Recent events heading fixed in its card.
- Constrain only the event list to a 360 px viewport.
- Use contained vertical scrolling, stable scrollbar gutter, and a thin glass-themed scrollbar.
- Preserve full-width behavior on narrow screens without horizontal scrolling.

## Verification

- Frontend build and lint complete.
- Browser checks cover populated Home presence, Hygiene event-list overflow, mobile width, console, and accessibility.
- Changelog records both user-visible changes.
