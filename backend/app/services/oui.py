# Minimal OUI stub; extend later with a fuller table if needed
OUI_TABLE: dict[str, str] = {
    "00:50:56": "VMware",
    "b8:27:eb": "Raspberry Pi",
    "dc:a6:32": "Raspberry Pi",
}


def lookup_vendor(mac: str) -> str | None:
    prefix = mac.lower().replace("-", ":")[:8]
    return OUI_TABLE.get(prefix)
