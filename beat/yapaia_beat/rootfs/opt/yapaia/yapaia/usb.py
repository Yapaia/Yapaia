"""USB helpers for RTL-SDR sticks: detect and reset a hung stick."""

from __future__ import annotations

import ctypes
import ctypes.util
import fcntl
import logging
import os
from pathlib import Path

_LOGGER = logging.getLogger(__name__)

# RTL2832U based sticks (Realtek reference IDs, most common clones)
RTL_IDS = {("0bda", "2838"), ("0bda", "2832")}
USBDEVFS_RESET = 0x5514  # _IO('U', 20)
SYSFS = Path("/sys/bus/usb/devices")


def find_sticks() -> list[Path]:
    """Device nodes (/dev/bus/usb/BBB/DDD) of connected RTL-SDR sticks."""
    nodes = []
    for dev in SYSFS.glob("*") if SYSFS.exists() else []:
        try:
            ids = ((dev / "idVendor").read_text().strip(), (dev / "idProduct").read_text().strip())
            if ids not in RTL_IDS:
                continue
            bus = int((dev / "busnum").read_text())
            num = int((dev / "devnum").read_text())
        except (OSError, ValueError):
            continue
        nodes.append(Path(f"/dev/bus/usb/{bus:03d}/{num:03d}"))
    return nodes


def stick_names() -> dict[int, str]:
    """Manufacturer and product of each stick, by librtlsdr index (the order
    the receivers use -- not necessarily the sysfs order)."""
    try:
        lib = ctypes.CDLL(ctypes.util.find_library("rtlsdr") or "librtlsdr.so.0")
        names = {}
        for i in range(lib.rtlsdr_get_device_count()):
            maker, product, serial = (ctypes.create_string_buffer(256) for _ in range(3))
            if lib.rtlsdr_get_device_usb_strings(i, maker, product, serial) == 0:
                names[i] = " ".join(b.value.decode(errors="replace") for b in (maker, product) if b.value)
        return names
    except (OSError, AttributeError) as err:
        _LOGGER.debug("Stick names not available: %s", err)
        return {}


def reset_sticks() -> int:
    """USB-reset all RTL-SDR sticks (like unplugging). Returns the count."""
    done = 0
    for node in find_sticks():
        try:
            fd = os.open(node, os.O_WRONLY)
            try:
                fcntl.ioctl(fd, USBDEVFS_RESET, 0)
            finally:
                os.close(fd)
            done += 1
            _LOGGER.warning("USB reset of RTL-SDR stick %s", node)
        except OSError as err:
            _LOGGER.warning("USB reset of %s failed: %s", node, err)
    return done
