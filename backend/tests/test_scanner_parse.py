from app.services.scanner import parse_arp_a
from app.services.winconsole import decode_console

SAMPLE = """
Interface: 192.168.1.5 --- 0x5
  Internet Address      Physical Address      Type
  192.168.1.1           aa-bb-cc-dd-ee-01     dynamic
  192.168.1.10          11-22-33-44-55-66     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
"""

# Russian Windows arp -a style (OEM-decoded)
SAMPLE_RU = """
Интерфейс: 192.168.1.126 --- 0xc
  адрес в Интернете      Физический адрес      Тип
  192.168.1.1           50-ff-20-d2-fa-37     динамический
  192.168.1.23          f0-a6-54-f9-a1-36     динамический
  192.168.1.255         ff-ff-ff-ff-ff-ff     статический
"""


def test_parse_arp_a():
    mapping = parse_arp_a(SAMPLE)
    assert mapping["192.168.1.1"] == "aa:bb:cc:dd:ee:01"
    assert mapping["192.168.1.10"] == "11:22:33:44:55:66"
    assert "192.168.1.255" not in mapping


def test_parse_arp_a_russian_labels():
    mapping = parse_arp_a(SAMPLE_RU)
    assert mapping["192.168.1.1"] == "50:ff:20:d2:fa:37"
    assert mapping["192.168.1.23"] == "f0:a6:54:f9:a1:36"
    assert "192.168.1.255" not in mapping


def test_decode_console_oem_bytes():
    # CP866 bytes for "Интерфейс" fragment often appear in arp -a on RU Windows
    raw = "Интерфейс: 192.168.1.1".encode("cp866")
    text = decode_console(raw)
    assert "192.168.1.1" in text
