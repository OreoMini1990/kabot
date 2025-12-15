#!/usr/bin/env python3
"""
실제 base64 암호화된 채팅방 이름 생성 스크립트
테스트용으로 "의운모"를 암호화하여 base64 문자열 생성
"""
import sys
import os

# kakaodecrypt 모듈 import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'client'))

try:
    from Crypto.Cipher import AES
    import base64
    import hashlib
    import math
    
    KAKAO_IV = bytes([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53])
    KAKAO_PASSWORD = bytes([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6])
    
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
    
    KAKAO_PREFIXES = ["", "", "12", "24", "18", "30", "36", "12", "48", "7", "35", "40", "17", "23", "29",
                      "isabel", "kale", "sulli", "van", "merry", "kyle", "james", "maddux", "tony", "hayden",
                      "paul", "elijah", "dorothy", "sally", "bran", incept(830819), "veil"]
    
    def gen_salt(user_id, enc):
        s = (KAKAO_PREFIXES[enc] + str(user_id))[:16]
        s = s + "\0" * (16 - len(s))
        return s.encode("utf-8")
    
    def pkcs12_key(password, salt, iterations=2, dkeySize=32):
        password = (password + b'\0').decode('ascii').encode('utf-16-be')
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
    
    def encrypt(plaintext, user_id, enc=31):
        """암호화 함수 (테스트용)"""
        salt = gen_salt(user_id, enc)
        key = pkcs12_key(KAKAO_PASSWORD, salt, iterations=2, dkeySize=32)
        
        # PKCS5 패딩 추가
        pt_bytes = plaintext.encode('utf-8')
        pad_len = 16 - (len(pt_bytes) % 16)
        padded = pt_bytes + bytes([pad_len] * pad_len)
        
        # AES 암호화
        aes = AES.new(key, AES.MODE_CBC, KAKAO_IV)
        ct = aes.encrypt(padded)
        
        # Base64 인코딩
        return base64.b64encode(ct).decode('utf-8')
    
    if __name__ == "__main__":
        my_user_id = 429744344
        room_name = "의운모"
        enc = 31
        
        print(f"[암호화 테스트]")
        print(f"  - 평문: \"{room_name}\"")
        print(f"  - user_id: {my_user_id}")
        print(f"  - enc: {enc}")
        
        encrypted = encrypt(room_name, my_user_id, enc)
        print(f"  - 암호화된 base64: \"{encrypted}\"")
        
        # 복호화 검증
        from kakaodecrypt import KakaoDecrypt
        decrypted = KakaoDecrypt.decrypt(my_user_id, enc, encrypted)
        print(f"  - 복호화 검증: \"{decrypted}\"")
        
        if decrypted == room_name:
            print(f"\n[✓ 성공] 암호화/복호화 검증 완료")
            print(f"\n생성된 base64 문자열을 sample_raw_message.json에 사용하세요:")
            print(f'    "room_name": "{encrypted}",')
            print(f'    "private_meta": "{{\\"name\\": \\"{encrypted}\\", \\"enc\\": {enc}}}"')
        else:
            print(f"\n[✗ 실패] 복호화 결과가 일치하지 않음")

except ImportError as e:
    print(f"[오류] 필요한 모듈을 찾을 수 없습니다: {e}")
    print("[해결] pip install pycryptodome 실행")

