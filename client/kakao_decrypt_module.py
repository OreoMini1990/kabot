"""
⚠️ 복호화 로직 모듈 (절대 수정 금지) ⚠️
===========================================

이 모듈은 카카오톡 메시지 복호화의 핵심 로직을 담고 있습니다.
복호화 로직은 프로젝트의 가장 중요한 핵심 기능이므로 절대 수정하면 안 됩니다.

⚠️ 경고: 이 파일의 내용을 수정하지 마세요! ⚠️

사용법:
    from kakao_decrypt_module import decrypt_message, decrypt_kakaotalk_message
    
    decrypted = decrypt_message(encrypted_text, v_field, user_id, enc_type)

===========================================
"""

import json
import base64
import hashlib
import math
from Crypto.Cipher import AES

# 카카오톡 복호화 상수 (Java 코드에서 가져옴)
# IV: signed byte 배열을 unsigned로 변환 (-36 -> 220, -11 -> 245, -32 -> 224, -31 -> 225)
KAKAO_IV = bytes([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53])
KAKAO_PASSWORD = bytes([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6])

def incept(n):
    """
    Reimplementation of com.kakao.talk.dream.Projector.incept() from libdream.so
    encType 31 (실제로는 830819)에 대한 특별한 처리
    """
    dict1 = ['adrp.ldrsh.ldnp', 'ldpsw', 'umax', 'stnp.rsubhn', 'sqdmlsl', 'uqrshl.csel', 'sqshlu', 'umin.usubl.umlsl', 'cbnz.adds', 'tbnz',
             'usubl2', 'stxr', 'sbfx', 'strh', 'stxrb.adcs', 'stxrh', 'ands.urhadd', 'subs', 'sbcs', 'fnmadd.ldxrb.saddl',
             'stur', 'ldrsb', 'strb', 'prfm', 'ubfiz', 'ldrsw.madd.msub.sturb.ldursb', 'ldrb', 'b.eq', 'ldur.sbfiz', 'extr',
             'fmadd', 'uqadd', 'sshr.uzp1.sttrb', 'umlsl2', 'rsubhn2.ldrh.uqsub', 'uqshl', 'uabd', 'ursra', 'usubw', 'uaddl2',
             'b.gt', 'b.lt', 'sqshl', 'bics', 'smin.ubfx', 'smlsl2', 'uabdl2', 'zip2.ssubw2', 'ccmp', 'sqdmlal',
             'b.al', 'smax.ldurh.uhsub', 'fcvtxn2', 'b.pl']
    dict2 = ['saddl', 'urhadd', 'ubfiz.sqdmlsl.tbnz.stnp', 'smin', 'strh', 'ccmp', 'usubl', 'umlsl', 'uzp1', 'sbfx',
             'b.eq', 'zip2.prfm.strb', 'msub', 'b.pl', 'csel', 'stxrh.ldxrb', 'uqrshl.ldrh', 'cbnz', 'ursra', 'sshr.ubfx.ldur.ldnp',
             'fcvtxn2', 'usubl2', 'uaddl2', 'b.al', 'ssubw2', 'umax', 'b.lt', 'adrp.sturb', 'extr', 'uqshl',
             'smax', 'uqsub.sqshlu', 'ands', 'madd', 'umin', 'b.gt', 'uabdl2', 'ldrsb.ldpsw.rsubhn', 'uqadd', 'sttrb',
             'stxr', 'adds', 'rsubhn2.umlsl2', 'sbcs.fmadd', 'usubw', 'sqshl', 'stur.ldrsh.smlsl2', 'ldrsw', 'fnmadd', 'stxrb.sbfiz',
             'adcs', 'bics.ldrb', 'l1ursb', 'subs.uhsub', 'ldurh', 'uabd', 'sqdmlal']
    word1 = dict1[n % len(dict1)]
    word2 = dict2[(n + 31) % len(dict2)]
    return word1 + '.' + word2

KAKAO_PREFIXES = ["", "", "12", "24", "18", "30", "36", "12", "48", "7", "35", "40", "17", "23", "29",
                  "isabel", "kale", "sulli", "van", "merry", "kyle", "james", "maddux", "tony", "hayden",
                  "paul", "elijah", "dorothy", "sally", "bran", incept(830819), "veil"]

# 테스트된 kakaodecrypt 모듈 import 시도
try:
    import sys
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    from kakaodecrypt import KakaoDecrypt
    KAKAODECRYPT_AVAILABLE = True
except ImportError:
    KAKAODECRYPT_AVAILABLE = False

# Crypto 모듈 확인
try:
    from Crypto.Cipher import AES
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

