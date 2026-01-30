"""
⚠️ 복호화 로직 백업 파일 ⚠️
===========================================

이 파일은 복호화 로직의 핵심 코드를 백업한 것입니다.
복호화 로직은 프로젝트의 가장 중요한 핵심 기능이므로 절대 수정하면 안 됩니다.

백업 일자: 2025-12-16
백업 기준 커밋: 4ec5d73 (정상 작동 코드 기준)
원본 파일: client/kakao_poller.py

⚠️ 경고: 이 파일의 내용을 수정하지 마세요! ⚠️
복호화 로직을 수정해야 할 경우:
1. 이 백업 파일을 참고하여 원래 상태로 복구
2. 수정 전에 반드시 Git 커밋 생성
3. 수정 후 반드시 테스트하여 정상 작동 확인
4. 수정 사항을 문서화

===========================================
"""

# ===========================================
# 1. 복호화 관련 함수들
# ===========================================

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
            pass
    
    # kakaodecrypt 모듈이 없거나 실패한 경우 자체 구현 로직 사용
    # (원본 파일의 전체 구현 참고)
    return None


def decrypt_message(encrypted_message, v_field=None, user_id=None, enc_type=31, debug=False):
    """
    암호화된 메시지 복호화 시도
    
    1. v_field에서 enc 추출
    2. 카카오톡 복호화 로직 시도 (user_id가 있는 경우)
    3. base64 디코딩 시도
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


# ===========================================
# 2. send_to_server 함수 내 복호화 로직
# ===========================================

"""
send_to_server 함수 내에서 메시지 복호화 처리 부분:

# 암호화된 메시지 복호화 시도
decrypted_message = None
# 복호화에는 자신의 user_id를 사용해야 함 (제공된 코드 방식)
# 제공된 코드: decrypt(user_id, encType, b64_ciphertext)
# 여기서 user_id는 자신의 user_id (메시지를 받는 사람의 user_id)
decrypt_user_id = MY_USER_ID if MY_USER_ID else (message_data.get("userId") or message_data.get("user_id"))
enc_type = message_data.get("encType", 31)

if DECRYPT_ENABLED and decrypt_user_id:
    try:
        # 숫자로 변환 시도 (큰 숫자도 처리)
        try:
            decrypt_user_id_int = int(decrypt_user_id)
        except (ValueError, OverflowError):
            decrypt_user_id_int = None
        
        if decrypt_user_id_int and decrypt_user_id_int > 0:
            decrypted_message = decrypt_message(message, v_field, decrypt_user_id_int, enc_type, debug=True)
            if decrypted_message:
                print(f"[✓] 메시지 복호화 성공: user_id={decrypt_user_id_int}, enc_type={enc_type}")
            else:
                print(f"[✗] 메시지 복호화 실패: user_id={decrypt_user_id_int}, enc_type={enc_type}")
    except Exception as e:
        # 복호화 실패는 무시 (암호화되지 않은 메시지일 수 있음)
        if message and len(message) > 10 and len(message) % 4 == 0:
            print(f"[경고] 복호화 오류: {type(e).__name__}: {e}")
        pass

# 복호화 성공하면 복호화된 메시지 사용, 실패하면 원본 사용
final_message = decrypted_message if decrypted_message else message
"""


# ===========================================
# 3. 채팅방 이름 복호화 로직
# ===========================================

"""
채팅방 이름 복호화 처리 부분:

if is_base64_like and KAKAODECRYPT_AVAILABLE and MY_USER_ID:
    print(f"[채팅방] 암호화된 이름 확인, 복호화 시도: chat_id={chat_id}")
    # enc 후보 추출
    enc_type_room = 31
    if v_field:
        try:
            if isinstance(v_field, str):
                v_parsed = json.loads(v_field)
                if isinstance(v_parsed, dict) and "enc" in v_parsed:
                    enc_type_room = v_parsed["enc"] or 31
        except:
            pass
    
    # private_meta에서 enc 정보 확인
    if room_data and room_data.get('raw_data'):
        raw_data = room_data.get('raw_data')
        if 'private_meta_parsed' in raw_data:
            private_meta = raw_data.get('private_meta_parsed')
            if isinstance(private_meta, dict) and 'enc' in private_meta:
                enc_type_room = private_meta['enc'] or 31
    
    # 복호화 시도
    enc_candidates = [enc_type_room, 31, 30]
    enc_candidates = list(dict.fromkeys(enc_candidates))
    
    for enc_try in enc_candidates:
        try:
            decrypt_user_id_int = int(MY_USER_ID)
            if decrypt_user_id_int > 0:
                decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, room_name_raw)
                if decrypted and decrypted != room_name_raw:
                    # 유효한 텍스트인지 확인
                    has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                    if not has_control_chars:
                        room_name_decrypted = decrypted
                        room_name_encrypted = room_name_raw
                        print(f"[✓ 채팅방] 복호화 성공: \"{decrypted}\" (enc={enc_try})")
                        break
        except Exception as e:
            continue
"""


# ===========================================
# 4. 핵심 원칙
# ===========================================

"""
복호화 로직 핵심 원칙:

1. 복호화는 send_to_server 함수 내에서만 처리
   - poll_messages에서는 복호화하지 않고 원본 메시지 전송
   - send_to_server에서 MY_USER_ID로 복호화 처리

2. 복호화에 사용하는 user_id
   - 메시지 복호화: MY_USER_ID (자신의 user_id)
   - 채팅방 이름 복호화: MY_USER_ID (자신의 user_id)

3. 복호화 실패 처리
   - 복호화 실패 시 원본 메시지 사용
   - 복호화 실패는 로그로 기록
   - 복호화 실패한 메시지도 서버로 전송 (서버에서 처리)

4. 복호화 모듈 우선순위
   - 1순위: KakaoDecrypt.decrypt() (kakaodecrypt 모듈)
   - 2순위: 자체 구현 복호화 로직
   - 3순위: base64 디코딩

5. 절대 수정 금지 사항
   - decrypt_message 함수의 기본 구조
   - send_to_server 내 복호화 처리 흐름
   - MY_USER_ID 사용 방식
   - 복호화 실패 시 원본 메시지 사용 원칙
"""


# ===========================================
# 5. 참고 정보
# ===========================================

"""
정상 작동 확인된 커밋:
- 55baa72 (2025-12-16 19:52:56): 정상 작동 코드
- 4ec5d73 (2025-12-16): 복호화 로직 정리 후 정상 작동

복호화 관련 파일:
- client/kakao_poller.py: 메인 복호화 로직
- client/kakaodecrypt.py: KakaoDecrypt 클래스 (외부 모듈)
- client/DECRYPTION_LOGIC_BACKUP.py: 이 백업 파일

복호화 테스트:
- 로컬에서 복호화 테스트 스크립트 실행 필요
- 복호화 성공률 확인
- 복호화 실패 케이스 분석
"""















