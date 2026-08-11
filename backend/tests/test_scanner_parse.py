from app.services.scanner import parse_arp_a

SAMPLE = """
Interface: 192.168.1.5 --- 0x5
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-01     dynamic
  192.168.1.10          11-22-33-44-55-66     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
"""


def test_parse_arp_a():
    mapping = parse_arp_a(SAMPLE)
    assert mapping["192.168.1.1"] == "aa:bb:cc:dd:ee:01"
    assert mapping["192.168.1.10"] == "11:22:33:44:55:66"
    assert "192.168.1.255" not in mapping
