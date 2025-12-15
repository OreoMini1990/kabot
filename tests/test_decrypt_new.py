import base64, hashlib
from Crypto.Cipher import AES


def incept(n):
    dict1 = ["adrp.ldrsh.ldnp", "ldpsw", "umax", "stnp.rsubhn", "sqdmlsl", "uqrshl.csel", "sqshlu", "umin.usubl.umlsl",
             "cbnz.adds", "tbnz", "usubl2", "stxr", "sbfx", "strh", "stxrb.adcs", "stxrh", "ands.urhadd", "subs", "sbcs",
             "fnmadd.ldxrb.saddl", "stur", "ldrsb", "strb", "prfm", "ubfiz", "ldrsw.madd.msub.sturb.ldursb", "ldrb",
             "b.eq", "ldur.sbfiz", "extr", "fmadd", "uqadd", "sshr.uzp1.sttrb", "umlsl2", "rsubhn2.ldrh.uqsub", "uqshl",
             "uabd", "ursra", "usubw", "uaddl2", "b.gt", "b.lt", "sqshl", "bics", "smin.ubfx", "smlsl2", "uabdl2",
             "zip2.ssubw2", "ccmp", "sqdmlal", "b.al", "smax.ldurh.uhsub", "fcvtxn2", "b.pl"]
    dict2 = ["saddl", "urhadd", "ubfiz.sqdmlsl.tbnz.stnp", "smin", "strh", "ccmp", "usubl", "umlsl", "uzp1", "sbfx",
             "b.eq", "zip2.prfm.strb", "msub", "b.pl", "csel", "stxrh.ldxrb", "uqrshl.ldrh", "cbnz", "ursra",
             "sshr.ubfx.ldur.ldnp", "fcvtxn2", "usubl2", "uaddl2", "b.al", "ssubw2", "umax", "b.lt", "adrp.sturb", "extr",
             "uqshl", "smax", "uqsub.sqshlu", "ands", "madd", "umin", "b.gt", "uabdl2", "ldrsb.ldpsw.rsubhn", "uqadd",
             "sttrb", "stxr", "adds", "rsubhn2.umlsl2", "sbcs.fmadd", "usubw", "sqshl", "stur.ldrsh.smlsl2", "ldrsw",
             "fnmadd", "stxrb.sbfiz", "adcs", "bics.ldrb", "l1ursb", "subs.uhsub", "ldurh", "uabd", "sqdmlal"]
    return dict1[n % len(dict1)] + '.' + dict2[(n + 31) % len(dict2)]


KAKAO_IV = bytes([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53])
KAKAO_PASSWORD = bytes([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6])
KAKAO_PREFIXES = ["", "", "12", "24", "18", "30", "36", "12", "48", "7", "35", "40", "17", "23", "29",
                  "isabel", "kale", "sulli", "van", "merry", "kyle", "james", "maddux", "tony", "hayden",
                  "paul", "elijah", "dorothy", "sally", "bran", incept(830819), "veil"]


def gen_salt(user_id, enc):
    s = (KAKAO_PREFIXES[enc] + str(user_id))[:16]
    s = s + "\0" * (16 - len(s))
    return s.encode("utf-8")


def pkcs12_key(password, salt, iterations=2, dkeySize=32):
    """BouncyCastle PKCS12 방식 (Iris/KakaoDecrypt와 동일). 마지막 블록은 remaining 길이만 복사."""
    password = (password + b'\0').decode('ascii').encode('utf-16-be')
    import math, hashlib
    v, u = 64, 20
    D = bytearray([1] * v)
    S = bytearray(v * math.ceil(len(salt) / v))
    for i in range(len(S)):
        S[i] = salt[i % len(salt)]
    P = bytearray(v * math.ceil(len(password) / v))
    for i in range(len(P)):
        P[i] = password[i % len(password)]
    I = bytearray(S + P)
    B = bytearray(v)
    dKey = bytearray(dkeySize)
    c = math.ceil((dkeySize + u - 1) / u)

    def pkcs16adjust(a, aOff, b):
        x = (b[-1] & 0xff) + (a[aOff + len(b) - 1] & 0xff) + 1
        a[aOff + len(b) - 1] = x % 256
        x >>= 8
        for k in range(len(b) - 2, -1, -1):
            x += (b[k] & 0xff) + (a[aOff + k] & 0xff)
            a[aOff + k] = x % 256
            x >>= 8

    for i in range(1, c + 1):
        h = hashlib.sha1()
        h.update(D)
        h.update(I)
        A = bytearray(h.digest())
        for _ in range(1, iterations):
            h = hashlib.sha1()
            h.update(A)
            A = bytearray(h.digest())
        for j in range(v):
            B[j] = A[j % len(A)]
        for j in range(len(I) // v):
            pkcs16adjust(I, j * v, B)
        start = (i - 1) * u
        remaining = len(dKey) - start
        if remaining > 0:
            write_len = min(remaining, len(A))
            dKey[start:start + write_len] = A[:write_len]
    return bytes(dKey)


def decrypt(cipher_b64, user_id, enc=31):
    salt = gen_salt(user_id, enc)
    key = pkcs12_key(KAKAO_PASSWORD, salt, iterations=2, dkeySize=32)
    ct = base64.b64decode(cipher_b64)
    # AES/CBC/NoPadding: ciphertext 길이는 16의 배수여야 함
    if len(ct) == 0 or len(ct) % 16 != 0:
        return None
    aes = AES.new(key, AES.MODE_CBC, KAKAO_IV)
    try:
        padded = aes.decrypt(ct)
    except ValueError:
        return None
    pad = padded[-1]
    if pad <= 0 or pad > 16 or pad > len(padded):
        return None
    pt = padded[:-pad]
    try:
        return pt.decode("utf-8")
    except:
        return None


if __name__ == "__main__":
    samples = [
        (12345678, 31, 'q2R8bEZX8gA7xQ2r9/8vQw=='),
        (87654321, 31, 'U29tZUJhc2U2NEVuY29kZWRNZXNzYWdl'),
        (12345678, 31, 'VGVzdE1zZyE='),
    ]
    for uid, enc, c in samples:
        print(uid, enc, decrypt(c, uid, enc))

