# Inventory Card Device Identity

## Goal

Show concise device identity on each inventory card: icon, vendor, and IP address without increasing visual clutter.

## Layout

- Place a 36 px device icon on the left of the card content.
- Keep the inventory item title as the primary line.
- Show linked device name as the existing detail-page link.
- Show one muted secondary line containing vendor and IP, separated by a middle dot.
- Preserve existing serial, category, purchase date, notes, drag behavior, and actions.

## Data and Fallbacks

- Reuse the `Device` records already loaded by the Inventory page; add no API request or backend field.
- Use the linked device's configured icon through the existing `DeviceIcon` component.
- When no configured icon exists, use `DeviceIcon`'s default icon.
- Show `Unidentified` when vendor is missing or the item has no linked device.
- Show IP only when present; do not render a placeholder for missing IP.
- Keep the device detail link only when `item.device_id` resolves to a device.

## Styling

- Use existing inventory-card colors and spacing.
- Keep icon visually subordinate to the item title.
- Allow long vendor/IP text to truncate without widening the card.
- Avoid new badges or decorative effects.

## Verification

- Frontend build and lint complete successfully.
- Browser check confirms linked and unlinked cards render correctly at desktop and narrow widths.
