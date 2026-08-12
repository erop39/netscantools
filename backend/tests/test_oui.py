"""OUI parse / lookup tests (no live IEEE download)."""

from pathlib import Path

import pytest

from app.services import oui as oui_mod

SAMPLE_IEEE = """
OUI/MA-L                                            Organization
company_id                                          Organization
                                                            Address

00-50-56   (hex)		VMware, Inc.
005056     (base 16)		VMware, Inc.
				3401 Hillview Avenue
				Palo Alto  CA  94304
				US

F0-A6-54   (hex)		CLOUD NETWORK TECHNOLOGY SINGAPORE PTE. LTD.
F0A654     (base 16)		CLOUD NETWORK TECHNOLOGY SINGAPORE PTE. LTD.
				B22 Building,C37 No.177 Jinkang Road
				Singapore    999999
				SG

B8-27-EB   (hex)		Raspberry Pi Foundation
B827EB     (base 16)		Raspberry Pi Foundation
				Cambridge
				UK
"""


@pytest.fixture(autouse=True)
def _reset_oui(tmp_path, monkeypatch):
    oui_mod.reset_oui_cache_for_tests()
    cache = tmp_path / "oui.txt"
    monkeypatch.setattr(oui_mod, "oui_cache_path", lambda: cache)
    yield
    oui_mod.reset_oui_cache_for_tests()


def test_parse_ieee_oui_extracts_hex_lines():
    table = oui_mod.parse_ieee_oui(SAMPLE_IEEE)
    assert table["00:50:56"] == "VMware, Inc."
    assert "f0:a6:54" in table
    assert "CLOUD NETWORK" in table["f0:a6:54"]
    assert table["b8:27:eb"].startswith("Raspberry")


def test_mac_prefix_normalizes():
    assert oui_mod.mac_prefix("F0-A6-54-F9-A1-36") == "f0:a6:54"
    assert oui_mod.mac_prefix("aa:bb:cc:dd:ee:ff") == "aa:bb:cc"
    assert oui_mod.mac_prefix("bad") is None


def test_lookup_from_cache_file(tmp_path):
    path = oui_mod.oui_cache_path()
    path.write_text(SAMPLE_IEEE, encoding="utf-8")
    # no download
    n = oui_mod.ensure_oui_db(allow_download=False)
    assert n >= 3
    assert oui_mod.lookup_vendor("f0:a6:54:f9:a1:36") is not None
    assert "CLOUD" in (oui_mod.lookup_vendor("f0:a6:54:f9:a1:36") or "")
    assert oui_mod.lookup_vendor("00:50:56:12:34:56") == "VMware, Inc."


def test_lookup_stub_when_no_cache():
    # allow_download False, empty cache → stub only
    n = oui_mod.ensure_oui_db(allow_download=False)
    assert n >= len(oui_mod.STUB_TABLE)
    assert oui_mod.lookup_vendor("b8:27:eb:00:00:01") == "Raspberry Pi"
    assert oui_mod.lookup_vendor("de:ad:be:ef:00:00") is None


def test_backfill_device_vendors(tmp_path):
    path = oui_mod.oui_cache_path()
    path.write_text(SAMPLE_IEEE, encoding="utf-8")
    oui_mod.ensure_oui_db(allow_download=False)

    class Fake:
        def __init__(self, mac, vendor=None):
            self.mac = mac
            self.vendor = vendor

    devices = [
        Fake("f0:a6:54:f9:a1:36"),
        Fake("aa:bb:cc:dd:ee:ff", vendor="Already"),
        Fake("00:50:56:aa:bb:cc"),
    ]
    n = oui_mod.backfill_device_vendors(devices)
    assert n == 2
    assert devices[0].vendor and "CLOUD" in devices[0].vendor
    assert devices[1].vendor == "Already"
    assert devices[2].vendor == "VMware, Inc."