def generate_salt(user_id, enc_type):
    """
    Salt 생성 (Iris KakaoDecrypt.kt 기반)
    
    Args:
        user_id: 카카오톡 사용자 ID
        enc_type: 암호화 타입 (기본값 31)
    
    Returns:
        Salt 바이트 배열 (16바이트)
    """
    if user_id <= 0:
        return b'\0' * 16
    
    if enc_type < 0 or enc_type >= len(KAKAO_PREFIXES):
        return b'\0' * 16
    
    prefix = KAKAO_PREFIXES[enc_type]
    s = (prefix + str(user_id))[:16]
    s = s + "\0" * (16 - len(s))
    return s.encode("utf-8")

def generate_secret_key(salt):
    """
    PKCS12 키 유도 (Iris KakaoDecrypt.kt 기반)
    
    Args:
        salt: Salt 바이트 배열
    
    Returns:
        Secret key 바이트 배열 (32바이트)
    """
    password = (KAKAO_PASSWORD + b'\0').decode('ascii').encode('utf-16-be')
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
    dkeySize = 32
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
        for _ in range(1, 2):  # iterations = 2
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
            dKey[start : start + write_len] = A[0 : write_len]
    
    return bytes(dKey)

def decrypt_kakaotalk_message(encrypted_text, user_id, enc_type=31, debug=False):
    """
    카카오톡 메시지 복호화 (테스트된 kakaodecrypt 모듈 사용)
    
    Args:
        encrypted_text: base64로 인코딩된 암호화된 메시지
        user_id: 카카오톡 사용자 ID (chatLog의 userId)
        enc_type: 암호화 타입 (기본값 31)
        debug: 디버그 로그 출력 여부
    
    Returns:
        복호화된 메시지 문자열 또는 None
    """
    if not CRYPTO_AVAILABLE:
        if debug:
            print(f"[복호화] CRYPTO_AVAILABLE=False, 복호화 불가")
        return None
    
    # 테스트된 kakaodecrypt 모듈 사용 (우선)
    if KAKAODECRYPT_AVAILABLE:
        try:
            # 빈 메시지 체크
            if not encrypted_text or encrypted_text == "{}" or encrypted_text == "[]":
                if debug:
                    print(f"[복호화] 빈 메시지 또는 특수 문자")
                return encrypted_text
            
            if debug:
                print(f"[복호화] kakaodecrypt 모듈 사용: user_id={user_id}, enc_type={enc_type}, 텍스트 길이={len(encrypted_text)}")
            
            # 테스트된 KakaoDecrypt.decrypt() 사용
            result = KakaoDecrypt.decrypt(user_id, enc_type, encrypted_text)
            
            if result:
                if debug:
                    print(f"[복호화] 성공: 복호화된 텍스트 길이={len(result)}")
                return result
            else:
                if debug:
                    print(f"[복호화] 실패: KakaoDecrypt.decrypt()가 None 반환")
                return None
        except Exception as e:
            if debug:
                print(f"[복호화] kakaodecrypt 모듈 오류: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
            # 폴백: 기존 로직 사용
            pass
    
    # 폴백: 기존 자체 구현 로직 (kakaodecrypt 모듈이 없거나 실패한 경우)
    try:
        # 빈 메시지 체크
        if not encrypted_text or encrypted_text == "{}" or encrypted_text == "[]":
            if debug:
                print(f"[복호화] 빈 메시지 또는 특수 문자")
            return encrypted_text
        
        if debug:
            print(f"[복호화] 자체 구현 사용: user_id={user_id}, enc_type={enc_type}, 텍스트 길이={len(encrypted_text)}")
        
        # Salt 생성
        salt = generate_salt(user_id, enc_type)
        if debug:
            print(f"[복호화] Salt 생성 완료: {salt.hex()[:16]}...")
        
        # SecretKey 생성 (PKCS12 키 유도 방식 - Iris KakaoDecrypt.kt 기반)
        secret_key = generate_secret_key(salt)
        if debug:
            print(f"[복호화] SecretKey 생성 완료: {secret_key.hex()[:16]}...")
        
        # AES/CBC/NoPadding 복호화 (Iris 방식)
        cipher = AES.new(secret_key, AES.MODE_CBC, KAKAO_IV)
        
        # Base64 디코딩
        decoded_bytes = base64.b64decode(encrypted_text)
        
        if len(decoded_bytes) == 0:
            if debug:
                print(f"[복호화] 빈 암호문")
            return encrypted_text
        
        # 복호화 (Iris 방식: cipher.doFinal() with BadPaddingException handling)
        try:
            padded = cipher.decrypt(decoded_bytes)
        except Exception as e:
            # Iris 코드: BadPaddingException catch 후 원본 반환
            if debug:
                print(f"[복호화] BadPaddingException 또는 복호화 오류: {type(e).__name__}: {e}")
                print(f"[복호화] 잘못된 키 또는 데이터일 수 있습니다. 원본 ciphertext 반환")
            return encrypted_text
        
        # PKCS5Padding 제거
        try:
            if len(padded) == 0:
                if debug:
                    print(f"[복호화] 경고: 복호화된 데이터가 비어있음")
                return encrypted_text
            
            padding_length = padded[-1] & 0xff
            
            if debug:
                print(f"[복호화] 패딩 확인: padded 길이={len(padded)}, 마지막 바이트={padded[-1]}, padding_length={padding_length}")
            
            if padding_length <= 0 or padding_length > 16:
                if debug:
                    print(f"[복호화] 실패: 잘못된 패딩 길이 ({padding_length})")
                return None
            
            if padding_length > len(padded):
                if debug:
                    print(f"[복호화] 실패: 패딩 길이({padding_length})가 데이터 길이({len(padded)})보다 큼")
                return None
            
            plaintext = padded[:-padding_length]
            
            if debug:
                print(f"[복호화] PKCS5 패딩 제거: padding_length={padding_length}, plaintext 길이={len(plaintext)}")
            
            if len(plaintext) == 0:
                if debug:
                    print(f"[복호화] 실패: 패딩 제거 후 길이가 0")
                return None
                
        except (IndexError, ValueError) as e:
            if debug:
                print(f"[복호화] 패딩 제거 실패: {e}")
            return None
        
        # UTF-8 디코딩
        try:
            decrypted_text = plaintext.decode('utf-8')
            
            # 복호화된 메시지가 유효한 텍스트인지 확인
            has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted_text)
            if has_control_chars:
                if debug:
                    print(f"[복호화] 경고: 제어 문자 포함, 바이너리 데이터일 수 있음")
                control_char_count = sum(1 for c in decrypted_text if ord(c) < 32 and c not in '\n\r\t')
                if control_char_count > len(decrypted_text) * 0.1:  # 10% 이상이면 실패
                    if debug:
                        print(f"[복호화] 실패: 제어 문자 비율이 너무 높음 ({control_char_count}/{len(decrypted_text)})")
                    return None
            
            if debug:
                print(f"[복호화] 성공: 복호화된 텍스트 길이={len(decrypted_text)}")
            
            return decrypted_text
        except UnicodeDecodeError as e:
            if debug:
                print(f"[복호화] UTF-8 디코딩 실패: {e}")
            return None
        
    except Exception as e:
        if debug:
            print(f"[복호화] 오류 발생: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
        return None

def decrypt_message(encrypted_message, v_field=None, user_id=None, enc_type=31, debug=False):
    """
    암호화된 메시지 복호화 시도
    
    1. v_field에서 enc 추출
    2. 카카오톡 복호화 로직 시도 (user_id가 있는 경우)
    3. base64 디코딩 시도
    
    Args:
        encrypted_message: 암호화된 메시지 (base64 문자열)
        v_field: v 필드 (JSON 문자열, enc 정보 포함)
        user_id: 카카오톡 사용자 ID
        enc_type: 암호화 타입 (기본값 31)
        debug: 디버그 로그 출력 여부
    
    Returns:
        복호화된 메시지 문자열 또는 None
    """
    if not encrypted_message:
        return None
    
    # 1. v_field에서 enc 추출
    if v_field and isinstance(v_field, str):
        try:
            v_parsed = json.loads(v_field)
            if isinstance(v_parsed, dict) and "enc" in v_parsed:
                v_enc_type = v_parsed["enc"]
                if v_enc_type is not None:
                    enc_type = v_enc_type
                    if debug:
                        print(f"[복호화] v 필드에서 enc 추출: {enc_type}")
        except (json.JSONDecodeError, TypeError, KeyError):
            # JSON 파싱 실패 시 기존 enc_type 사용
            pass
    
    # 2. 카카오톡 복호화 로직 시도 (user_id가 있는 경우)
    if CRYPTO_AVAILABLE and user_id:
        try:
            decrypted = decrypt_kakaotalk_message(encrypted_message, user_id, enc_type, debug=debug)
            if decrypted:
                return decrypted
        except Exception as e:
            if debug:
                print(f"[복호화] decrypt_kakaotalk_message 오류: {type(e).__name__}: {e}")
            pass
    
    # 3. base64 디코딩 시도 (간단한 경우)
    try:
        if isinstance(encrypted_message, str):
            decoded_bytes = base64.b64decode(encrypted_message)
            # UTF-8로 디코딩 시도
            try:
                decrypted = decoded_bytes.decode('utf-8')
                # 유효한 텍스트인지 확인 (base64만 있는 경우 제외)
                if decrypted and not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in decrypted[:50]):
                    return decrypted
            except UnicodeDecodeError:
                pass
    except Exception:
        pass
    
    return None






