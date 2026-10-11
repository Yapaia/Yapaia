"""Pure-Python Unix crypt(3) for the schemes GL.iNet firmware 4.x uses at login.

The router's ``challenge`` answer contains ``alg`` which selects the scheme:
``1`` = md5_crypt (``$1$``), ``5`` = sha256_crypt (``$5$``), ``6`` = sha512_crypt (``$6$``).

Python 3.13 removed the stdlib ``crypt`` module, so the reference algorithms
(Poul-Henning Kamp's MD5-crypt, Ulrich Drepper's SHA-crypt) are implemented
here with ``hashlib`` only. Adapted from github.com/metril/ha-glinet (MIT License, (c) 2026 jpranathar).
"""

from __future__ import annotations

import hashlib

_B64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def _b64_from_24bit(b2: int, b1: int, b0: int, n: int) -> str:
    w = (b2 << 16) | (b1 << 8) | b0
    out = []
    for _ in range(n):
        out.append(_B64[w & 0x3F])
        w >>= 6
    return "".join(out)


def md5_crypt(password: str, salt: str) -> str:
    """Return the ``$1$`` md5_crypt string."""
    pw = password.encode()
    salt = salt[:8]
    salt_b = salt.encode()

    ctx = hashlib.md5(pw + b"$1$" + salt_b)
    alt = hashlib.md5(pw + salt_b + pw).digest()
    for i in range(len(pw), 0, -16):
        ctx.update(alt[: min(16, i)])
    i = len(pw)
    while i:
        ctx.update(b"\x00" if i & 1 else pw[:1])
        i >>= 1
    final = ctx.digest()

    for i in range(1000):
        c = hashlib.md5()
        c.update(pw if i & 1 else final)
        if i % 3:
            c.update(salt_b)
        if i % 7:
            c.update(pw)
        c.update(final if i & 1 else pw)
        final = c.digest()

    out = (
        _b64_from_24bit(final[0], final[6], final[12], 4)
        + _b64_from_24bit(final[1], final[7], final[13], 4)
        + _b64_from_24bit(final[2], final[8], final[14], 4)
        + _b64_from_24bit(final[3], final[9], final[15], 4)
        + _b64_from_24bit(final[4], final[10], final[5], 4)
        + _b64_from_24bit(0, 0, final[11], 2)
    )
    return f"$1${salt}${out}"


_SHA256_ORDER = [
    (0, 10, 20), (21, 1, 11), (12, 22, 2), (3, 13, 23), (24, 4, 14),
    (15, 25, 5), (6, 16, 26), (27, 7, 17), (18, 28, 8), (9, 19, 29),
]  # fmt: skip
_SHA512_ORDER = [
    (0, 21, 42), (22, 43, 1), (44, 2, 23), (3, 24, 45), (25, 46, 4),
    (47, 5, 26), (6, 27, 48), (28, 49, 7), (50, 8, 29), (9, 30, 51),
    (31, 52, 10), (53, 11, 32), (12, 33, 54), (34, 55, 13), (56, 14, 35),
    (15, 36, 57), (37, 58, 16), (59, 17, 38), (18, 39, 60), (40, 61, 19),
    (62, 20, 41),
]  # fmt: skip


def _sha_crypt(password: str, salt: str, bits: int) -> str:
    if bits == 256:
        hfun, magic, dlen, order = hashlib.sha256, "$5$", 32, _SHA256_ORDER
    else:
        hfun, magic, dlen, order = hashlib.sha512, "$6$", 64, _SHA512_ORDER

    pw = password.encode()
    pw_len = len(pw)
    salt = salt[:16]
    salt_b = salt.encode()

    b = hfun(pw + salt_b + pw).digest()
    a = hfun(pw + salt_b)
    for i in range(pw_len, 0, -dlen):
        a.update(b[: min(dlen, i)])
    i = pw_len
    while i:
        a.update(b if i & 1 else pw)
        i >>= 1
    a_digest = a.digest()

    dp = hfun()
    for _ in range(pw_len):
        dp.update(pw)
    dp_digest = dp.digest()
    p = b"".join(dp_digest[: min(dlen, pw_len - i)] for i in range(0, pw_len, dlen))

    ds = hfun()
    for _ in range(16 + a_digest[0]):
        ds.update(salt_b)
    ds_digest = ds.digest()
    s = b"".join(
        ds_digest[: min(dlen, len(salt_b) - i)] for i in range(0, len(salt_b), dlen)
    )

    c = a_digest
    for i in range(5000):
        ctx = hfun()
        ctx.update(p if i & 1 else c)
        if i % 3:
            ctx.update(s)
        if i % 7:
            ctx.update(p)
        ctx.update(c if i & 1 else p)
        c = ctx.digest()

    out = "".join(_b64_from_24bit(c[x], c[y], c[z], 4) for x, y, z in order)
    if bits == 256:
        out += _b64_from_24bit(0, c[31], c[30], 3)
    else:
        out += _b64_from_24bit(0, 0, c[63], 2)
    return f"{magic}{salt}${out}"


def crypt_password(password: str, alg: int, salt: str) -> str:
    """Return the crypt(3) string for the GL.iNet ``alg`` and ``salt``."""
    if alg == 1:
        return md5_crypt(password, salt)
    if alg == 5:
        return _sha_crypt(password, salt, 256)
    if alg == 6:
        return _sha_crypt(password, salt, 512)
    raise ValueError(f"Unsupported crypt alg: {alg}")
