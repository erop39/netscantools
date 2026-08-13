# Inventory Card Readable Information Hierarchy

## Goal

Make fully populated inventory cards easy to scan by separating fields and enforcing this visual priority:

1. title;
2. linked device;
3. category;
4. IP address;
5. vendor;
6. location;
7. purchase date;
8. notes.

## Layout

- Keep the device icon in a fixed left column.
- Place title at the top as the strongest text.
- Place the labeled linked-device link directly under title.
- Place category on its own line; append serial number as secondary text when present.
- Add breathing space before network identity.
- Render IP on its own monospace line, then vendor on a separate line.
- Render labeled location and purchase date as compact facts; wrap them when card width is narrow.
- Separate notes with a subtle divider and clamp them to two lines.
- Keep Edit/Delete actions in their existing right column.

## Fallbacks

- Missing linked device: show `Linked: Not linked` as muted text.
- Missing category: show `Uncategorized`.
- Missing IP: omit the IP row.
- Missing vendor: show `Unidentified`.
- Missing location or purchase date: omit the corresponding fact.
- Missing notes: omit the notes section.

## Styling

- Use labels only where field meaning is not self-evident: Linked, Location, Purchased, Notes.
- Do not combine IP and vendor with middle dots.
- Preserve truncation for long title, linked-device name, category, IP, and vendor.
- Maintain WCAG AA contrast and avoid card overflow at narrow widths.

## Verification

- Frontend build and lint complete.
- Browser checks cover full card, narrow viewport, overflow, console, and accessibility.
