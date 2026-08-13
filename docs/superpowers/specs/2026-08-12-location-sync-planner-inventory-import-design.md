# Shared Locations and Planner Inventory Import

## Goals

1. Use one location catalog for discovered devices and manual inventory items.
2. Import every kind of `InventoryItem` into Planner, including items without a linked network device.

## Canonical Location Catalog

`InventoryLocation` remains the canonical catalog. `Device.location` and `InventoryItem.location` remain nullable text values for compatibility and for preserving unlisted legacy labels.

- `GET /api/devices/locations` returns the ordered `InventoryLocation` catalog rather than deriving values from devices.
- Assigning a non-empty location through `PATCH /api/devices/{id}` automatically registers the label in `InventoryLocation` when absent.
- Creating or updating an inventory item keeps the existing automatic registration behavior.
- Renaming a catalog location updates exact matching values in both `Device.location` and `InventoryItem.location` in the same transaction.
- Deleting a catalog location deletes only the catalog row. Existing device and item text remains and becomes unlisted.
- Device location editors and filters consume the canonical catalog. Existing unlisted values remain visible on records but are not silently recreated by reads.

## Planner Provenance

Add nullable `PlanSlot.inventory_item_id` referencing `inventory_items.id` with `ON DELETE SET NULL`. Enforce uniqueness per plan and inventory item so one item cannot be imported twice into the same plan. Existing slots remain valid with `NULL` provenance.

SQLite schema migration adds the column and a unique index without replacing existing planner data.

Planner slot output includes `inventory_item_id`. Planner JSON export/import also preserves it when valid, while remaining backward compatible with older files that omit it.

## Inventory Candidates

Add a dedicated Planner inventory-candidates endpoint. It returns inventory items not already represented by `PlanSlot.inventory_item_id`, enriched with their linked device when available:

- item ID, title, category, serial, location, notes;
- linked device ID, MAC, IP, hostname, name, icon when present;
- a boolean indicating whether the item is linked.

The existing device candidates endpoint and device import UI remain available for backward compatibility.

## Import Behavior

Add an atomic bulk endpoint accepting selected inventory item IDs.

For linked items:

- `inventory_item_id` is set;
- `device_mac` comes from the linked device;
- `planned_ip` uses the live device IP when it is valid for the current plan, otherwise remains empty;
- `hostname_hint` uses hostname, then device name;
- `role_label` uses inventory title.

For unlinked items:

- create a reserve slot;
- set `inventory_item_id` and `role_label`;
- leave MAC, planned IP, and hostname empty.

For both kinds, compose slot notes from available category, serial, location, and item notes. Preserve useful source information without adding planner-only schema columns.

The import transaction validates all selected IDs first. Missing IDs, already imported items, duplicate linked MACs, or other uniqueness conflicts reject the entire request without partial slots.

## Planner UI

- Keep the existing device import control under a clearly labeled legacy/device section.
- Add `Import from inventory` with multi-select rows.
- Each row shows title, category/location, and linked or reserve status.
- `Import selected` imports all selected items in one request.
- Refresh plan and candidate lists after success; show imported count.

## Tests

- Device location assignment registers the canonical location.
- Location rename updates devices and inventory items atomically.
- Device location endpoint returns catalog order without mutating data.
- Linked inventory import creates a bound slot with provenance and mapped identity.
- Unlinked inventory import creates a reserve slot with provenance.
- Duplicate or invalid bulk import is atomic.
- Existing device candidate import and older plan import files remain supported.
- Frontend build, lint, and browser checks pass.
