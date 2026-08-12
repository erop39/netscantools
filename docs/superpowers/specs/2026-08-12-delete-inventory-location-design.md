# Delete Inventory Location Without Recreation

## Goal

Deleting an inventory location removes only its catalog entry. Inventory items keep their free-text `location` value, and the deleted catalog entry must not be recreated by subsequent reads.

## Design

- `DELETE /api/inventory/locations/{location_id}` continues deleting only the `InventoryLocation` row.
- `GET /api/inventory/locations` becomes a read-only query and no longer derives catalog rows from `InventoryItem.location`.
- Items whose location text has no matching catalog row remain unchanged. Existing frontend grouping renders them as an `unlisted` location section.
- Explicit item creation and item updates may continue registering new catalog locations. This change only removes implicit mutation from the list endpoint.

## Error Handling

Existing `404 Location not found` behavior remains unchanged. No new response shapes or status codes are introduced.

## Verification

Add an API regression test that creates an item linked by free text to a catalog location, deletes the catalog location, fetches locations, and verifies:

- the deleted catalog row stays absent;
- the inventory item's location text remains intact.

Run the targeted regression test, then the full backend test suite.
