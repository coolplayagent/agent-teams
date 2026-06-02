from __future__ import annotations

from collections.abc import Callable
from http.server import SimpleHTTPRequestHandler
from http.server import ThreadingHTTPServer
from typing import cast

_BROWSER_SAFE_PORT_ATTEMPTS = 64
_CHROMIUM_UNSAFE_PORTS = frozenset(
    (
        1,
        7,
        9,
        11,
        13,
        15,
        17,
        19,
        20,
        21,
        22,
        23,
        25,
        37,
        42,
        43,
        53,
        69,
        77,
        79,
        87,
        95,
        101,
        102,
        103,
        104,
        109,
        110,
        111,
        113,
        115,
        117,
        119,
        123,
        135,
        137,
        139,
        143,
        161,
        179,
        389,
        427,
        465,
        512,
        513,
        514,
        515,
        526,
        530,
        531,
        532,
        540,
        548,
        554,
        556,
        563,
        587,
        601,
        636,
        989,
        990,
        993,
        995,
        1719,
        1720,
        1723,
        2049,
        3659,
        4045,
        5060,
        5061,
        6000,
        6566,
        *range(6665, 6670),
        6697,
        10080,
    )
)


def create_browser_safe_http_server(
    handler: Callable[..., SimpleHTTPRequestHandler],
) -> ThreadingHTTPServer:
    for _ in range(_BROWSER_SAFE_PORT_ATTEMPTS):
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        _, port = cast(tuple[str, int], server.server_address)
        if port not in _CHROMIUM_UNSAFE_PORTS:
            return server
        server.server_close()
    raise RuntimeError("Could not allocate a browser-safe test port.")
