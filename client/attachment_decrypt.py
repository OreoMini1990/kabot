"""
Attachment 복호화 모듈 (Phase 2)
Iris ObserverHelper.kt 방식 기반 attachment 필드 복호화
"""

import json

# 복호화 모듈 import
try:
    from kakaodecrypt import KakaoDecrypt
    KAKAODECRYPT_AVAILABLE = True
except ImportError:
    KAKAODECRYPT_AVAILABLE = False
    KakaoDecrypt = None

# 복호화 실패 코드
DECRYPT_FAIL_REASON = {
    "EMPTY": "empty_attachment",
    "ALREADY_JSON": "already_json",
    "NOT_BASE64": "not_base64",
    "DECRYPT_API_FAIL": "decrypt_api_failed",
    "JSON_PARSE_FAIL": "json_parse_failed",
    "UNKNOWN": "unknown_error"
}

# msg_type whitelist: attachment 복호화가 필요한 타입들
ATTACHMENT_DECRYPT_WHITELIST = {
    "26",  # 답장 메시지
    "70", "71", "72", "73", "74", "75", "76", "77", "78", "79",  # 반응 메시지
    "2", "12", "27",  # 이미지 메시지
}


def decrypt_attachment(attachment, enc_type, my_user_id, message_type=None, message_id=None, debug=False):
    """
    attachment 필드 복호화 (Iris ObserverHelper.kt 방식)
    
    Args:
        attachment: attachment 필드 값 (문자열 또는 None)
        enc_type: 암호화 타입 (enc 값)
        my_user_id: 복호화에 사용할 user_id (MY_USER_ID)
        message_type: 메시지 타입 (선물 메시지는 복호화하지 않음)
        message_id: 메시지 ID (로깅용)
        debug: 디버그 로그 출력 여부
    
    Returns:
        복호화된 attachment (dict 또는 None)
    """
    fail_reason = None
    
    if not attachment or attachment == "{}" or attachment == "":
        fail_reason = DECRYPT_FAIL_REASON["EMPTY"]
        if debug:
            print(f"[attachment 복호화] ❌ {fail_reason}: msg_id={message_id}")
        return None
    
    # Iris 방식: 선물 메시지(type 71)는 복호화하지 않음
    if message_type == "71" or message_type == 71:
        if "선물" in str(attachment):
            if debug:
                print(f"[attachment 복호화] 선물 메시지 타입 71, 복호화 스킵: msg_id={message_id}")
            return None
    
    # 이미 JSON 형태인지 확인
    if isinstance(attachment, str):
        attachment_str = attachment.strip()
        if attachment_str.startswith('{') or attachment_str.startswith('['):
            # 이미 복호화된 JSON
            try:
                result = json.loads(attachment_str)
                if debug:
                    print(f"[attachment 복호화] ✅ 이미 JSON 형태: msg_id={message_id}, 길이={len(attachment_str)}")
                return result
            except json.JSONDecodeError as e:
                fail_reason = DECRYPT_FAIL_REASON["JSON_PARSE_FAIL"]
                if debug:
                    print(f"[attachment 복호화] ❌ {fail_reason}: msg_id={message_id}, 오류={e}")
                return None
    
    # 암호화되어 있는지 확인 (base64 형태)
    if isinstance(attachment, str):
        attachment_str = attachment.strip()
        # base64로 보이는지 확인 (길이 > 10, base64 문자만 포함)
        is_base64_like = (
            len(attachment_str) > 10 and
            not attachment_str.startswith('{') and
            all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in attachment_str[:100])
        )
        
        if is_base64_like and KAKAODECRYPT_AVAILABLE and my_user_id:
            try:
                decrypt_user_id_int = int(my_user_id)
                if decrypt_user_id_int > 0:
                    # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                    decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_type, attachment_str)
                    
                    if decrypted and decrypted != attachment_str:
                        # 복호화 성공, JSON 파싱 시도
                        try:
                            result = json.loads(decrypted)
                            if debug:
                                print(f"[attachment 복호화] ✅ 성공: msg_id={message_id}, enc={enc_type}, 길이={len(decrypted)}")
                            return result
                        except json.JSONDecodeError as e:
                            fail_reason = DECRYPT_FAIL_REASON["JSON_PARSE_FAIL"]
                            if debug:
                                print(f"[attachment 복호화] ❌ {fail_reason}: msg_id={message_id}, 오류={e}")
                            return None
                    else:
                        fail_reason = DECRYPT_FAIL_REASON["DECRYPT_API_FAIL"]
            except Exception as e:
                fail_reason = DECRYPT_FAIL_REASON["UNKNOWN"]
                if debug:
                    print(f"[attachment 복호화] ❌ 예외: msg_id={message_id}, 오류={type(e).__name__}: {e}")
        else:
            if not is_base64_like:
                fail_reason = DECRYPT_FAIL_REASON["NOT_BASE64"]
            elif not KAKAODECRYPT_AVAILABLE:
                fail_reason = "kakaodecrypt_unavailable"
            elif not my_user_id:
                fail_reason = "my_user_id_missing"
    
    # 실패 시 로깅
    if fail_reason and debug:
        print(f"[attachment 복호화] ❌ 실패: msg_id={message_id}, reason={fail_reason}, enc={enc_type}")
    
    return None

